import { ScoringResult } from "../types/product";

/**
 * Share of detected ingredients that must be read before a photographed list gets a score (see
 * PhotoAnalysis.readCoverage). Measured on real photos; see photoFixtures.test.ts.
 */
export const MIN_PHOTO_COVERAGE = 0.85;

/** Why an OCR'd name looks corrupted (logged for unknown ingredients). */
export type SuspectedOcrError = "invalid_characters" | "digit_in_word" | "fragment" | "none";

/**
 * What an unknown ingredient could be, judged by spelling distance. This is only used to decide
 * whether the unknown could change the score; an unknown is never scored as any of these.
 *  - resembles_safe: close only to names that carry no flag ("Tocophery Acetate"), so whatever it
 *    really is, the score would be the same
 *  - resembles_flagged: close to a flagged substance ("BH4" ~ "BHA"): might hide a penalty
 *  - unrecognizable: close to nothing ("yaledrdie"): might be anything
 *  - unlisted: close to nothing, but evidently a real name the inventory lacks ("Deinococcus Ferment
 *    Extract Filtrate"): read letter for letter the same in two or more frames, or cleanly read words
 *    of INCI names with one new word (see looksUnlisted). It is far from every flagged name, so it
 *    can't hide a penalty; the app shows it as not verified, next to the score.
 */
export type UnknownKind = "resembles_safe" | "resembles_flagged" | "unrecognizable" | "unlisted";

export interface IngredientAssessment {
  /** As read from the photo. */
  text: string;
  status: "matched" | "unknown";
  /** Matched: the inventory name it was matched to. */
  matchedName?: string;
  /** Matched: points this ingredient takes off the score. */
  contribution?: number;
  kind?: UnknownKind;
  /** Unknown: closest inventory name, for logs only. */
  nearest?: string;
  /** Unknown: edits between the read text and `nearest`. */
  distance?: number;
  suspected?: SuspectedOcrError;
}

/** frame_conflict: multi-frame reading only (see frameMerge.ts). */
export type WithheldReason = "empty" | "low_coverage" | "uncertain_flagged" | "unrecognizable" | "frame_conflict";

export interface PhotoAnalysis {
  detected: number;
  matched: number;
  unknown: number;
  /** matched / detected */
  coverage: number;
  /**
   * (matched + harmless one-letter misreads + unlisted) / detected, compared with MIN_PHOTO_COVERAGE.
   * A sharp photo of small print loses a letter here and there ("Inuin", "Tocophery Acetate"); those
   * names are read in all but one letter and can't hide a flag, so they don't count as unread.
   */
  readCoverage: number;
  ingredients: IngredientAssessment[];
  /** Why no score is given; null when the score is reliable. */
  withheldReason: WithheldReason | null;
  scoring: ScoringResult | null;
}

export interface IngredientVocabulary {
  /** Every known INCI name (CosIng inventory + restricted aliases), keyed by inciKey(). */
  known: ReadonlyMap<string, string>;
  /** Names that carry a flag in scoring, keyed by inciKey(). */
  flagged: ReadonlySet<string>;
}

/**
 * Comparison key for INCI names: accents stripped (CosIng has no non-ASCII names, so "Sorbitól"
 * can only be "Sorbitol"), case and all whitespace ignored ("CitricAcid"), trailing punctuation
 * dropped. In CosIng the only names sharing a key are spacing variants of the same substance
 * ("soy milk" / "soymilk"). The one letter fix: OCR reads the colour index prefix "CI" as "Cl";
 * CosIng has no name starting "Cl" + digits, only "CI" + 5 digits. Otherwise no letter or digit
 * substitutions.
 */
export function inciKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[.,;:]+$/, "")
    .replace(/^cl(?=\d{5}$)/, "ci");
}

/** Builds lookup maps from inventory names and flagged aliases; flagged spellings take precedence. */
export function buildVocabulary(inventoryNames: Iterable<string>, flaggedNames: Iterable<string>): IngredientVocabulary {
  const known = new Map<string, string>();
  const flagged = new Set<string>();
  const display = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");
  for (const name of flaggedNames) {
    const key = inciKey(name);
    if (!key) continue;
    known.set(key, display(name));
    flagged.add(key);
  }
  for (const name of inventoryNames) {
    const key = inciKey(name);
    if (key && !known.has(key)) known.set(key, display(name));
  }
  return { known, flagged };
}

