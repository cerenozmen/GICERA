/**
 * What the app was opened with by an e-mailed link: "şifreni yenile" (a session for setting a new password)
 * or the sign-up confirmation (`signup`: the address is confirmed, the session signs in). Supabase only
 * redirects to this one address, so both land here.
 */
export type RecoveryLink = { accessToken: string; refreshToken: string; signup?: true } | { failed: true };

/** The address the e-mailed link ends at; the backend asks Supabase to redirect here, AndroidManifest claims it. */
export const RECOVERY_URL = "gicera://reset-password";

/**
 * Reads `gicera://reset-password#access_token=…&refresh_token=…&type=recovery` (Supabase puts the session in
 * the fragment) or its error form (`#error=access_denied&error_code=otp_expired`). Anything else is not ours: null.
 */
export function parseRecoveryLink(url: string | null): RecoveryLink | null {
  if (!url || !url.startsWith(RECOVERY_URL)) return null;
  const rest = url.slice(RECOVERY_URL.length);
  const query = rest.slice(1); // after the "#" (or "?")
  if (rest !== "" && rest[0] !== "#" && rest[0] !== "?") return null;

  const params: Record<string, string> = {};
  try {
    for (const pair of query.split("&")) {
      if (!pair) continue;
      const [key, ...value] = pair.split("=");
      params[decodeURIComponent(key)] = decodeURIComponent(value.join("=").replace(/\+/g, " "));
    }
  } catch {
    return null;
  }

  if (params.access_token && params.refresh_token && (params.type === undefined || params.type === "recovery")) {
    return { accessToken: params.access_token, refreshToken: params.refresh_token };
  }
  if (params.access_token && params.refresh_token && params.type === "signup") {
    return { accessToken: params.access_token, refreshToken: params.refresh_token, signup: true };
  }
  if (params.error || params.error_code) return { failed: true };
  return null;
}
