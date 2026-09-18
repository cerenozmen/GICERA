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

export interface AnalysisResult {
  ingredientsText: string;
  cleanScore: number;
  cleanRating: CleanRating;
  pregnancySafe: boolean;
  flaggedIngredients: FlaggedIngredient[];
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error ?? `Sunucu hatası (${response.status})`);
  }
  return data as T;
}

/** Reads the ingredient list from a packaging photo. Resolves null when the photo has no legible list. */
export async function extractIngredientsFromImage(imageBase64: string): Promise<string | null> {
  const { ingredientsText } = await postJson<{ ingredientsText: string | null }>("/analyze/image", {
    imageBase64,
    mediaType: "image/jpeg",
  });
  return ingredientsText;
}

export function analyzeIngredientsText(ingredientsText: string): Promise<AnalysisResult> {
  return postJson<AnalysisResult>("/analyze/text", { ingredientsText });
}
