import { SUPPLEMENTARY_INCI } from "../data/supplementaryInci";
import { supabase } from "../db/supabaseClient";
import { buildVocabulary, IngredientVocabulary } from "./ingredientCoverage";
import { getRestrictedSubstanceAliasIndex } from "./restrictedSubstancesCache";

// Supabase returns at most 1000 rows per request, so the table is read in pages.
const PAGE_SIZE = 1000;

let inventoryNames: string[] = [];
let vocabulary: IngredientVocabulary | null = null;

/**
 * Loads every INCI name from the CosIng inventory (`cosing_ingredients`, filled by
 * backend/src/scripts/importCosing.ts). Used to tell a real ingredient name from an
 * OCR misread when scoring photographed ingredient lists. Call once at startup.
 */
export async function loadIngredientInventory(): Promise<void> {
  const names: string[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("cosing_ingredients")
      .select("inci_name")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
      .returns<{ inci_name: string }[]>();

    if (error) {
      throw new Error(`Failed to load cosing_ingredients: ${error.message}`);
    }
    names.push(...(data ?? []).map((row) => row.inci_name));
    if (!data || data.length < PAGE_SIZE) break;
  }

  inventoryNames = names;
  vocabulary = null;
  if (names.length === 0) {
    console.warn("cosing_ingredients is empty: photo analyses will be withheld until `npm run import:cosing` is run.");
  } else {
    console.log(`INCI inventory loaded: ${names.length} names.`);
  }
}

/** Null until the inventory is loaded (and non-empty); combines it with the hand-kept names CosIng lacks and the restricted aliases. */
export function getIngredientVocabulary(): IngredientVocabulary | null {
  if (inventoryNames.length === 0) return null;
  vocabulary ??= buildVocabulary([...inventoryNames, ...SUPPLEMENTARY_INCI], getRestrictedSubstanceAliasIndex().keys());
  return vocabulary;
}
