import { API_BASE_URL } from "./config";
import { storage } from "./storage";
import { ForumNotification, ForumPost, ForumReply } from "./types";

let devicePromise: Promise<string> | null = null;

/**
 * This phone's forum id: issued once by the server, then kept. It is the phone's secret (there are
 * no accounts): the server uses it to tell whose posts and likes are whose and never shows it.
 */
function deviceId(): Promise<string> {
  devicePromise ??= (async () => {
    const saved = await storage.loadForumDevice();
    if (saved) return saved;
    const { deviceId: issued } = await request<{ deviceId: string }>("POST", "/forum/devices", undefined, false);
    await storage.saveForumDevice(issued);
    return issued;
  })().catch((err) => {
    devicePromise = null;
    throw err;
  });
  return devicePromise;
}

async function request<T>(method: string, path: string, body?: unknown, withDevice = true): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (withDevice) headers["X-Device-Id"] = await deviceId();
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new Error("Sunucuya ulaşılamadı. İnternet bağlantını kontrol edip tekrar dene.");
  }
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { error?: string }).error ?? `Sunucu hatası (${response.status})`);
  return data as T;
}

export const forumApi = {
  notifications: () => request<{ notifications: ForumNotification[] }>("GET", "/forum/notifications").then((r) => r.notifications),
  listPosts: (filters: { category?: string; q?: string; saved?: boolean }) => {
    const params = new URLSearchParams();
    if (filters.category) params.set("category", filters.category);
    if (filters.q?.trim()) params.set("q", filters.q.trim());
    if (filters.saved) params.set("saved", "1");
    const query = params.toString();
    return request<{ posts: ForumPost[] }>("GET", `/forum/posts${query ? `?${query}` : ""}`).then((r) => r.posts);
  },
  getPost: (id: string) => request<{ post: ForumPost; replies: ForumReply[] }>("GET", `/forum/posts/${encodeURIComponent(id)}`),
  createPost: (input: { authorName: string; title: string; body: string; category: string }) =>
    request<{ post: ForumPost }>("POST", "/forum/posts", input).then((r) => r.post),
  deletePost: (id: string) => request<void>("DELETE", `/forum/posts/${encodeURIComponent(id)}`),
  createReply: (postId: string, input: { authorName: string; text: string }) =>
    request<{ reply: ForumReply }>("POST", `/forum/posts/${encodeURIComponent(postId)}/replies`, input).then((r) => r.reply),
  deleteReply: (id: string) => request<void>("DELETE", `/forum/replies/${encodeURIComponent(id)}`),
  setPostLike: (id: string, on: boolean) => request<{ count: number }>(on ? "PUT" : "DELETE", `/forum/posts/${encodeURIComponent(id)}/like`),
  setPostSaved: (id: string, on: boolean) => request<{ count: number }>(on ? "PUT" : "DELETE", `/forum/posts/${encodeURIComponent(id)}/save`),
  setReplyLike: (id: string, on: boolean) => request<{ count: number }>(on ? "PUT" : "DELETE", `/forum/replies/${encodeURIComponent(id)}/like`),
};
