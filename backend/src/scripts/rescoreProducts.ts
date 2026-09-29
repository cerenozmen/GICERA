import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { supabase } from "../db/supabaseClient";
import { loadRestrictedSubstances } from "../services/restrictedSubstancesCache";
import { scoreIngredientsText } from "../services/scoringService";

/**
 * Recomputes clean_score/clean_rating/pregnancy_safe/flagged_ingredients for every product that has
 * ingredients_text, using the current restricted_substances data and seed. Run after importing or
 * correcting CosIng/seed data so stored products pick up the new rules.
 *
 *   npm run rescore -- --dry-run                    # list what would change, write nothing
 *   npm run rescore -- --expect=barcodes.json       # write only if exactly these barcodes change
 *   npm run rescore -- --max-changes=100            # write only if at most this many change
 *   npm run rescore -- --restore=backups/rescore-<time>.json   # put a backup's values back
 *
 * Only rows whose scoring actually changes are written. Before writing, their current values are saved
 * to backups/; all changes go out in one upsert request, which PostgREST runs as a single transaction
 * (all rows or none). Afterwards the rows are read back, and if any differs from what was written the
 * backup is restored.
 */

const PAGE_SIZE = 1000;
const BACKUP_DIR = path.join(__dirname, "../../backups");

interface ScoringColumns {
  barcode: string;
  clean_score: number | null;
  clean_rating: string | null;
  pregnancy_safe: boolean | null;
  flagged_ingredients: unknown[];
}

interface Change {
  before: ScoringColumns & { updated_at: string };
  after: ScoringColumns;
}

function argValue(name: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
}

/** JSON with object keys sorted: Postgres jsonb doesn't keep the key order it was written with. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${canonicalJson(inner)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const sameScoring = (a: ScoringColumns, b: ScoringColumns) =>
  a.clean_score === b.clean_score &&
  a.clean_rating === b.clean_rating &&
  a.pregnancy_safe === b.pregnancy_safe &&
  canonicalJson(a.flagged_ingredients ?? []) === canonicalJson(b.flagged_ingredients ?? []);

const describe = (row: ScoringColumns) => `${row.clean_score ?? "-"} ${row.clean_rating ?? "-"} pregnancySafe=${row.pregnancy_safe}`;

async function findChanges(): Promise<Change[]> {
  const changes: Change[] = [];
  // Keyset pagination on barcode: stable across pages, unlike OFFSET.
  let cursor = "";
  let scanned = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("products")
      .select("barcode, ingredients_text, clean_score, clean_rating, pregnancy_safe, flagged_ingredients, updated_at")
      .not("ingredients_text", "is", null)
      .neq("ingredients_text", "")
      .gt("barcode", cursor)
      .order("barcode", { ascending: true })
      .limit(PAGE_SIZE);
    if (error) throw new Error(`Fetch failed: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const product of data) {
      const scoring = scoreIngredientsText(product.ingredients_text);
      const after: ScoringColumns = {
        barcode: product.barcode,
        clean_score: scoring?.cleanScore ?? null,
        clean_rating: scoring?.cleanRating ?? null,
        pregnancy_safe: scoring?.pregnancySafe ?? null,
        flagged_ingredients: scoring?.flaggedIngredients ?? [],
      };
      const { ingredients_text: _text, ...before } = product;
      if (!sameScoring(before, after)) changes.push({ before, after });
    }
    scanned += data.length;
    cursor = data[data.length - 1].barcode;
    if (data.length < PAGE_SIZE) break;
  }
  console.log(`Scanned ${scanned} products with an ingredient list; ${changes.length} would change.`);
  return changes;
}

/** Writes all rows in one request, i.e. one transaction. */
async function writeRows(rows: object[]): Promise<void> {
  const { error } = await supabase.from("products").upsert(rows, { onConflict: "barcode" });
  if (error) throw new Error(`Upsert failed (nothing was written): ${error.message}`);
}

async function readBack(barcodes: string[]): Promise<Map<string, ScoringColumns>> {
  const { data, error } = await supabase
    .from("products")
    .select("barcode, clean_score, clean_rating, pregnancy_safe, flagged_ingredients")
    .in("barcode", barcodes);
  if (error) throw new Error(`Read-back failed: ${error.message}`);
  return new Map((data ?? []).map((row) => [row.barcode, row]));
}

async function restore(file: string): Promise<void> {
  const backup: Change["before"][] = JSON.parse(readFileSync(file, "utf8"));
  await writeRows(backup);
  const current = await readBack(backup.map((row) => row.barcode));
  const failed = backup.filter((row) => !current.get(row.barcode) || !sameScoring(row, current.get(row.barcode)!));
  if (failed.length) throw new Error(`Restore incomplete for: ${failed.map((row) => row.barcode).join(", ")}`);
  console.log(`Restored ${backup.length} products from ${file}.`);
}

async function main(): Promise<void> {
  const restoreFile = argValue("restore");
  if (restoreFile) return restore(restoreFile);

  const dryRun = process.argv.includes("--dry-run");
  const expectFile = argValue("expect");
  const maxChanges = argValue("max-changes");
  if (!dryRun && !expectFile && maxChanges === undefined) {
    throw new Error("Refusing to write without --expect=<barcodes.json> or --max-changes=<n>; use --dry-run to preview.");
  }

  await loadRestrictedSubstances();
  const changes = await findChanges();
  for (const { before, after } of changes) {
    console.log(`  ${before.barcode.padEnd(14)} ${describe(before)}  ->  ${describe(after)}`);
  }
  if (dryRun || changes.length === 0) return;

  const changed = changes.map((change) => change.before.barcode).sort();
  if (expectFile) {
    const expected = (JSON.parse(readFileSync(expectFile, "utf8")) as string[]).sort();
    const unexpected = changed.filter((barcode) => !expected.includes(barcode));
    const missing = expected.filter((barcode) => !changed.includes(barcode));
    if (unexpected.length || missing.length) {
      throw new Error(
        `Stopped, nothing written: changes don't match ${expectFile}. ` +
          `Unexpected: [${unexpected.join(", ")}] Expected but unchanged: [${missing.join(", ")}]`
      );
    }
  }
  if (maxChanges !== undefined && changes.length > Number(maxChanges)) {
    throw new Error(`Stopped, nothing written: ${changes.length} products would change, more than --max-changes=${maxChanges}.`);
  }

  mkdirSync(BACKUP_DIR, { recursive: true });
  const backupFile = path.join(BACKUP_DIR, `rescore-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(backupFile, JSON.stringify(changes.map((change) => change.before), null, 1));
  console.log(`Backed up current values of ${changes.length} products to ${backupFile}`);

  const now = new Date().toISOString();
  await writeRows(changes.map((change) => ({ ...change.after, updated_at: now })));

  const written = await readBack(changed);
  const mismatched = changes.filter(({ after }) => !written.get(after.barcode) || !sameScoring(after, written.get(after.barcode)!));
  if (mismatched.length) {
    console.error(`Read-back mismatch for ${mismatched.map((change) => change.after.barcode).join(", ")}; restoring backup.`);
    await restore(backupFile);
    process.exit(1);
  }
  console.log(`Rescored ${changes.length} products; verified by reading them back. Undo with --restore=${backupFile}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