function suspectedOcrError(text: string): SuspectedOcrError {
  if (/[^\x20-\x7E]/.test(text.normalize("NFD").replace(/\p{M}/gu, ""))) return "invalid_characters";
  // A 0/1/5/8 inside a word of letters is a misread O/l/S/B ("Castor 0il"); "PEG-40" or "C12" are not.
  if (/\b[A-Za-z]*[0158][A-Za-z]+|[A-Za-z]+[0158][A-Za-z]*\b/.test(text.replace(/\b[A-Za-z]{0,3}\d+\b/g, ""))) {
    return "digit_in_word";
  }
  if ((text.match(/[A-Za-z]/g) ?? []).length < 3 || /^[-/]|[-/]$/.test(text)) return "fragment";
  return "none";
}

/** How far (in edits) an unknown may be from a flagged name and still count as possibly being it. */
export function lookalikeTolerance(key: string): number {
  return Math.max(2, Math.ceil(key.length * 0.3));
}

/** Levenshtein distance, giving up (returning max + 1) once it must exceed `max`. */
export function boundedDistance(a: string, b: string, max: number): number {
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

type Classification = { kind: UnknownKind; nearest?: string; distance?: number };
/**
 * Per vocabulary, each key's classification: it compares the key with every known name (24,000+), and
 * a scan asks about the same misread in every photo's evidence. Same key, same answer.
 */
const classifications = new WeakMap<IngredientVocabulary, Map<string, Classification>>();

function classifyUnknown(key: string, vocabulary: IngredientVocabulary): Classification {
  let cache = classifications.get(vocabulary);
  if (!cache) {
    cache = new Map();
    classifications.set(vocabulary, cache);
  }
  let result = cache.get(key);
  if (!result) {
    result = classify(key, vocabulary);
    if (cache.size > 20000) cache.clear();
    cache.set(key, result);
  }
  return { ...result };
}

function classify(key: string, vocabulary: IngredientVocabulary): Classification {
  // Generous for flagged names: a possible hidden penalty must not slip through.
  const flaggedTolerance = lookalikeTolerance(key);
  // Strict for the "harmless misread" verdict: only a letter or two off per ~10 characters.
  const safeTolerance = Math.max(1, Math.round(key.length * 0.2));

  let nearestFlagged: { name: string; distance: number } | null = null;
  let nearestSafe: { name: string; distance: number } | null = null;
  for (const [candidate, name] of vocabulary.known) {
    const distance = boundedDistance(key, candidate, flaggedTolerance);
    if (distance > flaggedTolerance) continue;
    if (vocabulary.flagged.has(candidate)) {
      if (!nearestFlagged || distance < nearestFlagged.distance) nearestFlagged = { name, distance };
    } else if (!nearestSafe || distance < nearestSafe.distance) {
      nearestSafe = { name, distance };
    }
  }

  // A flagged look-alike only stops counting when a harmless name is clearly (2+ edits) closer:
  // "Ceteary! Alcohol" is 1 from cetearyl alcohol but 5 from methyl alcohol; "Ctric Acid" is 1 from
  // citric acid and 2 from picric acid, so it stays uncertain.
  if (nearestFlagged && nearestFlagged.distance > (nearestSafe?.distance ?? Infinity) + 1 === false) {
    return { kind: "resembles_flagged", nearest: nearestFlagged.name, distance: nearestFlagged.distance };
  }
  if (nearestSafe && nearestSafe.distance <= safeTolerance) {
    return { kind: "resembles_safe", nearest: nearestSafe.name, distance: nearestSafe.distance };
  }
  return { kind: "unrecognizable" };
}

const HYDRATE = /^(.*\S)\s+[a-z]*hydrate$/i;
const COLOUR_INDEX = /^(?:(.*\S)\s+)?(c[il1|]\s*\d{5})(?:\s+(.*\S))?$/i;

/**
 * Label spellings of an inventory name, resolved without guessing at letters:
 *  - a colour named with its colour index ("Iron Oxide CI 77491", "CI 77891 Titanium Dioxide"): the CI
 *    number identifies the colourant, and CosIng lists colourants by it,
 *  - a hydrate of a listed substance ("Magnesium Sulfate Heptahydrate"; the count prefix, often
 *    misread as in "peptahydrate", doesn't matter): the same substance, scored
 *    the same.
 * Returns the inventory name, or undefined.
 */
function labelVariant(text: string, vocabulary: IngredientVocabulary): string | undefined {
  const colour = COLOUR_INDEX.exec(text.trim());
  if (colour && (colour[1] || colour[3])) {
    const name = vocabulary.known.get(inciKey(colour[2].replace(/^c[l1|]/i, "ci")));
    if (name !== undefined) return name;
  }
  const hydrate = HYDRATE.exec(text.trim());
  if (hydrate) return vocabulary.known.get(inciKey(hydrate[1]));
  return undefined;
}

/** Per vocabulary, flagged hydrates by their substance ("morphine sulfate" for morphine sulfate pentahydrate). */
const flaggedHydrates = new WeakMap<IngredientVocabulary, { core: string; name: string }[]>();

/**
 * An unknown hydrate is judged by its substance: the long hydrate word would otherwise make any
 * misread of the substance ("Magnesiumn Sulfate Heptahydrate") look like nothing known, or like
 * another hydrate ("morphine sulfate pentahydrate"). Flagged hydrates are compared by their substance
 * too, with the usual rule that a flagged look-alike counts unless a harmless name is clearly closer.
 */
function classifyHydrate(text: string, vocabulary: IngredientVocabulary): Classification | null {
  const hydrate = HYDRATE.exec(text.trim());
  if (!hydrate) return null;
  let cores = flaggedHydrates.get(vocabulary);
  if (!cores) {
    cores = [...vocabulary.flagged].flatMap((key) => {
      const name = vocabulary.known.get(key)!;
      const core = HYDRATE.exec(name);
      return core ? [{ core: inciKey(core[1]), name }] : [];
    });
    flaggedHydrates.set(vocabulary, cores);
  }
  const key = inciKey(hydrate[1]);
  const result = classifyUnknown(key, vocabulary);
  const tolerance = lookalikeTolerance(key);
  for (const { core, name } of cores) {
    const distance = boundedDistance(key, core, tolerance);
    if (distance > tolerance) continue;
    const saferBy2 = result.kind === "resembles_safe" && distance > result.distance! + 1;
    if (!saferBy2 && (result.kind !== "resembles_flagged" || distance < result.distance!)) {
      Object.assign(result, { kind: "resembles_flagged", nearest: name, distance });
    }
  }
  return result;
}

/** The inventory name a read name stands for: exactly, or as one of its label spellings. */
function knownName(text: string, vocabulary: IngredientVocabulary): string | undefined {
  return vocabulary.known.get(inciKey(text)) ?? labelVariant(text, vocabulary);
}

/** Characters OCR mistakes for one another in small print: [read, could be]. */
const OCR_CONFUSIONS: [string, string][] = [
  ["!", "l"], ["!", "i"], ["!", ""], ["|", "l"], ["|", "i"], ["|", ""], [":", ""],
  ["l", "i"], ["i", "l"], ["0", "o"], ["1", "l"], ["1", "i"], ["5", "s"],
  ["rn", "m"], ["m", "rn"], ["vv", "w"], ["cl", "d"], ["ii", "u"],
];

/**
 * An unknown one OCR confusion away from a single inventory name ("Titanium Dloxide", "Magnesium!
 * Sulfate Heptahydrate"): undoing one confused character, at any one place, leads to that name and to
 * no other. Not when the reading also resembles a different flagged name (it could be that one).
 */
function confusionMatch(text: string, vocabulary: IngredientVocabulary): string | undefined {
  const lower = text.toLowerCase();
  const names = new Set<string>();
  for (const [read, meant] of OCR_CONFUSIONS) {
    for (let at = lower.indexOf(read); at >= 0; at = lower.indexOf(read, at + 1)) {
      const name = knownName(lower.slice(0, at) + meant + lower.slice(at + read.length), vocabulary);
      if (name !== undefined) names.add(name);
    }
  }
  if (names.size !== 1) return undefined;
  const [name] = names;
  const lookalike = classifyUnknown(inciKey(text), vocabulary);
  return lookalike.kind === "resembles_flagged" && lookalike.nearest !== name ? undefined : name;
}

/**
 * An unknown one letter from a single flagged name, with no other name within two letters ("Titaniun
 * Dioxide"): read as that flagged name, penalty included. This can only lower the score, never hide a
 * penalty: at worst an unlisted harmless name one letter from a flagged one is penalised.
 */
function flaggedLookalike(text: string, vocabulary: IngredientVocabulary): string | undefined {
  const key = inciKey(text);
  let match: string | undefined;
  for (const [candidate, name] of vocabulary.known) {
    const distance = boundedDistance(key, candidate, 2);
    if (distance > 2) continue;
    if (distance !== 1 || !vocabulary.flagged.has(candidate) || match !== undefined) return undefined;
    match = name;
  }
  return match;
}

/** Per vocabulary, every word of its names ("ferment", "extract", "filtrate"). */
const nameWords = new WeakMap<IngredientVocabulary, Set<string>>();

function wordsOf(vocabulary: IngredientVocabulary): Set<string> {
  let words = nameWords.get(vocabulary);
  if (!words) {
    words = new Set([...vocabulary.known.values()].flatMap((name) => name.split(/[^a-z]+/).filter((word) => word.length >= 3)));
    nameWords.set(vocabulary, words);
  }
  return words;
}

/** Per vocabulary, the endings (2+ words) of its names that aren't names themselves ("ferment extract filtrate"). */
const nameTails = new WeakMap<IngredientVocabulary, Set<string>>();

function tailsOf(vocabulary: IngredientVocabulary): Set<string> {
  let tails = nameTails.get(vocabulary);
  if (!tails) {
    tails = new Set<string>();
    for (const name of vocabulary.known.values()) {
      const words = name.split(" ");
      for (let k = 1; k <= words.length - 2; k++) tails.add(words.slice(k).join(" "));
    }
    for (const tail of tails) if (vocabulary.known.has(inciKey(tail))) tails.delete(tail);
    nameTails.set(vocabulary, tails);
  }
  return tails;
}

/**
 * An unrecognisable unknown that reads as a real name the inventory lacks, not as OCR garbage or as
 * names run together: one new word (a source the inventory doesn't list, 5+ letters, no misread of a
 * known word) followed by an ending real names have (2+ words, "Ferment Extract Filtrate"), with no
 * inventory name anywhere in it. "Deinococcus Ferment Extract Filtrate" is. Not: "yaledrdie" (a lost
 * triethanolamine), "yaledrdie Glycerin" or "Glycerin Phenoxyethanol Mica" (names whose commas OCR
 * lost: one could be flagged), "Sxlfxte Extract" (a misread "sulfate").
 */
function looksUnlisted(text: string, vocabulary: IngredientVocabulary): boolean {
  if (suspectedOcrError(text) !== "none") return false;
  const parts = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (parts.length < 3 || parts.some((word) => !/^[a-z]{3,}$/.test(word))) return false;
  const [word, ...rest] = parts;
  const words = wordsOf(vocabulary);
  if (words.has(word) || word.length < 5 || rest.some((w) => !words.has(w))) return false;
  if (!tailsOf(vocabulary).has(rest.join(" "))) return false;
  for (let from = 0; from < parts.length; from++) {
    for (let to = from + 1; to <= parts.length; to++) {
      if (vocabulary.known.has(inciKey(parts.slice(from, to).join(" ")))) return false;
    }
  }
  const tolerance = Math.max(2, Math.round(word.length * 0.2));
  for (const known of words) if (boundedDistance(word, known, tolerance) <= tolerance) return false;
  return true;
}

/**
 * OCR sometimes drops the comma between two names ("Glyceryl Stearate Parafinum Liquidum").
 * Splits such a token only when one part is an exact known name and the other is known or a
 * harmless misread; anything less certain stays a single unknown.
 */
function splitMergedToken(text: string, vocabulary: IngredientVocabulary): string[] | null {
  const words = text.split(/\s+/);
  for (let i = 1; i < words.length; i++) {
    const parts = [words.slice(0, i).join(" "), words.slice(i).join(" ")];
    const exact = parts.filter((part) => knownName(part, vocabulary) !== undefined).length;
    if (exact === 0) continue;
    const allUsable = parts.every((part) => {
      const key = inciKey(part);
      return knownName(part, vocabulary) !== undefined || (!vocabulary.flagged.has(key) && classifyUnknown(key, vocabulary).kind === "resembles_safe");
    });
    if (allUsable) return parts;
  }
  return null;
}

/**
 * Scores an ingredient list read from a photo. OCR can drop or garble names, and a lost flagged
 * ingredient would silently raise the score, so a score is only given when the uncertainty
 * provably can't change it:
 *  - names are matched exactly (after inciKey normalisation), as a label spelling (labelVariant), or
 *    one OCR confusion away from a single name (confusionMatch); there is no other fuzzy correction,
 *  - unknown names never add or remove points,
 *  - no score when coverage < MIN_PHOTO_COVERAGE, or when any unknown could be a flagged
 *    substance or is unrecognisable.
 * `confirmed`: keys of unknowns read identically in two or more frames (see frameMerge.ts); an
 * unrecognisable one among them is "unlisted" and doesn't withhold the score.
 */
export function analyzePhotoIngredients(
  tokens: string[],
  vocabulary: IngredientVocabulary,
  score: (names: string[]) => ScoringResult,
  confirmed: ReadonlySet<string> = new Set()
): PhotoAnalysis {
  const ingredients: IngredientAssessment[] = [];
  const assess = (text: string) => {
    const key = inciKey(text);
    const matchedName = knownName(text, vocabulary) ?? confusionMatch(text, vocabulary) ?? flaggedLookalike(text, vocabulary);
    if (matchedName !== undefined) {
      ingredients.push({ text, status: "matched", matchedName, contribution: 100 - score([matchedName]).cleanScore });
    } else {
      const classification = classifyHydrate(text, vocabulary) ?? classifyUnknown(key, vocabulary);
      if (classification.kind === "unrecognizable" && (confirmed.has(key) || looksUnlisted(text, vocabulary))) classification.kind = "unlisted";
      ingredients.push({ text, status: "unknown", ...classification, suspected: suspectedOcrError(text) });
    }
  };
  for (const token of tokens) {
    const split = knownName(token, vocabulary) !== undefined ? null : splitMergedToken(token, vocabulary);
    for (const part of split ?? [token]) assess(part);
  }

  const detected = ingredients.length;
  const matchedNames = ingredients.flatMap((item) => (item.status === "matched" ? [item.matchedName!] : []));
  const unknown = ingredients.filter((item) => item.status === "unknown");
  const coverage = detected > 0 ? matchedNames.length / detected : 0;
  const readRight = unknown.filter((item) => (item.kind === "resembles_safe" && item.distance === 1) || item.kind === "unlisted").length;
  const readCoverage = detected > 0 ? (matchedNames.length + readRight) / detected : 0;

  let withheldReason: WithheldReason | null = null;
  if (detected === 0) withheldReason = "empty";
  else if (readCoverage < MIN_PHOTO_COVERAGE) withheldReason = "low_coverage";
  else if (unknown.some((item) => item.kind === "resembles_flagged")) withheldReason = "uncertain_flagged";
  else if (unknown.some((item) => item.kind === "unrecognizable")) withheldReason = "unrecognizable";

  return {
    detected,
    matched: matchedNames.length,
    unknown: unknown.length,
    coverage,
    readCoverage,
    ingredients,
    withheldReason,
    scoring: withheldReason ? null : score(matchedNames),
  };
}
