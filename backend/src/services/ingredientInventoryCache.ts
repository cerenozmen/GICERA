import { COMMON_NAMES } from "../data/commonNames";
import { functionTags } from "../data/cosingFunctions";
import { SUPPLEMENTARY_INCI } from "../data/supplementaryInci";
import { supabase } from "../db/supabaseClient";
import { buildVocabulary, inciKey, IngredientVocabulary } from "./ingredientCoverage";
import { getRestrictedSubstanceAliasIndex } from "./restrictedSubstancesCache";

// Supabase returns at most 1000 rows per request, so the table is read in pages.
const PAGE_SIZE = 1000;

let inventoryNames: string[] = [];
let vocabulary: IngredientVocabulary | null = null;
/** Turkish function tags by INCI key (see cosingFunctions.ts). */
let functions = new Map<string, string[]>();

/**
 * Loads every INCI name from the CosIng inventory (`cosing_ingredients`, filled by
 * backend/src/scripts/importCosing.ts). Used to tell a real ingredient name from an
 * OCR misread when scoring photographed ingredient lists. Call once at startup.
 */
export async function loadIngredientInventory(): Promise<void> {
  const names: string[] = [];
  const tags = new Map<string, string[]>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("cosing_ingredients")
      .select("inci_name, function")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
      .returns<{ inci_name: string; function: string | null }[]>();

    if (error) {
      throw new Error(`Failed to load cosing_ingredients: ${error.message}`);
    }
    for (const row of data ?? []) {
      names.push(row.inci_name);
      const found = functionTags(row.function);
      if (found.length && !tags.has(inciKey(row.inci_name))) tags.set(inciKey(row.inci_name), found);
    }
    if (!data || data.length < PAGE_SIZE) break;
  }

  inventoryNames = names;
  functions = tags;
  vocabulary = null;
  if (names.length === 0) {
    console.warn("cosing_ingredients is empty: photo analyses will be withheld until `npm run import:cosing` is run.");
  } else {
    console.log(`INCI inventory loaded: ${names.length} names.`);
  }
}

/** Null until the inventory is loaded (and non-empty); combines it with the hand-kept names CosIng lacks, the restricted aliases and the common names. */
export function getIngredientVocabulary(): IngredientVocabulary | null {
  if (inventoryNames.length === 0) return null;
  vocabulary ??= buildVocabulary([...inventoryNames, ...SUPPLEMENTARY_INCI], getRestrictedSubstanceAliasIndex().keys(), COMMON_NAMES);
  return vocabulary;
}

/** What an ingredient does, as Turkish tags from CosIng (empty when CosIng lists no function for it). */
export function getIngredientFunctions(inciName: string): string[] {
  return functions.get(inciKey(inciName)) ?? [];
}
