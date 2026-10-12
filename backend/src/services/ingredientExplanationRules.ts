/**
 * The key an ingredient name is stored and looked up under: lower case, surrounding spaces dropped
 * and inner runs collapsed, so "Sodyum Benzoat" and "sodyum  benzoat " hit the same row. Turkish
 * İ folds to plain i (and I to i, not the locale's ı) so an all-caps INCI name ("SODIUM BENZOATE")
 * matches its mixed-case reading.
 */
export function normalizeIngredientName(name: string): string {
  return name.normalize("NFC").replace(/İ/g, "i").toLowerCase().replace(/\s+/g, " ").trim();
}

/** What the model answers for a name that isn't a real ingredient (often an OCR misread). */
export const UNKNOWN_MARKER = "BILINMIYOR";

/** The model's answer as an explanation to store, or null when it didn't recognise the name. */
export function explanationFromReply(reply: string | null | undefined): string | null {
  const text = (reply ?? "").trim();
  const head = normalizeIngredientName(text.slice(0, 20)).replace(/ı/g, "i");
  if (!text || head.startsWith("bilinmiyor")) return null;
  return text.slice(0, 2000);
}
