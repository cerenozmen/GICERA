export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

export const PASSWORD_RULE = `Yeni parolanız şunları içermelidir: ${PASSWORD_MIN} veya daha fazla karakter, büyük harf, küçük harf, harfler ve sayılar.`;

/** Same rule the app checks: 8+ characters with an upper-case letter, a lower-case letter and a digit. */
export function passwordProblem(value: string): string | null {
  const ok =
    value.length >= PASSWORD_MIN &&
    value !== value.toLowerCase() &&
    value !== value.toUpperCase() &&
    /\d/.test(value);
  return ok ? null : PASSWORD_RULE;
}

const SESSION_ENDED = "Oturumun sona ermiş. Tekrar giriş yap.";

/** Supabase error codes -> the Turkish line the app shows (status picks 4xx over a generic 500). */
const MESSAGES: Record<string, { status: number; message: string }> = {
  invalid_credentials: { status: 401, message: "E-posta veya şifre hatalı." },
  email_not_confirmed: { status: 403, message: "E-postanı henüz doğrulamadın. Gelen kutundaki bağlantıya dokun." },
  user_already_exists: { status: 409, message: "Bu e-posta ile zaten bir hesap var. Giriş yapmayı dene." },
  email_exists: { status: 409, message: "Bu e-posta ile zaten bir hesap var." },
  weak_password: { status: 400, message: "Bu şifre çok kolay tahmin edilebilir. Daha güçlü bir şifre seç." },
  same_password: { status: 400, message: "Yeni şifre mevcut şifreyle aynı olamaz." },
  email_address_invalid: { status: 400, message: "Geçerli bir e-posta adresi gir." },
  otp_expired: { status: 400, message: "Kodun süresi dolmuş veya geçersiz. Yeni bir kod iste." },
  over_request_rate_limit: { status: 429, message: "Çok fazla deneme yaptın. Biraz bekleyip tekrar dene." },
  over_email_send_rate_limit: { status: 429, message: "Kısa sürede çok fazla e-posta istedin. Biraz bekleyip tekrar dene." },
  signup_disabled: { status: 403, message: "Kayıt şu an kapalı." },
  provider_disabled: { status: 503, message: "Google ile giriş henüz etkinleştirilmemiş." },
  bad_jwt: { status: 401, message: SESSION_ENDED },
  session_not_found: { status: 401, message: SESSION_ENDED },
  refresh_token_not_found: { status: 401, message: SESSION_ENDED },
  refresh_token_already_used: { status: 401, message: SESSION_ENDED },
};

export class AuthFailure extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Maps a Supabase auth error (code, else HTTP status) to an AuthFailure; unknown ones stay generic so internals don't leak. */
export function toAuthFailure(err: { code?: string; status?: number; message?: string }): AuthFailure {
  const known = err.code ? MESSAGES[err.code] : undefined;
  if (known) return new AuthFailure(known.status, known.message);
  if (err.status === 429) return new AuthFailure(429, MESSAGES.over_request_rate_limit.message);
  if (err.status === 401 || err.status === 403) return new AuthFailure(401, SESSION_ENDED);
  if (err.status && err.status >= 400 && err.status < 500) return new AuthFailure(400, "İşlem tamamlanamadı. Bilgilerini kontrol edip tekrar dene.");
  return new AuthFailure(502, "Hesap servisine şu an ulaşılamıyor. Biraz sonra tekrar dene.");
}

/** How long after the link was opened its token may still set a new password. */
const RECOVERY_WINDOW_S = 30 * 60;

/** `amr` methods Supabase stamps on a session that came from an e-mailed link (never on a password or Google sign-in). */
const LINK_METHODS = new Set(["recovery", "otp", "magiclink"]);

/**
 * True when an access token came from a just-opened password-recovery link. The reset endpoint takes a
 * token with no current password, so an ordinary sign-in token must not be accepted there. The token's
 * signature isn't checked here: Supabase validates it when the session is set.
 */
export function isRecoveryToken(token: string, nowSeconds: number = Date.now() / 1000): boolean {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as { iat?: unknown; amr?: unknown };
    const methods = Array.isArray(payload.amr) ? payload.amr.map((a: { method?: unknown }) => a?.method) : [];
    const fresh = typeof payload.iat === "number" && nowSeconds - payload.iat <= RECOVERY_WINDOW_S;
    return fresh && methods.some((m) => typeof m === "string" && LINK_METHODS.has(m));
  } catch {
    return false;
  }
}

/** The bearer token of an `Authorization` header, or null. */
export function bearerToken(header: string | undefined): string | null {
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

/** Names are free text but stored in user metadata: trim, collapse spaces, cap the length. */
export function cleanName(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 40);
}
