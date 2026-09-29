import { API_BASE_URL } from "./config";
import { CleanRating, FlaggedIngredient, LookupResult } from "./types";

export async function lookupBarcode(barcode: string): Promise<LookupResult> {
  const response = await fetch(`${API_BASE_URL}/products/${encodeURIComponent(barcode)}`);
  if (response.status === 404) {
    return (await response.json()) as LookupResult;
  }
  if (!response.ok) {
    throw new Error(`Sunucu hatası (${response.status})`);
  }
  return (await response.json()) as LookupResult;
}

export interface AnalysedIngredient {
  text: string;
  status: "matched" | "unknown";
  matchedName?: string;
  /** Scanner results, unknown names: OCR visibly misread it (not merely missing from the dictionary). */
  ocrSuspect?: boolean;
  /**
   * Unknown names: why the name couldn't be verified (backend ingredientCoverage.ts). resembles_flagged
   * and unrecognizable names withhold the score; the others can't change it.
   */
  kind?: "resembles_safe" | "resembles_flagged" | "unrecognizable" | "unlisted";
}

/**
 * The names that withheld the score: misread (OCR garbled them, or they look like a flagged
 * substance) and missing from the dictionary (read right, but not a name it lists).
 */
export function scoreBlockers(ingredients: AnalysedIngredient[]): { misread: string[]; notInDictionary: string[] } {
  const blocking = ingredients.filter((i) => i.status === "unknown" && (i.kind === "resembles_flagged" || i.kind === "unrecognizable"));
  return {
    misread: blocking.filter((i) => i.kind === "resembles_flagged" || i.ocrSuspect !== false).map((i) => i.text),
    notInDictionary: blocking.filter((i) => i.kind === "unrecognizable" && i.ocrSuspect === false).map((i) => i.text),
  };
}

/**
 * The server withholds the score (reliable: false) unless the names it couldn't verify provably
 * can't change it (see backend ingredientCoverage.ts).
 */
export type AnalysisResult = {
  ingredientsText: string;
  detected: number;
  matched: number;
  unknown: number;
  coverage: number;
  ingredients: AnalysedIngredient[];
} & (
  | { reliable: true; cleanScore: number; cleanRating: CleanRating; pregnancySafe: boolean; flaggedIngredients: FlaggedIngredient[] }
  | { reliable: false }
);

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Sunucuya ulaşılamadı. İnternet bağlantını kontrol edip tekrar dene.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error ?? `Sunucu hatası (${response.status})`);
  }
  return data as T;
}

/**
 * The ingredient scanner's answer: `complete: false` while some row boundary of the list hasn't been
 * seen whole (the list may be cut there); otherwise the analysis, which may still withhold the score.
 */
/** Whether the scanner read the whole list, and whether the analysis could give a score: two questions. */
export type ScanStatus = "COMPLETE" | "INCOMPLETE";
export type AnalysisStatus =
  | "SCORE_AVAILABLE"
  | "BLOCKED_UNKNOWN"
  | "BLOCKED_UNCERTAIN_FLAGGED"
  | "BLOCKED_LOW_COVERAGE"
  | "BLOCKED_FRAME_CONFLICT"
  | "BLOCKED_EMPTY"
  | "NOT_ANALYSED";

export type ScanResult = { scanStatus: ScanStatus; analysisStatus: AnalysisStatus; /** Server processing time. */ serverMs?: number } & (
  | { complete: false; reliable: false; unverifiedBoundaries: { kind: "start" | "break" | "end" | "brackets"; row: number; reason: string }[] }
  | ({ complete: true } & AnalysisResult)
);

/** Checks a scanner candidate (see ingredientScanner.ts `candidates`) and analyses it once complete. */
export function analyzeScan(candidate: {
  path: string;
  readings: { rows: string[]; heading: boolean }[];
  edges?: { starts: string[]; ends: string[] }[];
  ingredientsText: string;
  evidence: string[][];
}): Promise<ScanResult> {
  const { path, readings, edges, ingredientsText, evidence } = candidate;
  // The server takes at most 200 evidence lists; the latest ones are the most useful.
  return postJson<ScanResult>("/analyze/scan", { path, readings, edges, ingredientsText, evidence: evidence.slice(-200) });
}
