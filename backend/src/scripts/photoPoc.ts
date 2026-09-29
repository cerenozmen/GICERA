import { readdirSync, readFileSync } from "fs";
import path from "path";
import { analyzePhotoIngredients, IngredientVocabulary, PhotoAnalysis } from "../services/ingredientCoverage";
import { compare } from "./labelCompare";
import { getIngredientVocabulary, loadIngredientInventory } from "../services/ingredientInventoryCache";
import { loadRestrictedSubstances } from "../services/restrictedSubstancesCache";
import { outcome, validateScan } from "../services/scanValidation";
import { parseIngredientsText, scoreIngredients } from "../services/scoringService";

/*
 * Guided high-resolution photo scans measured against the product's label. The photos are read,
 * merged and checked by the app's own code (frontend/src/guidedScan.ts, photoMerge.ts), then by the
 * unchanged server check and analysis: what the phone would have got.
 *
 *   npm run poc:photos -- --guided=<dir>        device scans (guided-<id>.json, pulled from the phone):
 *                                               one report per scan, as recorded and as replayed
 *   npm run poc:photos -- --poc=<dir>           POC capture sessions (poc-<id>.json): every photo
 *                                               alone and every set of up to 3
 *   --label-flat=<file> --label-tube=<file> --label-round=<file>   labels (under captures/scans)
 *   --detail=<id>                               merge details for one scan (or photo set: a,b,c)
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const guided = require("../../../frontend/src/guidedScan");
/* eslint-enable @typescript-eslint/no-var-requires */

interface Line {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  confidence?: number | null;
  corners?: [number, number][];
}
interface Photo {
  name: string;
  ocrMs: number | null;
  captureMs: number | null;
  frame: { width: number; height: number; lines: Line[] };
}

const SCANS = path.join(__dirname, "../../captures/scans");
const LABELS: Record<string, string> = { flat: "curved-jar/label.txt", tube: "curved-tube/label.txt", round: "sudocrem/label.txt", jar: "sudocrem/label.txt" };

function parseArgs(argv: string[]): Record<string, string> {
  return Object.fromEntries(
    argv.flatMap((arg) => {
      const match = arg.match(/^--([^=]+)(?:=(.*))?$/);
      return match ? [[match[1], match[2] ?? ""]] : [];
    })
  );
}

function sets<T>(all: T[], max: number): T[][] {
  const out: T[][] = [];
  const walk = (from: number, chosen: T[]) => {
    if (chosen.length) out.push(chosen);
    if (chosen.length === max) return;
    for (let i = from; i < all.length; i++) walk(i + 1, [...chosen, all[i]]);
  };
  walk(0, []);
  return out;
}

interface Measured {
  photos: string[];
  kept: string[];
  rows: number;
  scanStatus: "COMPLETE" | "INCOMPLETE";
  blockers: string[];
  analysisStatus: string;
  score: number | null;
  expected: number;
  recovered: string[];
  missing: string[];
  incorrect: string[];
  extra: string[];
  unknown: string[];
  ocrMs: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reconstruction: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readings: any[];
}

/** The photos through the app's pipeline and the server's; compared with the label. */
function measure(set: Photo[], label: string[], vocabulary: IngredientVocabulary): Measured {
  const readings = set.map((photo) => guided.readPhoto(photo.frame, photo.name));
  // As on the phone: photos failing the quality check are taken again, not used.
  const kept = readings.filter((r) => !r.quality.problem);
  const reconstruction = guided.reconstruct(kept);
  const base = { photos: set.map((p) => p.name), kept: kept.map((r) => r.id), expected: label.length, ocrMs: set.reduce((n, p) => n + (p.ocrMs ?? 0), 0), reconstruction, readings };
  const merged = reconstruction.merged;
  const blockers: string[] = reconstruction.completeness.needs.map((n: { need: string; row?: number }) => `${n.need}${n.row !== undefined ? `@${n.row + 1}` : ""}`);
  let analysis: PhotoAnalysis | null = null;
  let status = { scanStatus: "INCOMPLETE" as "COMPLETE" | "INCOMPLETE", analysisStatus: "NOT_ANALYSED" };
  if (reconstruction.candidate) {
    const validation = validateScan(reconstruction.candidate, vocabulary);
    status = outcome(validation);
    blockers.push(...validation.boundaries.checks.filter((c) => !c.verified).map((c) => `${c.kind}@${c.row + 1}: ${c.reason}`));
    analysis = validation.analysis?.merged ?? null;
  }
  // An incomplete list gets no analysis from the server; here it is analysed all the same, only to
  // measure what OCR read (never a score for it).
  if (!analysis && merged) analysis = analyzePhotoIngredients(parseIngredientsText(guided.reconstruct(kept).merged.rows.join(" ")), vocabulary, scoreIngredients);
  const compared = compare(analysis, label);
  return {
    ...base,
    ...compared,
    rows: merged?.rows.length ?? 0,
    scanStatus: status.scanStatus,
    analysisStatus: status.analysisStatus,
    blockers: status.scanStatus === "COMPLETE" ? [] : blockers,
    score: status.analysisStatus === "SCORE_AVAILABLE" && analysis?.scoring ? analysis.scoring.cleanScore : null,
  };
}

