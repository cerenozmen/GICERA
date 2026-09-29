import { readdirSync, readFileSync } from "fs";
import path from "path";
import { analyzePhotoIngredients, inciKey, IngredientVocabulary } from "../services/ingredientCoverage";
import { getIngredientVocabulary, loadIngredientInventory } from "../services/ingredientInventoryCache";
import { loadRestrictedSubstances } from "../services/restrictedSubstancesCache";
import { outcome, validateScan } from "../services/scanValidation";
import { parseIngredientsText, scoreIngredients } from "../services/scoringService";
import { compare } from "./labelCompare";

/*
 * Local OCR preprocessing POC, measured: ML Kit's readings of every image variant (ocrprep/prep.py made
 * them on the computer, OcrBenchScreen read them on the phone) through the app's own reading, merging
 * and completeness code (frontend guidedScan.ts / photoMerge.ts) and the unchanged server check and
 * analysis, against the product's label. No API, no key, no cloud.
 *
 *   npm run ocr:bench -- --dir=captures/bench/out2 [--detail]
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const guided = require("../../../frontend/src/guidedScan");
const ingredients = require("../../../frontend/src/ingredients");
/* eslint-enable @typescript-eslint/no-var-requires */

const SCANS = path.join(__dirname, "../../captures/scans");
const LABELS: Record<string, string> = { flat: "blush-pinch/label.txt", tube: "curved-tube/label.txt", round: "sudocrem/label.txt" };
/** Words the earlier scans misread, per product: which reading each method gives. */
const WATCH: Record<string, RegExp[]> = {
  flat: [/phen\w*/i, /diethylh\w*/i, /calci\w* ?alumin\w*/i, /octyldod\w*/i, /ci ?7\d{4}/gi],
  tube: [/d[il1]but?y?l?\w*/i, /phen[o0]\w*/i, /t\w{0,2}ani\w*/i, /seed ?o\w*/gi, /isoam\w*/i, /magnesium ?sul\w*/i, /heptah\w*|ptahy\w*/i],
  round: [/para\w* ?l?\w*/gi, /zinc ?\w*/i, /synthe\w* ?\w*/i, /benzyl ?alc\w*/i, /propyl\w* ?\w*/i, /citric ?\w* ?\w* ?\w*/i],
};

interface Entry {
  file: string;
  capture: string;
  step: string;
  variant: string;
  width: number;
  height: number;
  prepMs: number;
  geometry: { class?: string; dewarp?: { sag: number }; cylinder?: { silhouette: number[] | null } };
}
interface Line {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  confidence?: number | null;
  corners?: [number, number][];
}

function parseArgs(argv: string[]): Record<string, string> {
  return Object.fromEntries(argv.flatMap((arg) => (arg.match(/^--([^=]+)(?:=(.*))?$/) ? [[RegExp.$1, RegExp.$2 ?? ""]] : [])));
}

