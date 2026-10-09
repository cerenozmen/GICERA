import { createClient, Session, SupabaseClient, User } from "@supabase/supabase-js";
import { env } from "../config/env";
import { supabase as admin } from "../db/supabaseClient";
import { AuthFailure, cleanName, isRecoveryToken, toAuthFailure } from "./authRules";

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  /** Unix seconds. */
  expiresAt: number;
}

export interface AuthResult {
  user: AuthUser;
  /** null when the project requires e-mail confirmation first. */
  session: AuthSession | null;
}

const SESSION_ENDED = "Oturumun sona ermiş. Tekrar giriş yap.";

/** A throwaway in-memory client: one per request, so no session leaks between users. */
function client(): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseAnonKey ?? env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function toUser(user: User): AuthUser {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const full = typeof meta.full_name === "string" ? meta.full_name : typeof meta.name === "string" ? meta.name : "";
  const [googleFirst = "", ...googleRest] = full.split(" ");
  return {
    id: user.id,
    email: user.email ?? "",
    firstName: typeof meta.first_name === "string" ? meta.first_name : googleFirst,
    lastName: typeof meta.last_name === "string" ? meta.last_name : googleRest.join(" "),
  };
}

function toSession(session: Session | null): AuthSession | null {
  if (!session) return null;
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in,
  };
}

function unwrap<T extends { error: { code?: string; status?: number; message?: string } | null }>(result: T): T {
  if (result.error) throw toAuthFailure(result.error);
  return result;
}

export async function signUp(email: string, password: string): Promise<AuthResult> {
  const { data } = unwrap(await client().auth.signUp({ email, password }));
  if (!data.user) throw new AuthFailure(502, "Hesap oluşturulamadı. Tekrar dene.");
  return { user: toUser(data.user), session: toSession(data.session) };
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const { data } = unwrap(await client().auth.signInWithPassword({ email, password }));
  if (!data.user || !data.session) throw new AuthFailure(401, "E-posta veya şifre hatalı.");
  return { user: toUser(data.user), session: toSession(data.session) };
}

/** Google sign-in: the app sends the ID token Google gave it; Supabase verifies it (needs the Google provider enabled). */
export async function signInWithGoogle(idToken: string): Promise<AuthResult> {
  const { data } = unwrap(await client().auth.signInWithIdToken({ provider: "google", token: idToken }));
  if (!data.user || !data.session) throw new AuthFailure(401, "Google ile giriş yapılamadı.");
  return { user: toUser(data.user), session: toSession(data.session) };
}

export async function refresh(refreshToken: string): Promise<AuthResult> {
  const { data } = unwrap(await client().auth.refreshSession({ refresh_token: refreshToken }));
  if (!data.user || !data.session) throw new AuthFailure(401, SESSION_ENDED);
  return { user: toUser(data.user), session: toSession(data.session) };
}

export async function userFromToken(accessToken: string): Promise<AuthUser> {
  const { data } = unwrap(await client().auth.getUser(accessToken));
  if (!data.user) throw new AuthFailure(401, SESSION_ENDED);
  return toUser(data.user);
}

/** Where the e-mailed link lands: the app's own scheme (declared in AndroidManifest). Must be in Supabase's Redirect URLs. */
export const RECOVERY_REDIRECT = "gicera://reset-password";

const LINK_INVALID = "Bağlantının süresi dolmuş veya geçersiz. Yeni bir bağlantı iste.";

/** Sends the recovery e-mail. Always succeeds from the caller's view, so it can't be used to find out who has an account. */
export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await client().auth.resetPasswordForEmail(email, { redirectTo: RECOVERY_REDIRECT });
  if (error && (error.status === 429 || error.code?.startsWith("over_"))) throw toAuthFailure(error);
}

/** Sets the new password with the session the e-mailed link opened the app with, and signs the user in. */
export async function resetPasswordWithLink(accessToken: string, refreshToken: string, newPassword: string): Promise<AuthResult> {
  if (!isRecoveryToken(accessToken)) throw new AuthFailure(401, LINK_INVALID);
  const supa = client();
  const { data } = unwrap(await supa.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }));
  if (!data.user) throw new AuthFailure(401, LINK_INVALID);
  unwrap(await supa.auth.updateUser({ password: newPassword }));
  const { data: current } = await supa.auth.getSession();
  return { user: toUser(data.user), session: toSession(current.session ?? data.session) };
}

export async function updateName(accessToken: string, firstName: string, lastName: string): Promise<AuthUser> {
  const current = await userFromToken(accessToken);
  const { data: existing } = await admin.auth.admin.getUserById(current.id);
  const meta = (existing.user?.user_metadata ?? {}) as Record<string, unknown>;
  const { data } = unwrap(
    await admin.auth.admin.updateUserById(current.id, {
      user_metadata: { ...meta, first_name: cleanName(firstName), last_name: cleanName(lastName) },
    })
  );
  if (!data.user) throw new AuthFailure(502, "Bilgiler kaydedilemedi.");
  return toUser(data.user);
}

/** Checks the current password by signing in with it, and hands back that fresh session's client. */
async function reauthenticate(accessToken: string, currentPassword: string): Promise<SupabaseClient> {
  const user = await userFromToken(accessToken);
  const supa = client();
  const { error } = await supa.auth.signInWithPassword({ email: user.email, password: currentPassword });
  if (error) throw error.code === "invalid_credentials" ? new AuthFailure(403, "Mevcut parola hatalı.") : toAuthFailure(error);
  return supa;
}

/** Starts an e-mail change: Supabase mails a confirmation to the new address and switches only once it's confirmed. */
export async function changeEmail(accessToken: string, currentPassword: string, newEmail: string): Promise<void> {
  const supa = await reauthenticate(accessToken, currentPassword);
  unwrap(await supa.auth.updateUser({ email: newEmail }));
}

export async function changePassword(accessToken: string, currentPassword: string, newPassword: string): Promise<void> {
  const supa = await reauthenticate(accessToken, currentPassword);
  unwrap(await supa.auth.updateUser({ password: newPassword }));
}