/** The label as the analysis tokenizes it (bracketed text dropped: "Titanium Dioxide (CI 77891)"). */
function readLabel(file: string): string[] {
  return parseIngredientsText(readFileSync(path.isAbsolute(file) ? file : path.join(SCANS, file), "utf8"));
}

const line = (r: Measured) =>
  `${r.photos.join(" + ").padEnd(34)} rows ${String(r.rows).padStart(2)}  ${r.scanStatus.padEnd(10)}  ${r.recovered.length}/${r.expected} correct` +
  `${r.missing.length ? `, missing ${r.missing.length}` : ""}${r.incorrect.length ? `, misread ${r.incorrect.length}` : ""}${r.extra.length ? `, extra ${r.extra.length}` : ""}` +
  `  ${r.scanStatus === "COMPLETE" ? `${r.analysisStatus}${r.score !== null ? ` ${r.score}` : ""}` : r.blockers.slice(0, 2).join("; ")}  OCR ${r.ocrMs} ms`;

function detail(r: Measured) {
  for (const reading of r.readings) {
    const s = reading.section;
    console.log(
      `  ${reading.id}: quality ${reading.quality.problem ?? "ok"} (${reading.quality.detail}, conf ${reading.quality.confidence?.toFixed(2) ?? "-"})` +
        `${s ? `, ${s.rows.length} rows${s.heading ? ", heading" : ""}${s.start ? ", start" : ""}${s.end ? ", end" : ""}` : ", no list"}\n${(s?.rows ?? []).map((row: string) => `      | ${row}`).join("\n")}`
    );
  }
  const merged = r.reconstruction.merged;
  if (merged) {
    console.log(`  Merge:`);
    for (const e of merged.log)
      console.log(`    ${e.photo}: ${e.offset === null ? "not placed" : `offset ${e.offset}`}; ${e.rows.filter((x: { note: string }) => x.note !== "merged" && x.note !== "anchor").map((x: { row: number; note: string }) => `row ${x.row + 1}: ${x.note}`).join("; ") || "all rows merged"}`);
    console.log(`  Merged rows:\n${merged.rows.map((row: string, i: number) => `      ${String(i + 1).padStart(2)} | ${row}${merged.edges[i].ends.length > 1 ? `   [ends read: ${merged.edges[i].ends.join(" / ")}]` : ""}`).join("\n")}`);
    if (merged.choices.length) console.log(`  Readings that disagreed:\n${merged.choices.map((c: { row: number; readings: object; chosen: string }) => `      row ${c.row + 1}: ${JSON.stringify(c.readings)} -> "${c.chosen}"`).join("\n")}`);
  }
  console.log(`  Expected ingredients: ${r.expected}`);
  console.log(`  Recovered correctly: ${r.recovered.length}`);
  console.log(`  Incorrect OCR: [${r.incorrect.join(", ")}]`);
  console.log(`  Missing: [${r.missing.join(", ")}]`);
  console.log(`  Extra: [${r.extra.join(", ")}]`);
  console.log(`  Scan status: ${r.scanStatus}${r.blockers.length ? ` (${r.blockers.join("; ")})` : ""}`);
  console.log(`  Analysis status: ${r.analysisStatus}${r.scanStatus === "COMPLETE" && r.analysisStatus !== "SCORE_AVAILABLE" ? `; unknown: ${r.unknown.join(", ")}` : ""}`);
  console.log(`  Score: ${r.score ?? "-"}`);
}

