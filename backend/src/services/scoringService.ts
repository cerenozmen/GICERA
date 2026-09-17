import { restrictedIngredientSeed } from "../data/restrictedIngredients";
import { CleanRating, FlaggedIngredient, RestrictionType, ScoringResult } from "../types/product";

const PENALTY_BY_TYPE: Record<RestrictionType, number> = {
  banned: 60,
  restricted: 15,
  pregnancy_unsafe: 10,
  controversial: 5,
};

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

// alias -> seed entry, built once at module load
const aliasIndex = new Map<string, (typeof restrictedIngredientSeed)[number]>();
for (const entry of restrictedIngredientSeed) {
  for (const alias of entry.aliases) {
    aliasIndex.set(normalize(alias), entry);
  }
}

/**
 * Splits a raw OBF "ingredients_text" (comma-separated INCI names) into
 * individual normalized ingredient tokens.
 */
export function parseIngredientsText(ingredientsText: string | null | undefined): string[] {
  if (!ingredientsText) return [];
  return ingredientsText
    .split(/[,;]/)
    .map((token) => token.replace(/\([^)]*\)/g, "").trim())
    .filter((token) => token.length > 0);
}

function ratingFromScore(score: number): CleanRating {
  if (score >= 80) return "clean";
  if (score >= 50) return "moderate";
  return "riskli";
}

export function scoreIngredients(ingredientTokens: string[]): ScoringResult {
  const flagged: FlaggedIngredient[] = [];
  let score = 100;
  let pregnancySafe = true;

  for (const token of ingredientTokens) {
    const match = aliasIndex.get(normalize(token));
    if (!match) continue;

    flagged.push({
      inciName: match.inciName,
      restrictionType: match.restrictionType,
      notes: match.notes,
    });

    score -= PENALTY_BY_TYPE[match.restrictionType];
    if (match.restrictionType === "pregnancy_unsafe") {
      pregnancySafe = false;
    }
  }

  score = Math.max(0, Math.min(100, score));

  return {
    cleanScore: score,
    cleanRating: ratingFromScore(score),
    pregnancySafe,
    flaggedIngredients: flagged,
  };
}

export function scoreIngredientsText(ingredientsText: string | null | undefined): ScoringResult {
  return scoreIngredients(parseIngredientsText(ingredientsText));
}
