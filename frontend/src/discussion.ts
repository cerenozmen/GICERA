import { colors } from "./theme";

export const CATEGORIES = ["Cilt bakımı", "İçerikler", "Rutin", "Ürün önerisi"] as const;

export function timeAgo(time: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(time)) / 60000));
  if (minutes < 1) return "şimdi";
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} saat önce`;
  const days = Math.floor(hours / 24);
  return `${days} gün önce`;
}

const AVATAR_TONES = [
  { bg: colors.primaryLight, fg: colors.primary },
  { bg: colors.accentLight, fg: colors.accentDark },
  { bg: colors.primary, fg: "#FFFFFF" },
  { bg: colors.accent, fg: "#FFFFFF" },
];

export function avatarTone(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}
