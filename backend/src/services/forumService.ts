import { randomUUID } from "crypto";
import { supabase } from "../db/supabaseClient";
import { embeddedCount, ForumCategory, sanitizeSearch } from "./forumRules";

const PAGE_SIZE = 30;

export interface ForumPost {
  id: string;
  authorName: string;
  title: string;
  body: string;
  category: ForumCategory;
  createdAt: string;
  replyCount: number;
  likeCount: number;
  liked: boolean;
  saved: boolean;
  /** Written from the requesting device (it may delete it). */
  mine: boolean;
}

export interface ForumReply {
  id: string;
  postId: string;
  authorName: string;
  text: string;
  createdAt: string;
  likeCount: number;
  liked: boolean;
  mine: boolean;
}

/** Thrown for a missing post/reply or one the device may not change; the route answers with `status`. */
export class ForumError extends Error {
  constructor(public status: 403 | 404, message: string) {
    super(message);
  }
}

/** A fresh device id: the secret a phone writes with (there are no accounts). */
export function issueDeviceId(): string {
  return randomUUID();
}

interface PostRow {
  id: string;
  device_id: string;
  author_name: string;
  title: string;
  body: string;
  category: ForumCategory;
  created_at: string;
  forum_replies: unknown;
  forum_post_likes: unknown;
}

interface ReplyRow {
  id: string;
  post_id: string;
  device_id: string;
  author_name: string;
  text: string;
  created_at: string;
  forum_reply_likes: unknown;
}

const POST_COLUMNS = "id, device_id, author_name, title, body, category, created_at, forum_replies(count), forum_post_likes(count)";
const REPLY_COLUMNS = "id, post_id, device_id, author_name, text, created_at, forum_reply_likes(count)";

export function toPost(row: PostRow, deviceId: string | null, liked: Set<string>, saved: Set<string>): ForumPost {
  return {
    id: row.id,
    authorName: row.author_name,
    title: row.title,
    body: row.body,
    category: row.category,
    createdAt: row.created_at,
    replyCount: embeddedCount(row.forum_replies),
    likeCount: embeddedCount(row.forum_post_likes),
    liked: liked.has(row.id),
    saved: saved.has(row.id),
    mine: !!deviceId && row.device_id === deviceId,
  };
}

function toReply(row: ReplyRow, deviceId: string | null, liked: Set<string>): ForumReply {
  return {
    id: row.id,
    postId: row.post_id,
    authorName: row.author_name,
    text: row.text,
    createdAt: row.created_at,
    likeCount: embeddedCount(row.forum_reply_likes),
    liked: liked.has(row.id),
    mine: !!deviceId && row.device_id === deviceId,
  };
}

function fail(action: string, error: { message: string } | null): void {
  if (error) throw new Error(`Supabase ${action} failed: ${error.message}`);
}

/** The ids among `ids` that `deviceId` has a row for in `table` (likes, saves). */
async function markedBy(table: string, column: string, ids: string[], deviceId: string | null): Promise<Set<string>> {
  if (!deviceId || ids.length === 0) return new Set();
  const { data, error } = await supabase.from(table).select(column).eq("device_id", deviceId).in(column, ids);
  fail(`${table} select`, error);
  return new Set((data as unknown as Record<string, string>[]).map((row) => row[column]));
}

async function decoratePosts(rows: PostRow[], deviceId: string | null): Promise<ForumPost[]> {
  const ids = rows.map((r) => r.id);
  const [liked, saved] = await Promise.all([
    markedBy("forum_post_likes", "post_id", ids, deviceId),
    markedBy("forum_saved_posts", "post_id", ids, deviceId),
  ]);
  return rows.map((row) => toPost(row, deviceId, liked, saved));
}

export async function listPosts(options: {
  deviceId: string | null;
  category?: ForumCategory;
  query?: string;
  /** Paging: posts created before this time. */
  before?: string;
  savedOnly?: boolean;
}): Promise<ForumPost[]> {
  let request = supabase.from("forum_posts").select(POST_COLUMNS).order("created_at", { ascending: false }).limit(PAGE_SIZE);
  if (options.category) request = request.eq("category", options.category);
  if (options.before) request = request.lt("created_at", options.before);
  const query = options.query ? sanitizeSearch(options.query) : "";
  if (query) request = request.or(`title.ilike.%${query}%,body.ilike.%${query}%`);
  if (options.savedOnly) {
    if (!options.deviceId) return [];
    const { data, error } = await supabase.from("forum_saved_posts").select("post_id").eq("device_id", options.deviceId);
    fail("forum_saved_posts select", error);
    const ids = (data ?? []).map((row) => row.post_id as string);
    if (ids.length === 0) return [];
    request = request.in("id", ids);
  }
  const { data, error } = await request;
  fail("forum_posts select", error);
  return decoratePosts((data ?? []) as unknown as PostRow[], options.deviceId);
}

async function getPostRow(postId: string): Promise<PostRow> {
  const { data, error } = await supabase.from("forum_posts").select(POST_COLUMNS).eq("id", postId).maybeSingle();
  fail("forum_posts select", error);
  if (!data) throw new ForumError(404, "Konu bulunamadı.");
  return data as unknown as PostRow;
}

