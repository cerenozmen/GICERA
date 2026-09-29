import { analyzeFrames, MultiFrameAnalysis } from "./frameMerge";
import { IngredientVocabulary } from "./ingredientCoverage";
import { BoundaryCheck, buildWordSet, checkListBoundaries, edgeWordKnown, ListBoundaries, WordSet, wordKey } from "./listBoundaries";
import { parseIngredientsText, scoreIngredients } from "./scoringService";

export interface ListReading {
  /** The list's rows as read (the first without its heading). */
  rows: string[];
  heading: boolean;
}

export interface ScanCandidate {
  /**
   * The same list read from one or more frames, row for row (the scanner only groups readings whose
   * rows correspond). The first is the one analysed.
   */
  readings: ListReading[];
  /**
   * MULTI_VIEW: for each row of the first reading, the differing readings frames gave of its start and
   * end (the rebuilt row joins pieces from several frames; its edges are read at a silhouette,
   * differently each time).
   */
  edges?: { starts: string[]; ends: string[] }[];
  /** The first reading as one comma-separated text (the scanner's normalisation of its rows). */
  ingredientsText: string;
  /** Slices and other readings of the list (item lists): exact reads that can confirm misread names. */
  evidence: string[][];
}

export interface ScanValidation {
  /** Every row boundary was seen whole: the reading is complete. */
  complete: boolean;
  boundaries: ListBoundaries;
  /** Only for a complete reading: the usual analysis (it may still withhold the score). */
  analysis: MultiFrameAnalysis | null;
}

const wordSets = new WeakMap<IngredientVocabulary, WordSet>();

/**
 * A boundary counts as seen whole when any of the readings shows it whole: OCR misreads a different
 * word in each frame of small print, and a word cut by the picture's edge or a silhouette is cut in
 * every frame that shows the list the same way. For a list rebuilt from several frames, the same
 * holds for the readings of each row's edges.
 */
function combine(candidate: ScanCandidate, vocabulary: IngredientVocabulary, words: WordSet): ListBoundaries {
  const { readings, edges } = candidate;
  const [first, ...others] = readings.map((reading) => checkListBoundaries(reading.rows, reading.heading, vocabulary, words));
  const aligned = others.filter((other) => other.checks.length === first.checks.length);
  const rows = readings[0].rows;
  const heading = readings[0].heading;
  const verified = (texts: string[], kind: string) => checkListBoundaries(texts, heading, vocabulary, words).checks.find((c) => c.kind === kind)!.verified;
  // The boundary with the row edges' readings instead: any pair showing it whole will do.
  const byEdges = (check: (typeof first.checks)[number]) => {
    if (!edges || edges.length !== rows.length) return false;
    if (check.kind === "start") return edges[0].starts.some((s) => verified([s], "start"));
    if (check.kind === "end") return edges[check.row].ends.some((e) => verified([e], "end"));
    const ends = [rows[check.row], ...edges[check.row].ends];
    const starts = [rows[check.row + 1], ...edges[check.row + 1].starts];
    return ends.some((e) => starts.some((s) => verified([e, s], "break")));
  };
  const checks = first.checks.map((check, i) => {
    const whole = [check, ...aligned.map((other) => other.checks[i])].find((c) => c.verified);
    if (whole) return { ...check, verified: true, reason: whole === check ? check.reason : `${whole.reason} (in another frame)` };
    return byEdges(check) ? { ...check, verified: true, reason: "whole in another frame's reading of the row's edge" } : check;
  });
  return { verified: checks.every((check) => check.verified), checks };
}

/** Longest exact common run of two texts (case-insensitive), and where it starts in each. */
function commonRun(a: string, b: string): { length: number; inA: number; inB: number } {
  const x = a.toLocaleLowerCase("tr");
  const y = b.toLocaleLowerCase("tr");
  let best = { length: 0, inA: 0, inB: 0 };
  const row = new Array<number>(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i++) {
    let diagonal = 0;
    for (let j = 1; j <= y.length; j++) {
      const up = row[j];
      row[j] = x[i - 1] === y[j - 1] ? diagonal + 1 : 0;
      if (row[j] > best.length) best = { length: row[j], inA: i - row[j], inB: j - row[j] };
      diagonal = up;
    }
  }
  return best;
}

