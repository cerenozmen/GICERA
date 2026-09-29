import { Product } from "./types";

/**
 * Lower case as Turkish has it (İ → i, I → ı), without the locale-aware toLocaleLowerCase: on the
 * phone (Hermes on Android) that call costs about 1 ms, and the scanner makes thousands per frame (a
 * real scan spent 2-6 s per frame and froze 45 s rebuilding its list). Same length as the text.
 */
export const lowerTr = (text: string) => text.replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase();

/** Comma/semicolon split that ignores separators inside parentheses (mirrors the backend tokenizer). */
export function parseIngredients(text: string | null | undefined): string[] {
  if (!text) return [];
  const tokens: string[] = [];
  let current = "";
  let depth = 0;
  for (const char of text) {
    if (char === "(") depth++;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if ((char === "," || char === ";") && depth === 0) {
      tokens.push(current.trim());
      current = "";
    } else if (depth === 0) current += char;
  }
  tokens.push(current.trim());
  return tokens.map((t) => t.replace(/\s+/g, " ")).filter((t) => t.length > 0);
}

export type IngredientListReading =
  | { status: "ok"; ingredientsText: string }
  /** partial: list cut off at the photo edge; unreadable: too little legible text; no_list: no ingredient list found. */
  | { status: "partial" | "unreadable" | "no_list"; ingredientsText: null };

// Case-insensitive regexes don't pair Turkish İ/ı with i/I, so every "i" accepts all four forms.
const anyI = (pattern: string) => pattern.replace(/i/g, "[iIİı]");

// OCR reads a leading "İ"/"I" as "l" or "|" ("lçindekiler:" in every frame of a real tube scan).
const HEADING_WORD = `(?:${anyI("(?:içindekiler|içerik(?:ler)?|bileşenler|ingr[eé]dients?|ingredientes|ingredienti|zutaten|composition|inci)")}|[l|]${anyI("(?:çindekiler|çerik(?:ler)?|ngr[eé]dients?)")})`;
// "Ingredients:", "İÇİNDEKİLER / INGREDIENTS:" or a heading alone on its line.
export const LIST_HEADING = new RegExp(`^[\\s•*]*${HEADING_WORD}(?:\\s*[/|]\\s*${HEADING_WORD})*\\s*(?:[:：\\-–]\\s*|$)`, "iu");
// Same heading without the colon, as OCR sometimes drops it ("Ingredients Aqua, ...").
export const LEADING_HEADING = new RegExp(`^[\\s•*]*${HEADING_WORD}(?:\\s*[/|]\\s*${HEADING_WORD})*(?!\\p{L})\\s*[:：\\-–]?\\s*`, "iu");

/** Levenshtein distance, giving up (returning max + 1) once it must exceed `max`. */
function boundedDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > max) return max + 1;
    previous = current;
  }
  return previous[b.length];
}

// Letters OCR swaps for i/İ/l in small print, folded together (in the heading word and in the reading).
const foldHeading = (word: string) => lowerTr(word).replace(/[lı|!1]/g, "i").replace(/ç/g, "c");
/** Long heading words, with the edits a garbled reading may be from them. Long, so no ordinary word is this close. */
const GARBLED_HEADINGS: [string, number][] = [[foldHeading("içindekiler"), 3], [foldHeading("ingredients"), 2]];

/**
 * The prefix of a row that is a list heading OCR garbled past HEADING_WORD ("lindeliler:",
 * "ondeliler: Aqua", "lçindekiler Aqua, Dimethicone" in a real tube scan, where no frame read the
 * heading right): a 9+ letter first word within a few edits of "içindekiler" or "ingredients",
 * followed by list text (a capitalised name, and two commas: one heading-like word and a comma on an
 * arced jar row isn't a list's start). Not for a heading word the patterns read ("INGREDIENTS Aqua,"),
 * which has its own rules. Null when there is none.
 */
export function garbledHeading(text: string): string | null {
  if (LEADING_HEADING.test(text)) return null;
  const match = /^[\s•*]*([^\s:,.;]{9,14})(\s*[:：]\s*|\s+)/u.exec(text);
  if (!match) return null;
  const word = foldHeading(match[1]);
  if (!GARBLED_HEADINGS.some(([heading, max]) => boundedDistance(word, heading, max) <= max)) return null;
  const rest = text.slice(match[0].length).replace(/^[\s:：]+/, "");
  return /^\p{Lu}/u.test(rest) && (rest.match(/,/g) ?? []).length >= 2 ? match[0] : null;
}

/** The row without its list heading, read right or garbled. */
export function stripHeading(text: string): string {
  if (LEADING_HEADING.test(text)) return text.replace(LEADING_HEADING, "");
  const heading = garbledHeading(text);
  return heading === null ? text : text.slice(heading.length).replace(/^[\s:：]+/, "");
}

