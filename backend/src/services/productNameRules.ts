/** The model's reply as a short product name: one line, no quotes or full stop, never long. Null when it is empty or a refusal. */
export function nameFromReply(reply: string | null | undefined): string | null {
  const line = (reply ?? "").split(/\r?\n/).find((l) => l.trim()) ?? "";
  const name = line
    .replace(/^(ad|isim|ürün adı)\s*[:\-–]\s*/i, "")
    .replace(/^["'“”«»`*\s]+|["'“”«»`*.\s]+$/g, "")
    .trim();
  if (!name || name.length > 60 || /bilinmiyor|kendi taramam|içerik taraması/i.test(name)) return null;
  return name;
}