export async function getPost(postId: string, deviceId: string | null): Promise<{ post: ForumPost; replies: ForumReply[] }> {
  const row = await getPostRow(postId);
  const [[post], replyResult] = await Promise.all([
    decoratePosts([row], deviceId),
    supabase.from("forum_replies").select(REPLY_COLUMNS).eq("post_id", postId).order("created_at", { ascending: false }).limit(500),
  ]);
  fail("forum_replies select", replyResult.error);
  const replyRows = (replyResult.data ?? []) as unknown as ReplyRow[];
  const liked = await markedBy("forum_reply_likes", "reply_id", replyRows.map((r) => r.id), deviceId);
  return { post, replies: replyRows.map((r) => toReply(r, deviceId, liked)) };
}

export async function createPost(input: { deviceId: string; authorName: string; title: string; body: string; category: ForumCategory }): Promise<ForumPost> {
  const { data, error } = await supabase
    .from("forum_posts")
    .insert({ device_id: input.deviceId, author_name: input.authorName, title: input.title, body: input.body, category: input.category })
    .select(POST_COLUMNS)
    .single();
  fail("forum_posts insert", error);
  return toPost(data as unknown as PostRow, input.deviceId, new Set(), new Set());
}

export async function createReply(input: { deviceId: string; postId: string; authorName: string; text: string }): Promise<ForumReply> {
  await getPostRow(input.postId);
  const { data, error } = await supabase
    .from("forum_replies")
    .insert({ post_id: input.postId, device_id: input.deviceId, author_name: input.authorName, text: input.text })
    .select(REPLY_COLUMNS)
    .single();
  fail("forum_replies insert", error);
  return toReply(data as unknown as ReplyRow, input.deviceId, new Set());
}

/** Deletes a post (its replies, likes and saves go with it): only from the device that wrote it. */
export async function deletePost(postId: string, deviceId: string): Promise<void> {
  const row = await getPostRow(postId);
  if (row.device_id !== deviceId) throw new ForumError(403, "Yalnızca kendi konunu silebilirsin.");
  const { error } = await supabase.from("forum_posts").delete().eq("id", postId);
  fail("forum_posts delete", error);
}

export async function deleteReply(replyId: string, deviceId: string): Promise<void> {
  const { data, error } = await supabase.from("forum_replies").select("device_id").eq("id", replyId).maybeSingle();
  fail("forum_replies select", error);
  if (!data) throw new ForumError(404, "Yanıt bulunamadı.");
  if (data.device_id !== deviceId) throw new ForumError(403, "Yalnızca kendi yanıtını silebilirsin.");
  const { error: deleteError } = await supabase.from("forum_replies").delete().eq("id", replyId);
  fail("forum_replies delete", deleteError);
}

type Mark = { table: "forum_post_likes" | "forum_saved_posts"; column: "post_id" } | { table: "forum_reply_likes"; column: "reply_id" };

const MARKS = {
  postLike: { table: "forum_post_likes", column: "post_id" },
  postSave: { table: "forum_saved_posts", column: "post_id" },
  replyLike: { table: "forum_reply_likes", column: "reply_id" },
} satisfies Record<string, Mark>;

/**
 * Sets or clears one device's like/save on a post or reply (idempotent), answering with the new
 * like count. A missing target is a 404 (the foreign key refuses the row).
 */
export async function setMark(kind: keyof typeof MARKS, targetId: string, deviceId: string, on: boolean): Promise<{ count: number }> {
  const { table, column } = MARKS[kind];
  if (on) {
    const { error } = await supabase.from(table).upsert({ [column]: targetId, device_id: deviceId }, { onConflict: `${column},device_id`, ignoreDuplicates: true });
    if (error?.code === "23503") throw new ForumError(404, kind === "replyLike" ? "Yanıt bulunamadı." : "Konu bulunamadı.");
    fail(`${table} upsert`, error);
  } else {
    const { error } = await supabase.from(table).delete().eq(column, targetId).eq("device_id", deviceId);
    fail(`${table} delete`, error);
  }
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true }).eq(column, targetId);
  fail(`${table} count`, error);
  return { count: count ?? 0 };
}

export interface ForumNotification {
  replyId: string;
  postId: string;
  postTitle: string;
  authorName: string;
  text: string;
  createdAt: string;
}

/** Recent replies others wrote under this device's posts (the bell). */
export async function listNotifications(deviceId: string): Promise<ForumNotification[]> {
  const { data: mine, error } = await supabase.from("forum_posts").select("id, title").eq("device_id", deviceId).limit(200);
  fail("forum_posts select", error);
  if (!mine?.length) return [];
  const titles = new Map(mine.map((p) => [p.id as string, p.title as string]));
  const { data, error: replyError } = await supabase
    .from("forum_replies")
    .select("id, post_id, author_name, text, created_at")
    .in("post_id", [...titles.keys()])
    .neq("device_id", deviceId)
    .order("created_at", { ascending: false })
    .limit(40);
  fail("forum_replies select", replyError);
  return (data ?? []).map((r) => ({
    replyId: r.id,
    postId: r.post_id,
    postTitle: titles.get(r.post_id) ?? "",
    authorName: r.author_name,
    text: r.text,
    createdAt: r.created_at,
  }));
}