/**
 * MULTI_VIEW: a rebuilt row's edges were read differently by different frames (the silhouette
 * again). For the analysis, each row takes at each edge a reading whose word there is a word of a
 * known name, when one exists: an exact OCR read, spliced in where it overlaps the row exactly (8+
 * characters). Nothing is corrected or invented: the chosen text is what a frame read.
 */
function rowsWithReadEdges(candidate: ScanCandidate, vocabulary: IngredientVocabulary, words: WordSet): string[] {
  const { readings, edges } = candidate;
  const rows = readings[0].rows;
  if (!edges || edges.length !== rows.length) return rows;
  return rows.map((row, i) => {
    let text = row;
    for (const side of ["start", "end"] as const) {
      if (edgeWordKnown(text, side, vocabulary, words)) continue;
      const reading = (side === "start" ? edges[i].starts : edges[i].ends).find((r) => edgeWordKnown(r, side, vocabulary, words));
      if (!reading) continue;
      const run = commonRun(text, reading);
      if (run.length < 8) continue;
      const middle = Math.floor(run.length / 2);
      text = side === "end" ? text.slice(0, run.inA + middle) + reading.slice(run.inB + middle) : reading.slice(0, run.inB + middle) + text.slice(run.inA + middle);
    }
    return text;
  });
}

/**
 * Each item once, as the scanner lists it (normalizeListItems): a row rebuilt on a curved jar can
 * repeat another row's items (an OCR line cutting across two arced rows), which must not count twice.
 */
const unique = (tokens: string[]) => tokens.filter((token, i) => tokens.findIndex((other) => other.toLocaleLowerCase("tr") === token.toLocaleLowerCase("tr")) === i);

