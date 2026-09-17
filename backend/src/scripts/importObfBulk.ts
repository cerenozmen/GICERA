import { createReadStream } from "fs";
import { createInterface } from "readline";
import { Readable } from "stream";
import { createGunzip, Gunzip } from "zlib";
import { supabase } from "../db/supabaseClient";
import { loadRestrictedSubstances } from "../services/restrictedSubstancesCache";
import { scoreIngredientsText } from "../services/scoringService";
import { ProductSource, CleanRating, FlaggedIngredient } from "../types/product";

/**
 * Imports the Open Beauty Facts bulk JSONL export into our `products` table
 * (source = 'obf_bulk'), scoring each product's ingredients with the same
 * engine used by the live-lookup path. Run with `npm run import:obf`.
 *
 * Usage:
 *   npm run import:obf -- --limit=1000        # smoke test, no full run
 *   npm run import:obf -- --dry-run           # parse only, skip DB writes
 *   npm run import:obf -- --file=./dump.jsonl.gz   # use a local gzip file instead of downloading
 */

const DEFAULT_DUMP_URL = "https://static.openbeautyfacts.org/data/openbeautyfacts-products.jsonl.gz";
const BATCH_SIZE = 500;
const BARCODE_RE = /^\d{8,14}$/;

interface CliOptions {
  url: string;
  file: string | null;
  limit: number | null;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { url: DEFAULT_DUMP_URL, file: null, limit: null, dryRun: false };
  for (const arg of argv) {
    if (arg.startsWith("--url=")) options.url = arg.slice("--url=".length);
    else if (arg.startsWith("--file=")) options.file = arg.slice("--file=".length);
    else if (arg.startsWith("--limit=")) options.limit = Number(arg.slice("--limit=".length));
    else if (arg === "--dry-run") options.dryRun = true;
  }
  return options;
}

interface ObfBulkRecord {
  code?: string;
  product_name?: string;
  brands?: string;
}

interface ProductUpsertRow {
  barcode: string;
  product_name: string | null;
  brands: string | null;
  ingredients_text: string | null;
  image_url: string | null;
  source: ProductSource;
  clean_score: number;
  clean_rating: CleanRating;
  pregnancy_safe: boolean;
  flagged_ingredients: FlaggedIngredient[];
  updated_at: string;
}

function toProductRow(raw: ObfBulkRecord & { ingredients_text?: string }): ProductUpsertRow | null {
  const barcode = raw.code?.trim();
  if (!barcode || !BARCODE_RE.test(barcode)) return null;

  const ingredientsText = raw.ingredients_text?.trim() || null;
  const scoring = scoreIngredientsText(ingredientsText);

  return {
    barcode,
    product_name: raw.product_name?.trim() || null,
    brands: raw.brands?.trim() || null,
    ingredients_text: ingredientsText,
    // The bulk JSONL export doesn't carry a ready-made image URL (it only has
    // internal image ids); the live OBF API fallback fills images in on demand.
    image_url: null,
    source: "obf_bulk",
    clean_score: scoring.cleanScore,
    clean_rating: scoring.cleanRating,
    pregnancy_safe: scoring.pregnancySafe,
    flagged_ingredients: scoring.flaggedIngredients,
    updated_at: new Date().toISOString(),
  };
}

async function upsertBatch(rows: ProductUpsertRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from("products").upsert(rows, { onConflict: "barcode" });
  if (error) {
    throw new Error(`Batch upsert failed: ${error.message}`);
  }
}

async function openGunzippedLineStream(options: CliOptions): Promise<Gunzip> {
  if (options.file) {
    return createReadStream(options.file).pipe(createGunzip());
  }

  const response = await fetch(options.url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download dump: HTTP ${response.status}`);
  }
  return Readable.fromWeb(response.body as never).pipe(createGunzip());
}

async function main(): Promise<void> {
  await loadRestrictedSubstances();

  const options = parseArgs(process.argv.slice(2));
  console.log(
    `OBF bulk import starting. source=${options.file ?? options.url} limit=${options.limit ?? "none"} dryRun=${options.dryRun}`
  );

  const gunzipStream = await openGunzippedLineStream(options);
  let streamError: Error | null = null;
  gunzipStream.on("error", (err) => {
    streamError = err instanceof Error ? err : new Error(String(err));
  });

  const lines = createInterface({ input: gunzipStream, crlfDelay: Infinity });

  let processed = 0;
  let imported = 0;
  let skipped = 0;
  let limitReached = false;
  let batch: ProductUpsertRow[] = [];

  for await (const line of lines) {
    if (!line.trim()) continue;
    processed++;

    let raw: ObfBulkRecord;
    try {
      raw = JSON.parse(line);
    } catch {
      skipped++;
      continue;
    }

    const row = toProductRow(raw);
    if (!row) {
      skipped++;
    } else {
      batch.push(row);
    }

    if (batch.length >= BATCH_SIZE) {
      if (!options.dryRun) await upsertBatch(batch);
      imported += batch.length;
      batch = [];
      console.log(`... processed=${processed} imported=${imported} skipped=${skipped}`);
    }

    if (options.limit && processed >= options.limit) {
      limitReached = true;
      break;
    }
  }

  lines.close();
  gunzipStream.destroy();

  if (batch.length > 0) {
    if (!options.dryRun) await upsertBatch(batch);
    imported += batch.length;
  }

  if (streamError && !limitReached) {
    throw streamError;
  }

  console.log(`Done. processed=${processed} imported=${imported} skipped=${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
