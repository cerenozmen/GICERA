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

// Supabase returns at most 1000 rows per request, so the table is read in pages.
const PAGE_SIZE = 1000;

// Higher = more severe. Only the most severe regulatory flag per alias is kept.
const SEVERITY: Record<RestrictionType, number> = {
  banned: 3,
  restricted: 2,
  controversial: 1,
  pregnancy_unsafe: 0,
};

let aliasIndex = new Map<string, RestrictedSubstanceEntry[]>();
let loaded = false;

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Each alias holds at most one regulatory flag (banned > restricted >
 * controversial) plus, independently, a pregnancy flag - a substance can be
 * both e.g. restricted by the EU and unsuitable in pregnancy.
 */
function addEntry(alias: string, entry: RestrictedSubstanceEntry): void {
  const key = normalize(alias);
  if (!key) return;

  const isPregnancy = entry.restrictionType === "pregnancy_unsafe";
  const current = aliasIndex.get(key) ?? [];
  const sameKind = current.find((e) => (e.restrictionType === "pregnancy_unsafe") === isPregnancy);

  if (!sameKind) {
    aliasIndex.set(key, [...current, entry]);
  } else if (!isPregnancy && SEVERITY[entry.restrictionType] > SEVERITY[sameKind.restrictionType]) {
    aliasIndex.set(key, current.map((e) => (e === sameKind ? entry : e)));
  }
}

async function fetchAllRestrictedSubstances(): Promise<RestrictedSubstanceRow[]> {
  const rows: RestrictedSubstanceRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("restricted_substances")
      .select("inci_name, aliases, restriction_type, notes")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
      .returns<RestrictedSubstanceRow[]>();

    if (error) {
      throw new Error(`Failed to load restricted_substances: ${error.message}`);
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

/**
 * Loads the CosIng-derived restricted substance list (see
 * backend/src/scripts/importCosing.ts) from Supabase, merged with a small
 * hand-curated set of pregnancy-safety flags that CosIng itself doesn't
 * cover. Call once at process startup before any scoring happens.
 */
export async function loadRestrictedSubstances(): Promise<void> {
  aliasIndex = new Map();
  const rows = await fetchAllRestrictedSubstances();

  for (const row of rows) {
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
  console.log(`Restricted substances loaded: ${rows.length} CosIng rows, ${aliasIndex.size} matchable aliases.`);
}

export function getRestrictedSubstanceAliasIndex(): Map<string, RestrictedSubstanceEntry[]> {
  if (!loaded) {
    throw new Error("Restricted substances not loaded yet. Call loadRestrictedSubstances() first.");
  }
  return aliasIndex;
}
