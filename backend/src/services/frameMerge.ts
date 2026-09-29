import { ScoringResult } from "../types/product";
import {
  analyzePhotoIngredients,
  boundedDistance,
  IngredientAssessment,
  IngredientVocabulary,
  inciKey,
  lookalikeTolerance,
  PhotoAnalysis,
} from "./ingredientCoverage";

/**
 * Experimental multi-frame reading. One shutter press takes a few frames (or a live scan collects
 * slices of the list as "evidence" frames); OCR slips differ from frame
 * to frame ("Phenoxyethanl" in one, "Phenoxyethanol" in the others). Each frame goes through the usual
 * single-frame pipeline on its own, then the frames are aligned by ingredient order and only exact
 * reads from one frame are used to resolve another frame's unknowns:
 *  - frames the app found incomplete (partial, no list, unreadable) take no part, so pieces of
 *    different frames are never stitched into a "complete" list;
 *  - the best complete frame is the base; its order and completeness carry over to the result;
 *  - a base unknown becomes a name only if an aligned frame read exactly that name, the spellings are
 *    close, all frames that read it exactly agree, and the name isn't already on the list;
 *  - an ingredient the base missed is inserted if another complete frame read it exactly between two
 *    positions both frames share (never at either end of the list);
 *  - frames disagreeing on an exactly-read name at the same position withhold the score if the
 *    names score differently;
 *  - the merged list then goes through analyzePhotoIngredients with every existing rule.
 * Nothing is ever matched by resemblance alone.
 */

export interface FrameInput {
  /** The app's list extraction result for this frame: ok, partial, no_list or unreadable. */
  status: string;
  tokens: string[];
  /**
   * complete (default): a whole list, which can be the base. evidence: a piece of the list (a slice of
   * the rows seen in a live scan); it is never the base and only contributes exact reads, aligned
   * anywhere along the base.
   */
  role?: "complete" | "evidence";
}

export interface FrameSummary {
  status: string;
  role: "complete" | "evidence";
  analysis: PhotoAnalysis | null;
}

export interface MergeEvent {
  /** Position in the merged list. */
  position: number;
  /** Base frame's reading ("" for an inserted ingredient). */
  read: string;
  /** Name taken from exact reads, or the names that disagree (conflicts). */
  names: string[];
  /** 0-based frames that read the name(s) exactly. */
  frames: number[];
}

export interface MultiFrameAnalysis {
  frames: FrameSummary[];
  /** Index of the base frame; null when no frame had a complete list. */
  base: number | null;
  /** When no frame is usable: the status to report (partial if any frame was partial). */
  status: string;
  corrections: MergeEvent[];
  insertions: MergeEvent[];
  conflicts: MergeEvent[];
  merged: PhotoAnalysis | null;
}

type Pair = [number | null, number | null];

/** Similarity used only to line positions up; it never decides what an ingredient is. */
function alignmentScore(a: IngredientAssessment, b: IngredientAssessment): number {
  if (a.matchedName && b.matchedName) return a.matchedName === b.matchedName ? 2 : -1;
  const ka = inciKey(a.text);
  const kb = inciKey(b.text);
  const tolerance = lookalikeTolerance(ka.length >= kb.length ? ka : kb);
  return boundedDistance(ka, kb, tolerance) <= tolerance ? 1 : -1;
}

/**
 * Needleman-Wunsch alignment of two ingredient sequences (gap penalty -1). With `anywhere`, the other
 * sequence is a piece that may sit anywhere along the base: skipping base items before or after it is
 * free (semi-global alignment).
 */
function align(base: IngredientAssessment[], other: IngredientAssessment[], anywhere = false): Pair[] {
  const n = base.length;
  const m = other.length;
  const dp = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (anywhere && j === 0 ? 0 : -(i + j))));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = Math.max(dp[i - 1][j - 1] + alignmentScore(base[i - 1], other[j - 1]), dp[i - 1][j] - 1, dp[i][j - 1] - 1);
    }
  }
  const pairs: Pair[] = [];
  let i = n;
  let j = m;
  if (anywhere) {
    // End where the piece fits best; the base items after it are skipped for free.
    for (let k = 0; k <= n; k++) if (dp[k][m] > dp[i][m]) i = k;
    for (let k = n - 1; k >= i; k--) pairs.push([k, null]);
  }
  while (i > 0 || j > 0) {
    if (anywhere && j === 0) {
      pairs.push([i - 1, null]);
      i--;
      continue;
    }
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + alignmentScore(base[i - 1], other[j - 1])) {
      pairs.push([i - 1, j - 1]);
      i--;
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] - 1) {
      pairs.push([i - 1, null]);
      i--;
    } else {
      pairs.push([null, j - 1]);
      j--;
    }
  }
  return pairs.reverse();
}