const productOf = (capture: string) => (capture.includes("-flat") ? "flat" : capture.includes("-tube") ? "tube" : "round");
const pct = (n: number, d: number) => `${Math.round((100 * n) / Math.max(1, d))}%`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dir = args.dir || "captures/bench/out2";
  await loadRestrictedSubstances();
  await loadIngredientInventory();
  const vocabulary = getIngredientVocabulary() as IngredientVocabulary;
  const manifest: Entry[] = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8"));
  const ocr = new Map<string, { lines: Line[]; ocrMs: number }>();
  for (const f of readdirSync(path.join(dir, "mlkit"))) ocr.set(f.replace(/\.json$/, ".jpg"), JSON.parse(readFileSync(path.join(dir, "mlkit", f), "utf8")));

  for (const capture of [...new Set(manifest.map((m) => m.capture))]) {
    const product = productOf(capture);
    const labelText = readFileSync(path.join(SCANS, args[`label-${product}`] ?? LABELS[product]), "utf8");
    // The label as the analysis tokenizes it (bracketed text dropped: "Titanium Dioxide (CI 77891)").
    const label = parseIngredientsText(labelText);
    const entries = manifest.filter((m) => m.capture === capture && ocr.has(m.file));
    const steps = [...new Set(entries.map((e) => e.step))].sort();
    const variants = [...new Set(entries.map((e) => e.variant))];
    console.log(`\n=== ${capture} (${product.toUpperCase()}): ${steps.length} photo(s) [${steps.join(", ")}], label ${label.length} ingredients`);
    for (const step of steps) {
      const g = entries.find((e) => e.step === step)!.geometry;
      console.log(`  ${step}: geometry ${g.class ?? "-"}, row bend ${g.dewarp?.sag ?? "-"} line heights, silhouette ${g.cylinder?.silhouette ? "yes" : "no"}`);
    }

    const readingOf = (e: Entry, name = e.step) => guided.readPhoto({ width: e.width, height: e.height, lines: ocr.get(e.file)!.lines }, name);
    const measure = (method: string, chosen: Entry[]) => {
      const readings = chosen.map((e) => readingOf(e, method.startsWith("fusion") ? `${e.step}:${e.variant}` : e.step));
      const rec = guided.reconstruct(readings);
      let status = { scanStatus: "INCOMPLETE", analysisStatus: "NOT_ANALYSED" };
      let score: number | null = null;
      let analysis = null;
      const blockers: string[] = rec.completeness.needs.map((n: { need: string; row?: number }) => `${n.need}${n.row !== undefined ? `@${n.row + 1}` : ""}`);
      if (rec.candidate) {
        const v = validateScan(rec.candidate, vocabulary);
        status = outcome(v);
        blockers.push(...v.boundaries.checks.filter((c) => !c.verified).map((c) => `${c.kind}@${c.row + 1}`));
        analysis = v.analysis?.merged ?? null;
        score = status.analysisStatus === "SCORE_AVAILABLE" && analysis?.scoring ? analysis.scoring.cleanScore : null;
      }
      // What OCR read, analysed only to compare with the label (an incomplete list never gets a score).
      // (Counting only: a bracket OCR left open would hide every later item from the count, so it is
      // neutralised here. The list itself stays INCOMPLETE for it.)
      if (!analysis && rec.merged) {
        const joined: string = ingredients.joinLines(rec.merged.rows);
        const counted = guided.leftOpen(joined) ? joined.replace(/[([]/g, " ") : joined;
        analysis = analyzePhotoIngredients(parseIngredientsText(ingredients.normalizeListItems(counted).join(", ")), vocabulary, scoreIngredients);
      }
      const c = compare(analysis, label);
      const garbage = c.extra.filter((x) => !/^(ci ?\d+|iron oxide)$/i.test(x.trim()));
      const ocrMs = chosen.reduce((n, e) => n + ocr.get(e.file)!.ocrMs, 0);
      const prepMs = chosen.reduce((n, e) => n + (e.variant === "orig" ? 0 : e.prepMs), 0);
      return { method, rec, c, garbage, status, score, blockers, ocrMs, prepMs, unknown: analysis?.ingredients.filter((i) => i.status === "unknown").map((i) => i.text) ?? [] };
    };

    const rows: ReturnType<typeof measure>[] = [];
    for (const variant of variants) {
      const chosen = steps.map((s) => entries.find((e) => e.step === s && e.variant === variant)).filter((e): e is Entry => !!e);
      // A variant a photo lacks (no silhouette → no cyl) falls back to that photo's dewarp, then crop.
      if (chosen.length < steps.length) {
        for (const s of steps) if (!chosen.some((e) => e.step === s)) {
          const fb = entries.find((e) => e.step === s && e.variant === variant.replace(/^cyl/, "dewarp")) ?? entries.find((e) => e.step === s && e.variant === "crop");
          if (fb) chosen.push(fb);
        }
      }
      rows.push(measure(variant, chosen));
    }
    // Local evidence fusion: every variant of every photo as its own reading (same photo, several OCR passes).
    rows.push(measure("fusion(all)", entries));
    rows.push(measure("fusion(orig,crop,dewarp,cyl)", entries.filter((e) => ["orig", "crop", "dewarp", "cyl"].includes(e.variant))));
    rows.push(measure("fusion(orig,cyl,cyl_clahe)", entries.filter((e) => ["orig", "cyl", "cyl_clahe"].includes(e.variant))));

    console.log(`\n  ${"Method".padEnd(30)} Correct   Incorrect Missing Garbage Complete  Analysis                    Score  prep+OCR ms`);
    for (const r of rows) {
      console.log(
        `  ${r.method.padEnd(30)} ${`${r.c.recovered.length}/${label.length}`.padEnd(6)}${pct(r.c.recovered.length, label.length).padStart(4)} ${String(r.c.incorrect.length).padStart(5)} ${String(r.c.missing.length).padStart(8)} ${String(r.garbage.length).padStart(7)}  ${r.status.scanStatus === "COMPLETE" ? "COMPLETE  " : "INCOMPLETE"} ${r.status.analysisStatus.padEnd(27)} ${String(r.score ?? "-").padStart(5)}  ${r.prepMs}+${r.ocrMs}`
      );
    }

    // The words earlier scans misread: what each method's raw OCR read, photo by photo.
    console.log(`\n  Watched words (raw ML Kit text, per photo):`);
    for (const variant of variants) {
      const found = steps.map((s) => {
        const e = entries.find((x) => x.step === s && x.variant === variant);
        if (!e) return `${s}: -`;
        const text = ocr.get(e.file)!.lines.map((l) => l.text).join(" | ");
        const hits = WATCH[product].flatMap((re) => [...new Set(text.match(new RegExp(re.source, "gi")) ?? [])]);
        return `${s}: ${hits.join(", ") || "-"}`;
      });
      console.log(`    ${variant.padEnd(13)} ${found.join("  ||  ")}`);
    }

    // Dictionary misses: label names the vocabulary lacks, and whether any OCR pass read them exactly.
    const allText = entries.map((e) => ocr.get(e.file)!.lines.map((l) => l.text).join(" ")).join(" ").toLowerCase();
    const misses = label.filter((l) => !vocabulary.known.has(inciKey(l)) && !/ ci \d+$/i.test(` ${l}`));
    if (misses.length)
      console.log(`\n  Dictionary: ${misses.map((l) => `"${l}" ${allText.includes(l.toLowerCase()) ? "OCR SUCCESS (read exactly) + DICTIONARY_MISS" : "DICTIONARY_MISS (not read exactly by any pass)"}`).join("; ")}`);

    if (args.detail !== undefined) {
      for (const r of rows) {
        console.log(`\n  --- ${r.method}: ${r.status.scanStatus} ${r.blockers.slice(0, 4).join(" ")}`);
        for (const [i, row] of (r.rec.merged?.rows ?? []).entries()) console.log(`      ${String(i + 1).padStart(2)} | ${row}`);
        console.log(`      incorrect: [${r.c.incorrect.join(", ")}]\n      missing: [${r.c.missing.join(", ")}]\n      garbage: [${r.garbage.join(", ")}]`);
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
