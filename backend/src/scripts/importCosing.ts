import { readFileSync } from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { supabase } from "../db/supabaseClient";
import { RestrictionType } from "../types/product";

/**
 * Imports the CosIng (EU Cosmetic Ingredient Database) Annex II/III/IV/V/VI
 * lists (banned / restricted / regulated colorants-preservatives-UV filters)
 * into `restricted_substances`, and the full INCI/CAS ingredient inventory
 * into `cosing_ingredients` (reference data, not used for score penalties).
 *
 * Source files are the CSV exports that Open Beauty Facts itself maintains
 * (europa.eu's own CosIng site is a JS search app with no stable bulk
 * export, so we use the same structured re-publication OBF's own ingredient
 * analysis is built on).
 *
 * Usage:
 *   npm run import:cosing                 # downloads from GitHub
 *   npm run import:cosing -- --dir=./cosing-csv   # use local copies instead
 *   npm run import:cosing -- --dry-run
 */

const RAW_BASE_URL = "https://raw.githubusercontent.com/openfoodfacts/openbeautyfacts/develop/cosing";

interface CliOptions {
  dir: string | null;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { dir: null, dryRun: false };
  for (const arg of argv) {
    if (arg.startsWith("--dir=")) options.dir = arg.slice("--dir=".length);
    else if (arg === "--dry-run") options.dryRun = true;
  }
  return options;
}

async function readTextFile(options: CliOptions, fileName: string): Promise<string> {
  if (options.dir) {
    return readFileSync(path.join(options.dir, fileName), "utf-8");
  }
  const response = await fetch(`${RAW_BASE_URL}/${fileName}`);
  if (!response.ok) {
    throw new Error(`Failed to download ${fileName}: HTTP ${response.status}`);
  }
  return response.text();
}

type CsvRow = Record<string, string>;

function parseCsv(text: string): CsvRow[] {
  return parse(text, {
    columns: (header: string[]) => header.map((h) => h.trim()),
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
    skip_records_with_error: true,
    trim: true,
  }) as CsvRow[];
}

/** Cuts everything above the real header row (the ingredient inventory export has a junk preamble). */
function stripPreamble(text: string, headerStartsWith: string): string {
  const lines = text.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => line.startsWith(headerStartsWith));
  if (headerIndex === -1) return text;
  return lines.slice(headerIndex).join("\n");
}

function getField(row: CsvRow, ...candidates: string[]): string {
  for (const candidate of candidates) {
    const key = Object.keys(row).find((k) => k.toLowerCase() === candidate.toLowerCase());
    if (key && row[key]?.trim()) return row[key].trim();
  }
  return "";
}

function splitAliases(...raw: string[]): string[] {
  const aliases = new Set<string>();
  for (const value of raw) {
    if (!value) continue;
    // ";" always separates distinct alternative names. "/" only does when it
    // has surrounding whitespace ("A / B / C"); a tight slash ("CITRUS LIMON
    // FLOWER/LEAF/STEM OIL") is CosIng's own shorthand for plant-part
    // variants of ONE ingredient and must stay joined - splitting it produces
    // bare, dangerously generic aliases like "LEAF" or "STEM OIL".
    for (const semiPart of value.split(";")) {
      for (const part of semiPart.split(/\s+\/\s+/)) {
        const trimmed = part.trim();
        if (trimmed.length > 1) aliases.add(trimmed);
      }
    }
  }
  return Array.from(aliases);
}

interface RestrictedSubstanceRow {
  inci_name: string;
  aliases: string[];
  restriction_type: RestrictionType;
  notes: string;
  annex: string;
  category: string | null;
}

const ANNEX_LABEL: Record<string, string> = {
  II: "AB Kozmetik Tüzüğü Ek II (yasaklı madde)",
  III: "AB Kozmetik Tüzüğü Ek III (kısıtlı madde)",
  IV: "AB Kozmetik Tüzüğü Ek IV (renklendirici - düzenlemeye tabi)",
  V: "AB Kozmetik Tüzüğü Ek V (koruyucu - düzenlemeye tabi)",
  VI: "AB Kozmetik Tüzüğü Ek VI (UV filtresi - düzenlemeye tabi)",
};

function buildNotes(annex: string, maxConcentration: string, conditions: string): string {
  const parts = [ANNEX_LABEL[annex]];
  if (maxConcentration) parts.push(`Maksimum konsantrasyon: ${maxConcentration}`);
  if (conditions) parts.push(`Kullanım koşulları: ${conditions}`);
  return parts.join(". ");
}

