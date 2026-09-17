import { supabase } from "../db/supabaseClient";
import { restrictedIngredientSeed } from "../data/restrictedIngredients";
import { RestrictionType } from "../types/product";

export interface RestrictedSubstanceEntry {
  inciName: string;
  restrictionType: RestrictionType;
  notes: string | null;
}

interface RestrictedSubstanceRow {
  inci_name: string;
  aliases: string[];
  restriction_type: RestrictionType;
  notes: string | null;
}

let aliasIndex = new Map<string, RestrictedSubstanceEntry>();
let loaded = false;

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

function addEntry(alias: string, entry: RestrictedSubstanceEntry): void {
  const key = normalize(alias);
  if (!key) return;
  // CosIng Annex II/III (banned/restricted) takes priority over the softer
  // "controversial" flags (Annex IV-VI, curated seed) if an alias collides.
  const existing = aliasIndex.get(key);
  if (existing && existing.restrictionType === "banned") return;
  aliasIndex.set(key, entry);
}

/**
 * Loads the CosIng-derived restricted substance list (see
 * backend/src/scripts/importCosing.ts) from Supabase, merged with a small
 * hand-curated set of pregnancy-safety flags that CosIng itself doesn't
 * cover. Call once at process startup before any scoring happens.
 */
export async function loadRestrictedSubstances(): Promise<void> {
  const index = new Map<string, RestrictedSubstanceEntry>();
  aliasIndex = index;

  const { data, error } = await supabase
    .from("restricted_substances")
    .select("inci_name, aliases, restriction_type, notes")
    .returns<RestrictedSubstanceRow[]>();

  if (error) {
    throw new Error(`Failed to load restricted_substances: ${error.message}`);
  }

  for (const row of data ?? []) {
    const entry: RestrictedSubstanceEntry = {
      inciName: row.inci_name,
      restrictionType: row.restriction_type,
      notes: row.notes,
    };
    addEntry(row.inci_name, entry);
    for (const alias of row.aliases ?? []) {
      addEntry(alias, entry);
    }
  }

  for (const seedEntry of restrictedIngredientSeed) {
    const entry: RestrictedSubstanceEntry = {
      inciName: seedEntry.inciName,
      restrictionType: seedEntry.restrictionType,
      notes: seedEntry.notes,
    };
    for (const alias of seedEntry.aliases) {
      addEntry(alias, entry);
    }
  }

  loaded = true;
  console.log(
    `Restricted substances loaded: ${data?.length ?? 0} CosIng rows, ${aliasIndex.size} matchable aliases.`
  );
}

export function getRestrictedSubstanceAliasIndex(): Map<string, RestrictedSubstanceEntry> {
  if (!loaded) {
    throw new Error("Restricted substances not loaded yet. Call loadRestrictedSubstances() first.");
  }
  return aliasIndex;
}
