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
  { bg: "#E6EEE7", fg: "#1F4D3A" },
  { bg: "#FCE9DF", fg: "#C2551F" },
  { bg: "#EDE7F3", fg: "#5B4A7A" },
  { bg: "#E4EEF3", fg: "#2F5A6E" },
];

export function avatarTone(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}
