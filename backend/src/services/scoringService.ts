import { getRestrictedSubstanceAliasIndex } from "./restrictedSubstancesCache";
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

/**
 * Splits a raw OBF "ingredients_text" (comma-separated INCI names) into
 * individual normalized ingredient tokens. Parenthesised content is dropped,
 * but only after splitting so that commas *inside* parentheses (e.g. "oils
 * (may include lemon, lime, orange)") don't get sliced into bare words like
 * "orange" that could coincidentally match an unrelated restricted alias.
 */
export function parseIngredientsText(ingredientsText: string | null | undefined): string[] {
  if (!ingredientsText) return [];

  const tokens: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of ingredientsText) {
    if (char === "(") {
      depth++;
      continue;
    }
    if (char === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if ((char === "," || char === ";") && depth === 0) {
      tokens.push(current.trim());
      current = "";
      continue;
    }
    if (depth === 0) {
      current += char;
    }
  }
  tokens.push(current.trim());

  return tokens.filter((token) => token.length > 0);
}

function ratingFromScore(score: number): CleanRating {
  if (score >= 80) return "clean";
  if (score >= 50) return "moderate";
  return "riskli";
}

export function scoreIngredients(ingredientTokens: string[]): ScoringResult {
  const aliasIndex = getRestrictedSubstanceAliasIndex();
  const flagged: FlaggedIngredient[] = [];
  let score = 100;
  let pregnancySafe = true;

  for (const token of ingredientTokens) {
    for (const match of aliasIndex.get(normalize(token)) ?? []) {
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
  }

  score = Math.max(0, Math.min(100, score));

  return {
    cleanScore: score,
    cleanRating: ratingFromScore(score),
    pregnancySafe,
    flaggedIngredients: flagged,
  };
}

/** Returns null when there is no ingredient list: an empty list must not read as "clean". */
export function scoreIngredientsText(ingredientsText: string | null | undefined): ScoringResult | null {
  const tokens = parseIngredientsText(ingredientsText);
  return tokens.length > 0 ? scoreIngredients(tokens) : null;
}