function mapAnnexRow(
  row: CsvRow,
  annex: "II" | "III" | "IV" | "V" | "VI",
  restrictionType: RestrictionType,
  category: string | null
): RestrictedSubstanceRow | null {
  const glossaryName = getField(
    row,
    "Name of Common Ingredients Glossary",
    "Colour index Number / Name of Common Ingredients Glossary"
  );
  const chemicalName = getField(row, "Chemical name / INN", "Chemical name / INN / XAN", "Chemical name");
  const identified = getField(row, "Identified INGREDIENTS or substances e.g.");
  const maxConcentration = getField(row, "Maximum concentration in ready for use preparation");
  const conditions = getField(row, "Wording of conditions of use and warnings");
  const refNumber = getField(row, "Reference number", "Reference Number");

  const aliases = splitAliases(glossaryName, identified);
  const primaryName = glossaryName || chemicalName || (refNumber ? `CosIng Annex ${annex} #${refNumber}` : "");
  if (!primaryName) return null;

  return {
    inci_name: primaryName,
    aliases: aliases.length > 0 ? aliases : [primaryName],
    restriction_type: restrictionType,
    notes: buildNotes(annex, maxConcentration, conditions),
    annex,
    category,
  };
}

async function upsertRestrictedSubstances(rows: RestrictedSubstanceRow[], dryRun: boolean): Promise<void> {
  if (dryRun || rows.length === 0) return;
  const BATCH_SIZE = 500;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("restricted_substances").insert(batch);
    if (error) {
      throw new Error(`restricted_substances insert failed: ${error.message}`);
    }
  }
}

async function importAnnex(
  options: CliOptions,
  fileName: string,
  annex: "II" | "III" | "IV" | "V" | "VI",
  restrictionType: RestrictionType,
  category: string | null
): Promise<number> {
  const text = await readTextFile(options, fileName);
  const rows = parseCsv(text);
  const mapped = rows
    .map((row) => mapAnnexRow(row, annex, restrictionType, category))
    .filter((row): row is RestrictedSubstanceRow => row !== null);

  await upsertRestrictedSubstances(mapped, options.dryRun);
  console.log(`Annex ${annex}: ${rows.length} rows -> ${mapped.length} imported.`);
  return mapped.length;
}

interface CosingIngredientRow {
  cosing_ref_no: string | null;
  inci_name: string;
  inn_name: string | null;
  cas_no: string | null;
  einecs_no: string | null;
  description: string | null;
  function: string | null;
}

async function importIngredientInventory(options: CliOptions): Promise<number> {
  const fileName = "COSING_Ingredients-Fragrance.Inventory_v2.csv";
  const rawText = await readTextFile(options, fileName);
  const text = stripPreamble(rawText, "COSING Ref No");
  const rows = parseCsv(text);

  const mapped: CosingIngredientRow[] = rows
    .map((row) => {
      const inciName = getField(row, "INCI name");
      if (!inciName) return null;
      return {
        cosing_ref_no: getField(row, "COSING Ref No") || null,
        inci_name: inciName,
        inn_name: getField(row, "INN name") || null,
        cas_no: getField(row, "CAS No") || null,
        einecs_no: getField(row, "EINECS/ELINCS No") || null,
        description: getField(row, "Chem/IUPAC Name / Description") || null,
        function: getField(row, "Function") || null,
      };
    })
    .filter((row): row is CosingIngredientRow => row !== null);

  if (!options.dryRun) {
    const BATCH_SIZE = 500;
    for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
      const batch = mapped.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from("cosing_ingredients").insert(batch);
      if (error) {
        throw new Error(`cosing_ingredients insert failed: ${error.message}`);
      }
    }
  }

  console.log(`Ingredient inventory: ${rows.length} rows -> ${mapped.length} imported.`);
  return mapped.length;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  console.log(`CosIng import starting. source=${options.dir ?? RAW_BASE_URL} dryRun=${options.dryRun}`);

  if (!options.dryRun) {
    console.log("Clearing previously imported CosIng-sourced restricted_substances rows...");
    const { error } = await supabase.from("restricted_substances").delete().not("annex", "is", null);
    if (error) throw new Error(`Failed to clear old CosIng rows: ${error.message}`);

    const { error: clearIngredientsError } = await supabase
      .from("cosing_ingredients")
      .delete()
      .neq("id", 0);
    if (clearIngredientsError) {
      throw new Error(`Failed to clear cosing_ingredients: ${clearIngredientsError.message}`);
    }
  }

  let total = 0;
  total += await importAnnex(options, "COSING_Annex.II_v2.csv", "II", "banned", null);
  total += await importAnnex(options, "COSING_Annex.III_v2.csv", "III", "restricted", null);
  total += await importAnnex(options, "COSING_Annex.IV_v2.csv", "IV", "controversial", "colorant");
  total += await importAnnex(options, "COSING_Annex.V_v2.csv", "V", "controversial", "preservative");
  total += await importAnnex(options, "COSING_Annex.VI_v2.csv", "VI", "controversial", "uv_filter");
  const ingredientCount = await importIngredientInventory(options);

  console.log(`Done. restricted_substances rows=${total}, cosing_ingredients rows=${ingredientCount}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
