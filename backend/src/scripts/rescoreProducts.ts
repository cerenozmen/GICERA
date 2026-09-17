import { supabase } from "../db/supabaseClient";
import { loadRestrictedSubstances } from "../services/restrictedSubstancesCache";
import { scoreIngredientsText } from "../services/scoringService";

/**
 * Recomputes clean_score/clean_rating/pregnancy_safe/flagged_ingredients for
 * every product that already has ingredients_text, using the current
 * restricted_substances data. Run after importing/updating CosIng data
 * (npm run import:cosing) so previously-imported products pick up the
 * refreshed rules. Usage: npm run rescore [-- --dry-run]
 */

const PAGE_SIZE = 500;

interface ProductRow {
  barcode: string;
  ingredients_text: string;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  await loadRestrictedSubstances();

  // Keyset pagination on barcode: this script updates the very rows it's
  // paging through, so OFFSET-based .range() paging is unsafe (Postgres
  // gives no ordering guarantee across separate queries once rows are
  // rewritten mid-scan, which silently skips some of them).
  let cursor = "";
  let updated = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("products")
      .select("barcode, ingredients_text")
      .not("ingredients_text", "is", null)
      .neq("ingredients_text", "")
      .gt("barcode", cursor)
      .order("barcode", { ascending: true })
      .limit(PAGE_SIZE)
      .returns<ProductRow[]>();

    if (error) throw new Error(`Fetch failed: ${error.message}`);
    if (!data || data.length === 0) break;

    const rows = data.map((product) => {
      const scoring = scoreIngredientsText(product.ingredients_text);
      return {
        barcode: product.barcode,
        clean_score: scoring.cleanScore,
        clean_rating: scoring.cleanRating,
        pregnancy_safe: scoring.pregnancySafe,
        flagged_ingredients: scoring.flaggedIngredients,
        updated_at: new Date().toISOString(),
      };
    });

    if (!dryRun) {
      const { error: upsertError } = await supabase
        .from("products")
        .upsert(rows, { onConflict: "barcode" });
      if (upsertError) throw new Error(`Upsert failed: ${upsertError.message}`);
    }

    updated += rows.length;
    cursor = data[data.length - 1].barcode;
    console.log(`... rescored ${updated} products`);

    if (data.length < PAGE_SIZE) break;
  }

  console.log(`Done. rescored=${updated} dryRun=${dryRun}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