/** A device scan log (guided-<id>.json): what happened on the phone, and the same photos replayed here. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function reportGuided(file: string, log: any, label: string[], vocabulary: IngredientVocabulary, args: Record<string, string>) {
  const photos: Photo[] = log.photos.map((p: { id: string; ocrMs: number; captureMs: number; width: number; height: number; lines: Line[] }) => ({
    name: p.id,
    ocrMs: p.ocrMs,
    captureMs: p.captureMs,
    frame: { width: p.width, height: p.height, lines: p.lines },
  }));
  const replay = measure(photos, label, vocabulary);
  const result = log.result ?? {};
  // What the phone showed: its server's answer (the ingredients the result screen lists).
  const device = result.ingredients ? compare({ ingredients: result.ingredients }, label) : null;
  const exchanges = log.exchanges ?? [];
  const kept = log.photos.filter((p: { accepted: boolean }) => p.accepted).length;
  const captureMs = log.photos.reduce((n: number, p: { captureMs: number }) => n + p.captureMs, 0);
  const ocrMs = log.photos.reduce((n: number, p: { ocrMs: number; cropOcrMs?: number; cropMs?: number }) => n + p.ocrMs + (p.cropOcrMs ?? 0) + (p.cropMs ?? 0), 0);
  const directions: string[] = (log.steps ?? []).map((s: { prompt: string }) => s.prompt).filter((p: string) => p !== "failed");
  const used = log.photos.filter((p: { accepted: boolean }) => p.accepted) as { id: string; pass?: string; passWhy?: string; orientation?: string }[];
  const serverMs = exchanges.map((e: { roundTripMs: number; serverMs?: number }) => `${e.roundTripMs}${e.serverMs !== undefined ? ` (server ${e.serverMs})` : ""}`);
  const shown = device ?? replay;
  console.log(`\n=== ${path.basename(file)}  [${log.testTag ?? "untagged"}]  outcome ${log.outcome}`);
  console.log(`  Photos required: ${kept} kept of ${log.photos.length} taken${log.photos.some((p: { accepted: boolean }) => !p.accepted) ? ` (retaken: ${log.photos.filter((p: { accepted: boolean }) => !p.accepted).map((p: { quality: { problem: string } }) => p.quality.problem).join(", ")})` : ""}`);
  console.log(`  Directions requested: ${directions.join(" → ") || "none"}`);
  console.log(`  Passes used: ${used.map((p) => `${p.id} ${p.pass ?? "original"}${p.pass === "original" && p.passWhy ? ` (${p.passWhy})` : ""}${p.orientation ? ` ${p.orientation}` : ""}`).join(", ")}`);
  console.log(`  Capture duration: ${(captureMs / 1000).toFixed(1)} s   OCR duration: ${(ocrMs / 1000).toFixed(1)} s (both passes and the crop)`);
  console.log(`  Server requests: ${exchanges.length}${serverMs.length ? `, ms: ${serverMs.join(", ")}` : ""}`);
  console.log(`  Expected ingredients: ${label.length}`);
  console.log(`  Recovered correctly: ${shown.recovered.length}`);
  console.log(`  Incorrect OCR: [${shown.incorrect.join(", ")}]`);
  console.log(`  Missing: [${shown.missing.join(", ")}]`);
  console.log(`  Extra: [${shown.extra.join(", ")}]`);
  console.log(`  Scan status: ${result.scanStatus ?? "INCOMPLETE"}`);
  console.log(`  Analysis status: ${result.analysisStatus ?? "NOT_ANALYSED"}`);
  console.log(`  Analysis blocker: ${result.analysisBlocker ?? "-"} [${(result.unverified ?? []).join(", ")}]`);
  console.log(`  Score available: ${typeof result.score === "number" ? "YES" : "NO"}`);
  console.log(`  Score: ${result.score ?? "-"}`);
  console.log(`  Total duration: ${((log.durationMs ?? 0) / 1000).toFixed(1)} s`);
  const same = replay.scanStatus === (result.scanStatus ?? "INCOMPLETE") && replay.score === (typeof result.score === "number" ? result.score : null);
  console.log(`  Replay here: ${line(replay)}${same ? "" : "   <-- differs from the phone"}`);
  if (args.detail && path.basename(file).includes(args.detail)) detail(replay);
  return {
    tag: (log.testTag ?? "untagged") as string,
    kept,
    recovered: shown.recovered.length,
    expected: label.length,
    incorrect: shown.incorrect,
    missing: shown.missing,
    scanStatus: (result.scanStatus ?? "INCOMPLETE") as string,
    analysisStatus: (result.analysisStatus ?? "NOT_ANALYSED") as string,
    blocker: (result.analysisBlocker ?? null) as string | null,
    unverified: (result.unverified ?? []) as string[],
    outcome: log.outcome as string,
    score: (result.score ?? null) as number | null,
    durationMs: (log.durationMs ?? 0) as number,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await loadRestrictedSubstances();
  await loadIngredientInventory();
  const vocabulary = getIngredientVocabulary();
  if (!vocabulary) throw new Error("cosing_ingredients is empty; run npm run import:cosing first");
  const labelFor = (tag: string) => readLabel(args[`label-${tag}`] ?? LABELS[tag] ?? LABELS.flat);

  if (args.guided !== undefined) {
    const dir = args.guided || ".";
    const files = readdirSync(dir).filter((f) => /^guided-\d+\.json$/.test(f)).sort();
    const summary: ReturnType<typeof reportGuided>[] = [];
    for (const f of files) {
      const log = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
      if (args.tag && log.testTag !== args.tag) continue;
      summary.push(reportGuided(f, log, labelFor(log.testTag ?? "flat"), vocabulary, args));
    }
    console.log(`\n=== SUMMARY`);
    const names: Record<string, string> = { flat: "DÜZ", tube: "TÜP", round: "YUVARLAK" };
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    for (const tag of [...new Set(summary.map((s) => s.tag))]) {
      const of = summary.filter((s) => s.tag === tag);
      const complete = of.filter((s) => s.scanStatus === "COMPLETE");
      const scores = of.map((s) => s.score).filter((x): x is number => typeof x === "number");
      console.log(`\n## ${names[tag] ?? tag.toUpperCase()}`);
      console.log(`Complete: ${complete.length}/${of.length}`);
      console.log(`Score available: ${scores.length}/${of.length}`);
      console.log(`Exact ingredient accuracy: ${Math.round((100 * of.reduce((n, s) => n + s.recovered, 0)) / Math.max(1, of.reduce((n, s) => n + s.expected, 0)))}% (per scan: ${of.map((s) => `${s.recovered}/${s.expected}`).join(", ")})`);
      console.log(`Scores: [${scores.join(", ")}]${new Set(scores).size > 1 ? "   <-- CRITICAL: different scores for the same product" : ""}`);
      console.log(`Average photos: ${avg(of.map((s) => s.kept)).toFixed(1)}`);
      console.log(`Average duration: ${(avg(of.map((s) => s.durationMs)) / 1000).toFixed(1)} s`);
      console.log(`Scan blockers: ${of.filter((s) => s.scanStatus !== "COMPLETE").map((s) => s.outcome).join(" | ") || "-"}`);
      console.log(`Analysis: ${complete.map((s) => `${s.analysisStatus}${s.blocker ? ` (${s.blocker}: ${s.unverified.join(", ")})` : ""}`).join(" | ") || "-"}`);
      console.log(`OCR errors: ${[...new Set(of.flatMap((s) => s.incorrect))].join(", ") || "-"}`);
      console.log(`Missing: ${[...new Set(of.flatMap((s) => s.missing))].join(", ") || "-"}`);
    }
    return;
  }

  // --poc=<dir>: the POC capture sessions, each photo alone and every set of up to 3.
  const dir = args.poc || path.join(__dirname, "../../captures/poc");
  for (const f of readdirSync(dir).filter((x) => /^poc-\d+\.json$/.test(x)).sort()) {
    const log = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
    const tag: string = log.product;
    if (args.product && !tag.startsWith(args.product)) continue;
    const label = labelFor(tag);
    const id = f.replace(/^poc-/, "").replace(/\.json$/, "").slice(-5);
    const all: Photo[] = log.photos.map((p: { step: string; ocrMs: number; captureMs: number; width: number; height: number; lines: Line[] }) => ({
      name: `${id}:${p.step}`,
      ocrMs: p.ocrMs,
      captureMs: p.captureMs,
      frame: { width: p.width, height: p.height, lines: p.lines },
    }));
    console.log(`\n=== ${tag.toUpperCase()} ${f}: ${all.length} high-res photos, label ${label.length} ingredients`);
    const results = sets(all, 3).map((set) => measure(set, label, vocabulary));
    for (const r of results) console.log(`  ${line(r)}`);
    if (args.detail) {
      const want = args.detail.split(",");
      const r = results.find((x) => x.photos.length === want.length && want.every((n) => x.photos.includes(n)));
      if (r) {
        console.log(`\n  --- ${r.photos.join(" + ")}`);
        detail(r);
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
