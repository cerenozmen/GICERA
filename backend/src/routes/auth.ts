import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { DISPOSABLE_MESSAGE, isDisposableEmail } from "../data/disposableDomains";
import { AuthFailure, bearerToken, PASSWORD_MAX, passwordProblem } from "../services/authRules";
import * as auth from "../services/authService";
import { createRateLimiter } from "../services/forumRules";
import { asyncHandler } from "../utils/asyncHandler";

export const authRouter = Router();

// Credential guessing and mail floods: a few tries a minute per address.
const allowAttempt = createRateLimiter(10, 60_000);
const allowMail = createRateLimiter(3, 60_000);

const email = z.string().trim().toLowerCase().email("Geçerli bir e-posta adresi gir.").max(254);
// A new password (sign-up, reset, change); signing in only needs it non-empty so older passwords still work.
const password = z
  .string()
  .max(PASSWORD_MAX, `Şifre en fazla ${PASSWORD_MAX} karakter olabilir.`)
  .superRefine((value, ctx) => {
    const problem = passwordProblem(value);
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
  });
const currentPassword = z.string().min(1, "Mevcut parolanı gir.").max(PASSWORD_MAX);
const name = z.string().trim().max(40, "En fazla 40 karakter olabilir.");

// A new account's (or a changed) address must not be a throwaway mailbox; signing in or resetting stays open to any.
const permanentEmail = email.refine((value) => !isDisposableEmail(value), { message: DISPOSABLE_MESSAGE });

const credentialsBody = z.object({ email: permanentEmail, password });
const loginBody = z.object({ email, password: z.string().min(1, "Şifreni gir.").max(PASSWORD_MAX) });
const googleBody = z.object({ idToken: z.string().min(20).max(4096) });
const refreshBody = z.object({ refreshToken: z.string().min(5).max(512) });
const forgotBody = z.object({ email });
const recoveryBody = z.object({ accessToken: z.string().min(20).max(4096), refreshToken: z.string().min(5).max(512), password });
const profileBody = z.object({ firstName: name, lastName: name });
const emailBody = z.object({ currentPassword, newEmail: permanentEmail });
const passwordBody = z.object({ currentPassword, newPassword: password });

/** Parses the body or answers 400 with the first problem; null means the response is already sent. */
function parse<S extends z.ZodTypeAny>(schema: S, req: Request, res: Response): z.infer<S> | null {
  const parsed = schema.safeParse(req.body);
  if (parsed.success) return parsed.data;
  res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Geçersiz istek." });
  return null;
}

function token(req: Request, res: Response): string | null {
  const value = bearerToken(req.header("authorization"));
  if (!value) res.status(401).json({ error: "Oturumun sona ermiş. Tekrar giriş yap." });
  return value;
}

/** True (after answering 429) when this key is over its limit. */
function tooMany(res: Response, allowed: boolean): boolean {
  if (!allowed) res.status(429).json({ error: "Çok fazla deneme yaptın. Biraz bekleyip tekrar dene." });
  return !allowed;
}

authRouter.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const body = parse(credentialsBody, req, res);
    if (!body || tooMany(res, allowAttempt(`signup:${req.ip}`))) return;
    const result = await auth.signUp(body.email, body.password);
    res.status(201).json({ ...result, needsConfirmation: result.session === null });
  })
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const body = parse(loginBody, req, res);
    if (!body || tooMany(res, allowAttempt(`login:${req.ip}:${body.email}`))) return;
    res.json(await auth.signIn(body.email, body.password));
  })
);

authRouter.post(
  "/google",
  asyncHandler(async (req, res) => {
    const body = parse(googleBody, req, res);
    if (!body || tooMany(res, allowAttempt(`google:${req.ip}`))) return;
    res.json(await auth.signInWithGoogle(body.idToken));
  })
);

authRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const body = parse(refreshBody, req, res);
    if (!body) return;
    res.json(await auth.refresh(body.refreshToken));
  })
);

authRouter.post(
  "/forgot",
  asyncHandler(async (req, res) => {
    const body = parse(forgotBody, req, res);
    if (!body || tooMany(res, allowMail(`forgot:${req.ip}:${body.email}`))) return;
    await auth.requestPasswordReset(body.email);
    res.json({ ok: true });
  })
);

authRouter.post(
  "/recovery",
  asyncHandler(async (req, res) => {
    const body = parse(recoveryBody, req, res);
    if (!body || tooMany(res, allowAttempt(`recovery:${req.ip}`))) return;
    res.json(await auth.resetPasswordWithLink(body.accessToken, body.refreshToken, body.password));
  })
);

authRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    const accessToken = token(req, res);
    if (!accessToken) return;
    res.json({ user: await auth.userFromToken(accessToken) });
  })
);

authRouter.patch(
  "/profile",
  asyncHandler(async (req, res) => {
    const accessToken = token(req, res);
    const body = accessToken ? parse(profileBody, req, res) : null;
    if (!accessToken || !body) return;
    res.json({ user: await auth.updateName(accessToken, body.firstName, body.lastName) });
  })
);

authRouter.post(
  "/email",
  asyncHandler(async (req, res) => {
    const accessToken = token(req, res);
    const body = accessToken ? parse(emailBody, req, res) : null;
    if (!accessToken || !body || tooMany(res, allowAttempt(`email:${req.ip}`))) return;
    await auth.changeEmail(accessToken, body.currentPassword, body.newEmail);
    res.json({ ok: true });
  })
);

authRouter.post(
  "/password",
  asyncHandler(async (req, res) => {
    const accessToken = token(req, res);
    const body = accessToken ? parse(passwordBody, req, res) : null;
    if (!accessToken || !body || tooMany(res, allowAttempt(`password:${req.ip}`))) return;
    await auth.changePassword(accessToken, body.currentPassword, body.newPassword);
    res.json({ ok: true });
  })
);

// AuthFailure carries its own status and a Turkish message; anything else goes on to the 500 handler.
authRouter.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof AuthFailure) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  next(err);
});
