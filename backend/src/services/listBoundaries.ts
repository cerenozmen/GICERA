import { boundedDistance, IngredientVocabulary, inciKey } from "./ingredientCoverage";

/**
 * Were the edges of the text rows an ingredient list was read from really seen, or cut off (by the
 * picture's edge, or by a curved package's silhouette, where OCR stops reading mid-word: "…Carbonate,
 * Mag", "…Vinyl Dime", "ndekiler: Aqua" on a real tube)?
 *
 * This is about completeness of the reading, not about recognising ingredients: an unknown ingredient
 * in the middle of a row doesn't matter here. Only the text at the list's row boundaries is looked at,
 * and only for exact words: a boundary counts as seen when the words on both sides of it are whole
 * words of known INCI names (or the name joined across it is a known name). A cut leaves a piece of a
 * word there ("Mag", "Isoamy", "Tetr"), which is not a word of any name.
 *
 * What this can't see: a cut that falls exactly between two items on both sides of a row break
 * ("…Glycerin," | "Sodium …" with items hidden in between). The scanner's other evidence (the list's
 * heading and end, text around the list, picture edges) and the analysis' own checks remain.
 */

/** brackets: an opening bracket never closed (scanValidation.ts). */
export type BoundaryKind = "start" | "break" | "end" | "brackets";

export interface BoundaryCheck {
  kind: BoundaryKind;
  /** Rows around the boundary: for a break, the index of the row above it. */
  row: number;
  verified: boolean;
  /** How it was verified, or why not (logs). */
  reason: string;
  /** The text on each side of the boundary. */
  before: string;
  after: string;
}

export interface ListBoundaries {
  verified: boolean;
  checks: BoundaryCheck[];
}

/** Word key: accents stripped, lower case, surrounding punctuation dropped, "Cl 77891" read as "CI". */
export function wordKey(word: string): string {
  const key = word
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .replace(/^cl$/, "ci");
  // A 0 or 1 among letters is OCR's O or l ("Castor 0il"); only for this check, not for naming.
  return /\p{L}/u.test(key) && !/^[a-z]{0,3}-?\d+$/.test(key) ? key.replace(/0/g, "o").replace(/1/g, "l") : key;
}

const splitWords = (text: string) => text.split(/[\s/]+/).map(wordKey).filter(Boolean);

export interface WordSet {
  words: ReadonlySet<string>;
  /** Words by each of their one-letter deletions (and themselves), for one-letter misread lookups. */
  deletions: ReadonlyMap<string, string[]>;
}

const oneLetterDeletions = (word: string) => Array.from(word, (_, i) => word.slice(0, i) + word.slice(i + 1));

/** Every word of every known name ("isoamyl", "laurate", "peg-40", "77891", …). */
export function buildWordSet(vocabulary: IngredientVocabulary): WordSet {
  const words = new Set<string>();
  for (const name of vocabulary.known.values()) for (const word of splitWords(name)) words.add(word);
  const deletions = new Map<string, string[]>();
  for (const word of words) {
    if (word.length < MISREAD_MIN) continue;
    for (const key of [word, ...oneLetterDeletions(word)]) deletions.set(key, [...(deletions.get(key) ?? []), word]);
  }
  return { words, deletions };
}

// A boundary word must be long enough that a cut piece is unlikely to be a word of some name by
// chance ("ma", "di" are); numbers ("77891", "40") are whole by nature when they sit at a boundary.
const MIN_WORD = 3;
// Words at least this long may be matched with one letter misread (see wholeWord).
const MISREAD_MIN = 7;

/**
 * Is `word` a whole word of some name? Exactly, or, for long words, with one letter misread, added or
 * dropped inside the word ("BOROSILIGATE", "MICROCRYSTALINE", "DIETHYLHEYL" on a real blush photo).
 * A piece left by a cut is the start of the word at a row's end ("Isoamy" of "Isoamyl") or its end at
 * a row's start ("ydrate"), so a word matching only that way is not whole.
 */