// Where the list ends: the next section of the label.
export const STOP_LINE = new RegExp(
  `^[\\s•]*(?:\\*|${anyI(
    [
      "kullanım", "kullanma", "uyarı", "dikkat", "saklama", "muhafaza", "üretici", "üretim", "ithalatçı", "dağıtıcı", "menşe",
      "besin değer", "enerji", "made in", "produced", "manufactured", "distributed", "directions", "how to use", "usage",
      "warning", "caution", "precaution", "storage", "store ", "keep ", "nutrition", "energy", "lot\\b", "batch", "exp\\b",
      "skt\\b", "tett\\b", "parti\\b", "net\\b", "www\\.", "http", "tel\\b", "e-?mail", "pao\\b", "℮",
    ].join("|")
  )}|\\d+(?:[.,]\\d+)?\\s*(?:ml|g|gr|kg|l|oz|fl)\\b)`,
  "iu"
);

interface OcrLine {
  text: string;
  block: number;
}

/** True when the text stops mid-list: trailing separator/hyphen or an unclosed bracket. */
export function endsOpen(text: string): boolean {
  const opened = (text.match(/[([]/g) ?? []).length;
  const closed = (text.match(/[)\]]/g) ?? []).length;
  return /[,;\-(/]\s*$/.test(text) || opened > closed;
}

/** Joins OCR lines, rejoining words hyphenated across a line break ("Sul-" + "fate", "PEG-" + "40"). */
export function joinLines(parts: string[]): string {
  return parts.reduce((acc, part) => {
    if (!acc) return part;
    if (acc.endsWith("-")) return /^\p{Ll}/u.test(part) ? acc.slice(0, -1) + part : acc + part;
    return `${acc} ${part}`;
  }, "");
}

interface CollectedList {
  text: string;
  truncated: boolean;
  /** The lines the list was read from: [start, end). */
  start: number;
  end: number;
}

/** Collects list lines from `start` until the next label section; `truncated` when the list stops mid-item. */
function collectList(lines: OcrLine[], start: number, first: string): CollectedList {
  const parts = first ? [first] : [];
  for (let i = start + 1; i < lines.length; i++) {
    const { text, block } = lines[i];
    if (LIST_HEADING.test(text) || STOP_LINE.test(text)) {
      // A list still ending in "," when the next section starts was cut off (e.g. an upside-down photo).
      const collected = joinLines(parts);
      return { text: collected, truncated: !collected || endsOpen(collected), start, end: i };
    }
    const soFar = parts[parts.length - 1];
    if (soFar && !endsOpen(joinLines(parts)) && !text.includes(",")) {
      // A finished sentence (possibly followed by a batch code: "CI 77891. (LO519)") or a new block
      // without commas is no longer the list.
      if (/\.\s*(\([^()]*\))?$/.test(soFar) || block !== lines[i - 1].block) {
        return { text: joinLines(parts), truncated: false, start, end: i };
      }
    }
    parts.push(text);
  }
  const text = joinLines(parts);
  return { text, truncated: !text || endsOpen(text), start, end: lines.length };
}

const countCommas = (text: string) => (text.match(/,/g) ?? []).length;

/** Splits on top-level commas/semicolons, keeping parenthesised groups (and their commas) intact. */
function splitTopLevel(text: string): string[] {
  const items: string[] = [];
  let current = "";
  let depth = 0;
  for (const char of text) {
    if (char === "(" || char === "[") depth++;
    else if (char === ")" || char === "]") {
      if (depth === 0) continue; // stray closer from OCR
      depth--;
    } else if ((char === "," || char === ";") && depth === 0) {
      items.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  items.push(depth > 0 ? current + ")".repeat(depth) : current);
  return items;
}

/** Tidies an OCR'd list and returns its items; parenthesised groups stay attached to their ingredient. */
export function normalizeListItems(text: string): string[] {
  const flat = text
    .replace(LEADING_HEADING, "")
    .replace(/(\p{L})\|(\p{L})/gu, "$1l$2")
    // OCR reads a comma as a period: "Parfum. Inulin" is two items (INCI names never contain ". X").
    .replace(/\.\s+(?=\p{Lu})/gu, ", ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,;)\]])/g, "$1")
    .replace(/([([])\s+/g, "$1")
    .trim()
    .replace(/[\s.,;:]+$/, "");

  const seen = new Set<string>();
  const items: string[] = [];
  for (const item of splitTopLevel(flat)) {
    const cleaned = item.trim().replace(/^[\s.:\-–•*]+/, "").replace(/[*†°]+$/, "").trim();
    const key = lowerTr(cleaned);
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    items.push(cleaned);
  }
  return items;
}

/**
 * Finds the ingredient list among OCR text blocks (each an array of lines, in reading order):
 * starts after an "İçindekiler / Ingredients" style heading, stops at the next label section, and
 * returns it as a cleaned comma-separated list. Without a visible heading, the most comma-dense block wins.
 */
export function readIngredientList(blocks: string[][]): IngredientListReading {
  const lines: OcrLine[] = blocks.flatMap((block, index) =>
    block.map((text) => ({ text: text.trim(), block: index })).filter((line) => line.text)
  );
  const letters = lines.reduce((n, line) => n + (line.text.match(/\p{L}/gu)?.length ?? 0), 0);
  if (letters < 20) return { status: "unreadable", ingredientsText: null };

  const candidates: CollectedList[] = [];
  lines.forEach((line, i) => {
    const heading = line.text.match(LIST_HEADING);
    if (heading) candidates.push(collectList(lines, i, line.text.slice(heading[0].length).trim()));
  });

  if (candidates.length === 0) {
    const commas = blocks.map((block) => block.join(" ").split(",").length - 1);
    const densest = commas.indexOf(Math.max(...commas));
    if (commas[densest] < 3) return { status: "no_list", ingredientsText: null };
    const start = lines.findIndex((line) => line.block === densest);
    const list = collectList(lines, start, lines[start].text);
    // Starting mid-word or on a separator means the top of the list is outside the photo.
    candidates.push({ ...list, truncated: list.truncated || /^[\p{Ll},;)]/u.test(lines[start].text) });
  }

  // Multi-language labels repeat the list: prefer the longest complete one.
  const [best] = candidates
    .filter((candidate) => !candidate.truncated)
    .map((candidate) => ({ candidate, items: normalizeListItems(candidate.text) }))
    .filter(({ items }) => items.length > 0)
    .sort((a, b) => b.items.length - a.items.length);

  if (best) {
    // Most of the photo's comma-separated text lying outside every list found means the list read was
    // only a piece (seen on upside-down photos, where lines come out in reverse order). Addresses and
    // distributor lines outside the list carry only a few commas.
    const inList = (i: number) => candidates.some((c) => i >= c.start && i < c.end);
    const outsideCommas = lines.reduce((n, line, i) => (inList(i) ? n : n + countCommas(line.text)), 0);
    const listCommas = lines.slice(best.candidate.start, best.candidate.end).reduce((n, line) => n + countCommas(line.text), 0);
    if (outsideCommas >= 5 && outsideCommas > listCommas) return { status: "partial", ingredientsText: null };
    return { status: "ok", ingredientsText: best.items.join(", ") };
  }
  if (candidates.some((candidate) => candidate.truncated)) return { status: "partial", ingredientsText: null };
  return { status: "no_list", ingredientsText: null };
}

/**
 * What a product's result screen shows. A list scanned whole is a finished scan whatever its analysis
 * says: without a score it shows the list read (SCAN_COMPLETE_ANALYSIS_BLOCKED), never as a failed scan.
 * An incomplete scan never gets here (the scanner asks for a rescan); NO_INGREDIENT_LIST is a barcode
 * product whose list nobody has entered.
 */
export type ResultState = "SCORE_AVAILABLE" | "SCAN_COMPLETE_ANALYSIS_BLOCKED" | "NO_INGREDIENT_LIST";

export function resultState(product: Pick<Product, "barcode" | "ingredientsText" | "cleanScore" | "cleanRating">): ResultState {
  const listed = !!product.ingredientsText?.trim();
  if (listed && product.cleanScore !== null && product.cleanRating !== null) return "SCORE_AVAILABLE";
  // (Barcode products without a score keep asking for their list to be scanned.)
  return listed && product.barcode.startsWith("custom:") ? "SCAN_COMPLETE_ANALYSIS_BLOCKED" : "NO_INGREDIENT_LIST";
}

export interface FreeFromCheck {
  label: string;
  free: boolean;
}

// Rough keyword screen over the declared ingredient list, not a regulatory judgement.
const CHECKS: { label: string; test: (token: string) => boolean }[] = [
  { label: "Paraben", test: (t) => t.includes("paraben") },
  { label: "Sülfat", test: (t) => /(lauryl|laureth|coco|myreth)[\s-]*sul(ph|f)ate/.test(t) },
  { label: "Silikon", test: (t) => /(dimethicone|siloxane|silicone|methicone)/.test(t) },
  { label: "Alkol", test: (t) => /^(alcohol( denat\.?)?|ethanol|sd alcohol.*|isopropyl alcohol)$/.test(t) },
];

export function freeFromChecks(product: Product): FreeFromCheck[] {
  const tokens = parseIngredients(product.ingredientsText).map((t) => t.toLowerCase());
  return CHECKS.map((check) => ({ label: check.label, free: !tokens.some(check.test) }));
}

export function summaryText(product: Product): string {
  const flagged = product.flaggedIngredients.length;
  const pregnancy =
    product.pregnancySafe === false
      ? " Hamilelik döneminde kaçınılması önerilen içerikler barındırıyor."
      : " Hamilelik döneminde kullanımı için işaretlenmiş bir içerik bulunmuyor.";
  switch (product.cleanRating) {
    case "clean":
      return `İçeriği genel olarak güvenli ve temiz kabul ediliyor.${pregnancy}`;
    case "moderate":
      return `İçeriğinde dikkat edilmesi gereken ${flagged} madde var.${pregnancy}`;
    case "riskli":
      return `İçeriğinde ${flagged} riskli veya kısıtlı madde tespit edildi.${pregnancy}`;
    default:
      return "Bu ürün için analiz yapılamadı.";
  }
}
