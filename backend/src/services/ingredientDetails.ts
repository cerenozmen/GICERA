import { mergeTags, tagsFromName } from "../data/cosingFunctions";
import { analyzePhotoIngredients, inciKey } from "./ingredientCoverage";
import { getIngredientFunctions, getIngredientVocabulary } from "./ingredientInventoryCache";
import { scoreIngredients } from "./scoringService";

/** One row of the app's ingredient list, as the server reads it. */
export interface IngredientRow {
  /** The INCI name the row was matched to, or null when it isn't a known name. */
  inciName: string | null;
  /** What it does, as Turkish tags (CosIng functions). */
  functions: string[];
  /** The product's flagged substances this row is (inciName as the product lists it). */
  flagged: string[];
}

export interface IngredientDetails {
  rows: IngredientRow[];
  /** Flagged substances no row could be tied to: the app lists them as rows of their own, so none goes missing. */
  unplaced: string[];
}

/** What a row of the list is: the names it was matched to and the flagged substances among them. */
export interface RowReading {
  names: string[];
  flags: string[];
  /** Inventory names one or two letters off an unmatched row ("Linalol", "Citronelol"): for its function tags only. */
  near?: string[];
}

/**
 * The ways a row may name its ingredient: without what's in brackets, a leading heading or the footnote
 * marks ("Ingredients: Aqua", "Cera Alba*"), and each of its slash-separated names ("Aqua/Water/Eau").
 */
export function rowVariants(text: string): string[] {
  const plain = text
    .replace(/\([^)]*\)?/g, " ")
    .replace(/^\s*(?:ingr[eé]dients?|ingredientes|içindekiler|inci)\s*[:：]\s*/i, "")
    .replace(/[*°†‡+]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const parts = plain.split("/").map((part) => part.trim()).filter(Boolean);
  return [...new Set([plain, ...(parts.length > 1 ? parts : [])])].filter(Boolean);
}

/**
 * Ties the product's flagged substances (as the product screen lists them) to rows of its ingredient list,
 * so the list marks exactly as many rows as the product screen counts: each distinct substance goes to the
 * first row that reads as it (the scoring's own matching), else to the first row whose text shares its
 * name, else it stays unplaced.
 */
export function placeFlagged(texts: string[], readings: RowReading[], flaggedNames: string[]): { flagged: string[][]; unplaced: string[] } {
  const flagged = texts.map(() => [] as string[]);
  const unplaced: string[] = [];
  const seen = new Set<string>();
  for (const name of flaggedNames) {
    const key = inciKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    let row = readings.findIndex((reading) => reading.flags.some((flag) => inciKey(flag) === key));
    if (row < 0) row = texts.findIndex((text, i) => inciKey(text).includes(key) || readings[i].names.some((n) => inciKey(n) === key));
    if (row < 0) unplaced.push(name);
    else flagged[row].push(name);
  }
  return { flagged, unplaced };
}

/** Reads one row the way the scoring does: its exact name and aliases, and the scan's matching (common names, misreads). */
function readRow(text: string): RowReading {
  const variants = rowVariants(text);
  const vocabulary = getIngredientVocabulary();
  const items = vocabulary ? variants.flatMap((variant) => analyzePhotoIngredients([variant], vocabulary, scoreIngredients).ingredients) : [];
  const names = [...new Set(items.flatMap((item) => (item.matchedName ? [item.matchedName] : [])))];
  const near = names.length ? [] : items.flatMap((item) => (item.nearest && (item.distance ?? 99) <= 2 && item.kind !== "unrecognizable" ? [item.nearest] : []));
  const flags = scoreIngredients([...variants, ...names]).flaggedIngredients.map((f) => f.inciName);
  return { names, flags, near };
}

export function describeIngredients(texts: string[], flaggedNames: string[]): IngredientDetails {
  const readings = texts.map(readRow);
  const { flagged, unplaced } = placeFlagged(texts, readings, flaggedNames);
  const rows = readings.map((reading, i) => {
    const inciName = reading.names[0] ?? reading.flags[0] ?? null;
    // CosIng's functions for the names it was matched to, else for a near spelling, else what the name itself says.
    let functions = mergeTags([...reading.names, ...reading.flags].map(getIngredientFunctions));
    if (!functions.length) functions = mergeTags((reading.near ?? []).map(getIngredientFunctions));
    if (!functions.length) functions = tagsFromName(texts[i]);
    return { inciName, functions, flagged: flagged[i] };
  });
  return { rows, unplaced };
}