function wholeWord(word: string | undefined, set: WordSet, side: "end" | "start"): boolean {
  if (!word) return false;
  // A lone "0" is OCR's reading of an O whose word was cut ("…Mica, Iron 0" for "Iron Oxide"): not a
  // number of any name.
  if (/^\d+$/.test(word)) return word !== "0";
  if (word.length >= MIN_WORD && set.words.has(word)) return true;
  if (word.length < MISREAD_MIN) return false;
  const candidates = new Set([word, ...oneLetterDeletions(word)].flatMap((key) => set.deletions.get(key) ?? []));
  const piece = (known: string) => (side === "end" ? known.startsWith(word.slice(0, -1)) : known.endsWith(word.slice(1)));
  return [...candidates].some((known) => oneEditApart(word, known) && !piece(known));
}

/** Exactly one substitution, insertion or deletion apart. */
function oneEditApart(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const tail = (x: string, y: string) => x.slice(i + 1) === y.slice(i + (a.length === b.length ? 1 : 0));
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? tail(a, b) : tail(b, a);
}

/** Top-level items of a row (commas inside brackets don't split). */
function items(text: string): string[] {
  const out: string[] = [];
  let current = "";
  let depth = 0;
  for (const char of text) {
    if (char === "(" || char === "[") depth++;
    else if ((char === ")" || char === "]") && depth > 0) depth--;
    else if ((char === "," || char === ";") && depth === 0) {
      out.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  out.push(current);
  return out;
}

const endsWithSeparator = (text: string) => /[,;]\s*$/.test(text);
// Mixed case: most words have lower-case letters and many start with a capital ("Cetearyl Alcohol").
// An all-caps label may still have a few ("Cl 77491", "Ci 77891" on a real blush label), and an
// all-lower-case list ("aqua, paraffin, ozokerite" on a real balm) says nothing by its case either.
const mixedCase = (text: string) => {
  const letterWords = text.split(/[\s,;/()]+/).filter((word) => (word.match(/\p{L}/gu) ?? []).length >= 3);
  const share = (test: RegExp) => letterWords.filter((word) => test.test(word)).length / letterWords.length;
  return letterWords.length > 0 && share(/\p{Ll}/u) >= 0.5 && share(/^[^\p{L}]*\p{Lu}/u) >= 0.4;
};
// A row starting in lower case on a mixed-case label starts mid-word (INCI names are capitalised).
const startsMidWord = (text: string, label: string) => mixedCase(label) && /^\p{Ll}/u.test(text.trim());

/**
 * Is the word at a row's start (end) a word of some known name, by spelling alone (no letter-case
 * rule)? Picks, among the readings frames gave of a row's edge, one OCR read right.
 */
export function edgeWordKnown(text: string, side: "start" | "end", vocabulary: IngredientVocabulary, words: WordSet): boolean {
  // A row ending in a separator ends an item there: its edge was read as such.
  if (side === "end" && endsWithSeparator(text)) return true;
  const all = items(text.trim().replace(/[.\s]+$/, ""));
  const item = (side === "start" ? all[0] : all[all.length - 1]).trim();
  if (item && vocabulary.known.has(inciKey(item))) return true;
  const itemWords = splitWords(item);
  return wholeWord(side === "start" ? itemWords[0] : itemWords[itemWords.length - 1], words, side);
}

/**
 * Checks the list's outer edges and every row break. `rows`: the list's rows in order, the first
 * without its heading; `heading`: the list heading was seen in front of the first row.
 */
export function checkListBoundaries(rows: string[], heading: boolean, vocabulary: IngredientVocabulary, words: WordSet): ListBoundaries {
  const label = rows.join(" ");
  const known = (text: string) => !!text.trim() && vocabulary.known.has(inciKey(text.trim()));
  // The item across a break, a known name with one letter too many ("OCTYL METHOXYL" + "CINNAMATE":
  // the split word's hyphen read as "L" on a real sunscreen): a word the label split there. Never one
  // letter short: a row cut loses letters, and a cut piece joined to the next row is exactly that.
  // Only the break is judged here; the analysis decides what the name is.
  const nearlyKnown = (text: string) => {
    const key = inciKey(text.trim());
    if (key.length < 8) return false;
    for (const candidate of vocabulary.known.keys()) {
      if (candidate.length === key.length - 1 && boundedDistance(key, candidate, 1) === 1) return true;
    }
    return false;
  };
  const checks: BoundaryCheck[] = [];
  // A row's end is whole when it ends an item, a known name, or a whole word (hyphenated words go on).
  const endIsWhole = (text: string) => {
    const tail = items(text).pop()!.trim();
    return endsWithSeparator(text) || tail.endsWith("-") || known(tail) || wholeWord(splitWords(tail).pop(), words, "end");
  };
  // A row's start is whole when it starts a known name or a whole word. On a mixed-case label the
  // letter case tells by itself: INCI names are capitalised, so a row cut mid-word starts in lower
  // case and one starting with a capital starts a word, however OCR spelled the rest ("Cety) Alcohol",
  // "Iriethanolamine" on a real cream photo).
  const startIsWhole = (text: string) => {
    const head = items(text)[0].trim();
    if (!head || startsMidWord(text, label)) return false;
    if (mixedCase(label) && /^\p{Lu}/u.test(head)) return true;
    return known(head) || wholeWord(splitWords(head)[0], words, "start");
  };
  // A batch or lot code after the closing period ("CI 77891. (LO519)") isn't part of the list.
  const withoutCode = (text: string) => text.replace(/\.\s*\([^()]*\)\s*$/, ".").replace(/[.\s]+$/, "");

  rows.forEach((row, i) => {
    const text = row.trim();

    if (i === 0) {
      const firstItem = items(text)[0].trim();
      // An empty first item (": ,MICA" on a real blush photo, where "TALC" wasn't read) is text lost.
      const verified = !!firstItem && (heading || startIsWhole(text));
      checks.push({
        kind: "start",
        row: 0,
        verified,
        reason: !firstItem ? "empty first item (text not read)" : heading ? "heading" : verified ? "whole word" : `starts with a piece of a word: "${firstItem.slice(0, 16)}"`,
        before: "",
        after: text.slice(0, 24),
      });
    }

    const next = rows[i + 1]?.trim();
    if (next !== undefined) {
      const tail = endsWithSeparator(text) ? "" : items(text).pop()!.trim();
      const head = items(next)[0].trim();
      // The item running across the break, joined as the list is (hyphenated words rejoined).
      const joined = tail.endsWith("-") ? tail.slice(0, -1) + head : `${tail} ${head}`;
      let verified = true;
      let reason = "whole words";
      if (tail && known(joined)) reason = `known item across the break: "${joined}"`;
      else if (tail && nearlyKnown(joined)) reason = `known item across the break, one letter off: "${joined}"`;
      else if (!endIsWhole(text)) {
        verified = false;
        reason = `row ends in a piece of a word: "${tail.slice(-16)}"`;
      } else if (!startIsWhole(next)) {
        verified = false;
        reason = `next row starts with a piece of a word: "${head.slice(0, 16)}"`;
      }
      checks.push({ kind: "break", row: i, verified, reason, before: text.slice(-24), after: next.slice(0, 24) });
    } else {
      // The list's end: its last word must be whole too (a row cut by the silhouette above a line
      // of other text can look like the end of the list).
      const lastItem = items(withoutCode(text)).pop()!.trim();
      const verified = endIsWhole(withoutCode(text));
      checks.push({
        kind: "end",
        row: i,
        verified,
        reason: verified ? (known(lastItem) ? "known item" : "whole word") : `ends in a piece of a word: "${lastItem.slice(-16)}"`,
        before: text.slice(-24),
        after: "",
      });
    }
  });
  return { verified: checks.every((check) => check.verified), checks };
}
