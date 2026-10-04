import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import {
  createPost,
  createReply,
  deletePost,
  deleteReply,
  ForumError,
  getPost,
  issueDeviceId,
  listNotifications,
  listPosts,
  setMark,
} from "../services/forumService";
import { createRateLimiter, DEVICE_ID, FORUM_CATEGORIES, UUID } from "../services/forumRules";
import { asyncHandler } from "../utils/asyncHandler";

// Writes per device: 6 posts/replies a minute.
const allowWrite = createRateLimiter(6, 60_000);

const authorName = z.string().trim().min(2, "Takma ad en az 2 karakter olmalı.").max(30, "Takma ad en fazla 30 karakter olabilir.");

const postSchema = z.object({
  authorName,
  title: z.string().trim().min(3, "Başlık en az 3 karakter olmalı.").max(120, "Başlık en fazla 120 karakter olabilir."),
  body: z.string().trim().min(3, "Açıklama en az 3 karakter olmalı.").max(4000, "Açıklama en fazla 4000 karakter olabilir."),
  category: z.enum(FORUM_CATEGORIES, { errorMap: () => ({ message: "Geçersiz kategori." }) }),
});

const replySchema = z.object({
  authorName,
  text: z.string().trim().min(1, "Yanıt boş olamaz.").max(2000, "Yanıt en fazla 2000 karakter olabilir."),
});

const listSchema = z.object({
  category: z.enum(FORUM_CATEGORIES).optional(),
  q: z.string().max(200).optional(),
  before: z.string().datetime({ offset: true }).optional(),
  saved: z.enum(["1", "true"]).optional(),
});

/** The requesting phone's id (`X-Device-Id`), or null when missing or malformed. */
function deviceOf(req: Request): string | null {
  const value = req.header("x-device-id");
  return value && DEVICE_ID.test(value) ? value.toLowerCase() : null;
}

function requireDevice(req: Request, res: Response): string | null {
  const deviceId = deviceOf(req);
  if (!deviceId) res.status(401).json({ error: "Cihaz kimliği eksik. Uygulamayı yeniden açıp tekrar dene." });
  return deviceId;
}

/** Route ids are UUIDs: a malformed one is a missing post, not a database error. */
function validId(id: string, res: Response, what = "Konu"): boolean {
  if (UUID.test(id)) return true;
  res.status(404).json({ error: `${what} bulunamadı.` });
  return false;
}

export const forumRouter = Router();

// POST /api/forum/devices: a new device id (there are no accounts; the phone keeps it as its secret).
forumRouter.post("/devices", (_req, res) => {
  res.status(201).json({ deviceId: issueDeviceId() });
});

// GET /api/forum/notifications: replies others wrote under this device's posts.
forumRouter.get(
  "/notifications",
  asyncHandler(async (req, res) => {
    const deviceId = requireDevice(req, res);
    if (!deviceId) return;
    res.json({ notifications: await listNotifications(deviceId) });
  })
);

// GET /api/forum/posts?category=&q=&before=&saved=1
forumRouter.get(
  "/posts",
  asyncHandler(async (req, res) => {
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Geçersiz filtre." });
      return;
    }
    const { category, q, before, saved } = parsed.data;
    const posts = await listPosts({ deviceId: deviceOf(req), category, query: q, before, savedOnly: !!saved });
    res.json({ posts });
  })
);

forumRouter.post(
  "/posts",
  asyncHandler(async (req, res) => {
    const deviceId = requireDevice(req, res);
    if (!deviceId) return;
    const parsed = postSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Geçersiz istek." });
      return;
    }
    if (!allowWrite(deviceId)) {
      res.status(429).json({ error: "Çok hızlı paylaşım yapıyorsun. Biraz bekleyip tekrar dene." });
      return;
    }
    const post = await createPost({ deviceId, ...parsed.data });
    res.status(201).json({ post });
  })
);

forumRouter.get(
  "/posts/:id",
  asyncHandler(async (req, res) => {
    if (!validId(req.params.id, res)) return;
    res.json(await getPost(req.params.id, deviceOf(req)));
  })
);

forumRouter.delete(
  "/posts/:id",
  asyncHandler(async (req, res) => {
    const deviceId = requireDevice(req, res);
    if (!deviceId || !validId(req.params.id, res)) return;
    await deletePost(req.params.id, deviceId);
    res.status(204).end();
  })
);

forumRouter.post(
  "/posts/:id/replies",
  asyncHandler(async (req, res) => {
    const deviceId = requireDevice(req, res);
    if (!deviceId || !validId(req.params.id, res)) return;
    const parsed = replySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Geçersiz istek." });
      return;
    }
    if (!allowWrite(deviceId)) {
      res.status(429).json({ error: "Çok hızlı yanıt yazıyorsun. Biraz bekleyip tekrar dene." });
      return;
    }
    const reply = await createReply({ deviceId, postId: req.params.id, ...parsed.data });
    res.status(201).json({ reply });
  })
);

forumRouter.delete(
  "/replies/:id",
  asyncHandler(async (req, res) => {
    const deviceId = requireDevice(req, res);
    if (!deviceId || !validId(req.params.id, res, "Yanıt")) return;
    await deleteReply(req.params.id, deviceId);
    res.status(204).end();
  })
);

// PUT sets, DELETE clears: likes and saves are idempotent, so a retried tap can't double count.
const MARK_ROUTES = [
  { path: "/posts/:id/like", kind: "postLike", what: "Konu" },
  { path: "/posts/:id/save", kind: "postSave", what: "Konu" },
  { path: "/replies/:id/like", kind: "replyLike", what: "Yanıt" },
] as const;

for (const { path, kind, what } of MARK_ROUTES) {
  for (const on of [true, false]) {
    forumRouter[on ? "put" : "delete"](
      path,
      asyncHandler(async (req, res) => {
        const deviceId = requireDevice(req, res);
        if (!deviceId || !validId(req.params.id, res, what)) return;
        res.json(await setMark(kind, req.params.id, deviceId, on));
      })
    );
  }
}

// ForumError carries its own status (404 missing, 403 not yours); anything else goes on to the 500 handler.
forumRouter.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof ForumError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  next(err);
});
