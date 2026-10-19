export const PASSWORD_MIN = 8;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isEmail(value: string): boolean {
  return EMAIL.test(value.trim());
}

export const REQUIRED = "Bu alanın doldurulması zorunludur.";

/** Shown under a new-password box while it's focused, and as the error when the rule isn't met. */
export const PASSWORD_RULE = `Yeni parolanız şunları içermelidir: ${PASSWORD_MIN} veya daha fazla karakter, büyük harf, küçük harf, harfler ve sayılar.`;

/** What's wrong with a new password, or null when it's fine (the server checks the same rule again). */
export function passwordProblem(value: string): string | null {
  if (value.length > 72) return "Şifre en fazla 72 karakter olabilir.";
  const ok =
    value.length >= PASSWORD_MIN &&
    value !== value.toLowerCase() && // has an upper-case letter
    value !== value.toUpperCase() && // has a lower-case letter
    /\d/.test(value);
  return ok ? null : PASSWORD_RULE;
}

/** "Ayşe Nur" for the profile header; falls back to the e-mail's name part. */
export function displayName(user: { firstName: string; lastName: string; email: string }): string {
  const name = `${user.firstName} ${user.lastName}`.trim();
  return name || user.email.split("@")[0] || "Hesabım";
}

/** What's wrong with a first/last name (letters only, no digits or gibberish), or null when it's fine. `label` is "Ad" or "Soyad". */
export function nameProblem(value: string, label: string): string | null {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) return `${label} alanı zorunludur.`;
  if (name.length < 2) return `${label} en az 2 harf olmalı.`;
  if (name.length > 40) return `${label} en fazla 40 karakter olabilir.`;
  if (/\d/.test(name)) return `${label} rakam içeremez.`;
  if (!/^\p{L}+(?:[ '’-]\p{L}+)*$/u.test(name)) return `${label} yalnızca harflerden oluşmalı (boşluk, ' ve - kullanılabilir).`;
  if (/(.)\1{2,}/iu.test(name)) return `${label} geçerli görünmüyor.`;
  if (!/[aeıioöuüâîûéè]/i.test(name)) return `${label} geçerli görünmüyor.`;
  return null;
}