export function analyzeFrames(
  inputs: FrameInput[],
  vocabulary: IngredientVocabulary,
  score: (names: string[]) => ScoringResult
): MultiFrameAnalysis {
  const frames: FrameSummary[] = inputs.map((frame) => ({
    status: frame.status,
    role: frame.role ?? "complete",
    analysis: frame.status === "ok" && frame.tokens.length ? analyzePhotoIngredients(frame.tokens, vocabulary, score) : null,
  }));
  const isEvidence = (index: number) => inputs[index].role === "evidence";
  const donors = frames.flatMap((frame, index) => (frame.analysis ? [index] : []));
  const usable = donors.filter((index) => !isEvidence(index));
  const empty = { corrections: [], insertions: [], conflicts: [], merged: null };
  if (usable.length === 0) {
    const status = inputs.some((frame) => frame.status === "partial") ? "partial" : inputs[0]?.status ?? "unreadable";
    return { frames, base: null, status, ...empty };
  }

  // Base: the complete frame with the most exact reads, so a short list that happens to be fully read
  // (a frame that caught only part of the label) can't become the base; then the fewest risky unknowns.
  const risky = (a: PhotoAnalysis) => a.ingredients.filter((i) => i.status === "unknown" && i.kind !== "resembles_safe" && i.kind !== "unlisted").length;
  const base = [...usable].sort((x, y) => {
    const a = frames[x].analysis!;
    const b = frames[y].analysis!;
    return b.matched - a.matched || risky(a) - risky(b) || b.readCoverage - a.readCoverage || x - y;
  })[0];
  const baseItems = frames[base].analysis!.ingredients;

  // For each base position: exact reads aligned to it in the other frames; plus exact reads the base missed.
  const alignedExact = baseItems.map(() => new Map<string, number[]>());
  // How the aligned frames spelled each exact name ("Magnesium Sulfate Heptahydrate" for magnesium sulfate).
  const alignedSpellings = baseItems.map(() => new Map<string, Set<string>>());
  const gapExact = new Map<number, { name: string; frames: number[] }[]>(); // keyed by the base position after the gap
  for (const index of donors) {
    if (index === base) continue;
    const otherItems = frames[index].analysis!.ingredients;
    const pairs = align(baseItems, otherItems, isEvidence(index));
    const firstAligned = pairs.findIndex(([b, o]) => b !== null && o !== null);
    const lastAligned = pairs.length - 1 - [...pairs].reverse().findIndex(([b, o]) => b !== null && o !== null);
    let nextBase = 0;
    pairs.forEach(([b, o], k) => {
      if (b !== null) nextBase = b + 1;
      if (o === null) return;
      const name = otherItems[o].matchedName;
      if (!name) return;
      if (b !== null) {
        const frameList = alignedExact[b].get(name) ?? [];
        alignedExact[b].set(name, [...frameList, index]);
        alignedSpellings[b].set(name, (alignedSpellings[b].get(name) ?? new Set()).add(otherItems[o].text));
      } else if (k > firstAligned && k < lastAligned) {
        const slot = gapExact.get(nextBase) ?? [];
        const existing = slot.find((entry) => entry.name === name);
        if (existing) existing.frames.push(index);
        else slot.push({ name, frames: [index] });
        gapExact.set(nextBase, slot);
      }
    });
  }

  const contribution = (name: string) => 100 - score([name]).cleanScore;
  const onList = new Set(baseItems.flatMap((item) => (item.matchedName ? [item.matchedName] : [])));
  const corrections: MergeEvent[] = [];
  const insertions: MergeEvent[] = [];
  const conflicts: MergeEvent[] = [];
  const tokens: string[] = [];

  baseItems.forEach((item, position) => {
    for (const { name, frames: sources } of gapExact.get(position) ?? []) {
      if (onList.has(name)) continue;
      onList.add(name);
      insertions.push({ position: tokens.length, read: "", names: [name], frames: sources });
      tokens.push(name);
    }

    const reads = alignedExact[position];
    const spelledAlike = (a: string, b: string) => boundedDistance(inciKey(a), inciKey(b), lookalikeTolerance(inciKey(a))) <= lookalikeTolerance(inciKey(a));
    if (item.matchedName) {
      // Another exact name counts as a disagreement only if one could be a misread of the other;
      // unrelated names at one position mean the alignment slipped there.
      const others = [...reads.keys()].filter((name) => name !== item.matchedName && spelledAlike(item.matchedName!, name));
      if (others.length) {
        const names = [item.matchedName, ...others];
        conflicts.push({ position: tokens.length, read: item.text, names, frames: others.flatMap((name) => reads.get(name)!) });
      }
      tokens.push(item.matchedName);
      return;
    }

    const candidates = [...reads.keys()].filter(
      (name) => spelledAlike(item.text, name) || [...(alignedSpellings[position].get(name) ?? [])].some((text) => spelledAlike(item.text, text))
    );
    if (candidates.length === 1 && !onList.has(candidates[0])) {
      onList.add(candidates[0]);
      corrections.push({ position: tokens.length, read: item.text, names: candidates, frames: reads.get(candidates[0])! });
      tokens.push(candidates[0]);
      return;
    }
    if (candidates.length > 1) {
      conflicts.push({ position: tokens.length, read: item.text, names: candidates, frames: candidates.flatMap((name) => reads.get(name)!) });
    }
    tokens.push(item.text);
  });

  // Unknowns read letter for letter the same in two or more frames: read right, missing from the inventory.
  // A scan's complete list is built from its evidence frames' own readings, so with evidence only the
  // evidence frames count: one photo must not confirm itself.
  const readIn = new Map<string, number>();
  const witnesses = donors.some(isEvidence) ? donors.filter(isEvidence) : donors;
  for (const index of witnesses) {
    const keys = new Set(frames[index].analysis!.ingredients.flatMap((item) => (item.status === "unknown" ? [inciKey(item.text)] : [])));
    for (const key of keys) readIn.set(key, (readIn.get(key) ?? 0) + 1);
  }
  const confirmed = new Set([...readIn].flatMap(([key, count]) => (count >= 2 ? [key] : [])));

  const merged = analyzePhotoIngredients(tokens, vocabulary, score, confirmed);
  // Two frames reading different exact names at one position: the score is only safe if both score the same.
  const scoreChangingConflict = conflicts.some((conflict) => new Set(conflict.names.map(contribution)).size > 1);
  if (scoreChangingConflict && merged.scoring) {
    merged.withheldReason = "frame_conflict";
    merged.scoring = null;
  }
  return { frames, base, status: "ok", corrections, insertions, conflicts, merged };
}