/** The rows as one list text, the way the scanner joins them (hyphenated words rejoined). */
function listText(rows: string[]): string {
  return rows
    .reduce((acc, part) => (!acc ? part : acc.endsWith("-") && /^\p{Ll}/u.test(part) ? acc.slice(0, -1) + part : `${acc} ${part}`), "")
    .replace(/(\p{L})\|(\p{L})/gu, "$1l$2")
    .replace(/\.\s+(?=\p{Lu})/gu, ", ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\s.,;:]+$/, "");
}

/**
 * First "was the whole list read?" (the row boundaries, listBoundaries.ts), then, only if so, "what
 * does it contain?" (the unchanged analysis, with the evidence frames: frameMerge.ts). The two
 * questions stay apart: an unrecognised name never makes a reading incomplete, and an incomplete
 * reading never gets analysed.
 */
/**
 * A bracket left open at the end of the text ("(CI 77891" whose ")" OCR lost). Counted as the
 * analysis' tokenizer counts: a stray ")" ("Cetyl Alcoho)", an l misread) closes nothing and drops nothing.
 */
export function leftOpen(text: string): boolean {
  let depth = 0;
  for (const c of text) {
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth = Math.max(0, depth - 1);
  }
  return depth > 0;
}

/**
 * The list's brackets: every "(" closed. The analysis' tokenizer skips bracketed text, so an opening
 * bracket whose ")" OCR lost would silently drop every item after it (the rest of the list, 20+ names
 * on a real tube). An unbalanced reading is an incomplete one: never analysed.
 */
function bracketCheck(candidate: ScanCandidate): BoundaryCheck | null {
  const rows = candidate.readings[0].rows;
  if (!leftOpen(rows.join(" ")) && !leftOpen(candidate.ingredientsText)) return null;
  let depth = 0;
  let opened = rows.length - 1;
  rows.forEach((row, r) => {
    for (const c of row) {
      if (c === "(" || c === "[") {
        if (depth === 0) opened = r;
        depth++;
      } else if (c === ")" || c === "]") depth = Math.max(0, depth - 1);
    }
  });
  return { kind: "brackets", row: opened, verified: false, reason: "unbalanced parentheses: a bracket is never closed", before: rows[opened]?.slice(-24) ?? "", after: "" };
}

function wordSetOf(vocabulary: IngredientVocabulary): WordSet {
  let words = wordSets.get(vocabulary);
  if (!words) {
    words = buildWordSet(vocabulary);
    wordSets.set(vocabulary, words);
  }
  return words;
}

export function validateScan(candidate: ScanCandidate, vocabulary: IngredientVocabulary, score: Parameters<typeof analyzeFrames>[2] = scoreIngredients): ScanValidation {
  const words = wordSetOf(vocabulary);
  const combined = combine(candidate, vocabulary, words);
  const brackets = bracketCheck(candidate);
  const boundaries = brackets ? { verified: false, checks: [...combined.checks, brackets] } : combined;
  if (!boundaries.verified) return { complete: false, boundaries, analysis: null };
  const analysis = analyzeFrames(
    [
      { status: "ok", tokens: candidate.edges ? unique(parseIngredientsText(listText(rowsWithReadEdges(candidate, vocabulary, words)))) : parseIngredientsText(candidate.ingredientsText), role: "complete" },
      ...candidate.evidence.map((items) => ({ status: "ok", tokens: parseIngredientsText(items.join(", ")), role: "evidence" as const })),
    ],
    vocabulary,
    score
  );
  return { complete: true, boundaries, analysis };
}

export type ScanStatus = "COMPLETE" | "INCOMPLETE";
export type AnalysisStatus =
  | "SCORE_AVAILABLE"
  | "BLOCKED_UNKNOWN"
  | "BLOCKED_UNCERTAIN_FLAGGED"
  | "BLOCKED_LOW_COVERAGE"
  | "BLOCKED_FRAME_CONFLICT"
  | "BLOCKED_EMPTY"
  | "NOT_ANALYSED";

/**
 * The two outcomes kept apart: whether the scanner read the whole list, and whether the analysis could
 * vouch for a score. A whole list whose score is withheld (an unknown name that could be a flagged
 * one) is a complete scan: scanning again wouldn't change the label.
 */
export function outcome(validation: ScanValidation): { scanStatus: ScanStatus; analysisStatus: AnalysisStatus } {
  if (!validation.complete) return { scanStatus: "INCOMPLETE", analysisStatus: "NOT_ANALYSED" };
  const merged = validation.analysis?.merged;
  if (!merged) return { scanStatus: "COMPLETE", analysisStatus: "BLOCKED_EMPTY" };
  if (merged.scoring) return { scanStatus: "COMPLETE", analysisStatus: "SCORE_AVAILABLE" };
  const blocked: Record<string, AnalysisStatus> = {
    unrecognizable: "BLOCKED_UNKNOWN",
    uncertain_flagged: "BLOCKED_UNCERTAIN_FLAGGED",
    low_coverage: "BLOCKED_LOW_COVERAGE",
    frame_conflict: "BLOCKED_FRAME_CONFLICT",
    empty: "BLOCKED_EMPTY",
  };
  return { scanStatus: "COMPLETE", analysisStatus: blocked[merged.withheldReason ?? "empty"] ?? "BLOCKED_EMPTY" };
}

/**
 * Whether an unknown name looks misread by OCR rather than missing from the dictionary: a character
 * OCR garbles (a digit in a word, a stray symbol) or a word no known name has ("Phenoxvethanol",
 * "Carbome"). A name read right that the dictionary lacks ("Magnesium Sulfate Heptahydrate") is made of
 * known words. Used only to decide whether one more photo could help; it never changes what was read.
 */
export function ocrSuspect(text: string, suspected: string | undefined, vocabulary: IngredientVocabulary): boolean {
  if (suspected && suspected !== "none") return true;
  const { words } = wordSetOf(vocabulary);
  const parts = text.split(/[\s/]+/).map(wordKey).filter(Boolean);
  return !parts.length || parts.some((word) => !/^\d+$/.test(word) && !words.has(word));
}
