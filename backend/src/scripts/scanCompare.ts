import { execFileSync } from "child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { analyzePhotoIngredients, inciKey, PhotoAnalysis } from "../services/ingredientCoverage";
import { buildWordSet, checkListBoundaries } from "../services/listBoundaries";
import { getIngredientVocabulary, loadIngredientInventory } from "../services/ingredientInventoryCache";
import { loadRestrictedSubstances } from "../services/restrictedSubstancesCache";
import { outcome, validateScan } from "../services/scanValidation";
import { oracle } from "./scanOracle";

/**
 * Replays recorded scans through the app's scanner (frontend ingredientScanner.ts) and the server's
 * validation, as the app does (development tool).
 *
 *   npm run scan:compare -- --pull=captures/scans/<product>    # copy the phone's scan logs (kept there)
 *   npm run scan:compare -- --scans=<dir> [--label=label.txt] [--frames]
 *   npm run scan:compare -- --photos=<dir> [--label=label.txt] [--frames]
 *
 * --scans: scan logs (scan-<time>.json) written by the dev build: every frame's OCR lines and boxes.
 * --photos: single high-resolution photos (ocr-<time>.json, the old photo flow's logs), each replayed
 *   as a one-frame scan (the full-frame path).
 * --frames: per-frame diagnosis (section found, start/end, crop, why not whole).
 * --pairs: snapshot vs the high-resolution photo taken right after it (same view): what each read.
 * --label: the label's real list (comma-separated), to report names read wrong or lost.
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const scanner = require("../../../frontend/src/ingredientScanner");
/* eslint-enable @typescript-eslint/no-var-requires */

interface Frame {
  width: number;
  height: number;
  lines: { text: string; left: number; top: number; width: number; height: number }[];
  source?: string;
  at?: number;
}

function parseArgs(argv: string[]): Record<string, string> {
  return Object.fromEntries(
    argv.flatMap((arg) => {
      const match = arg.match(/^--([^=]+)(?:=(.*))?$/);
      return match ? [[match[1], match[2] ?? ""]] : [];
    })
  );
}

function pull(dir: string): void {
  const files = execFileSync("adb", ["exec-out", "run-as", "com.gicera", "ls", "files"]).toString().split(/\s+/).filter((f) => /^scan-\d+\.json$/.test(f));
  mkdirSync(dir, { recursive: true });
  for (const file of files) writeFileSync(path.join(dir, file), execFileSync("adb", ["exec-out", "run-as", "com.gicera", "cat", `files/${file}`]));
  console.log(`Copied ${files.length} scan logs to ${dir} (left on the phone).`);
}

/** The old photo flow's log: blocks of [text, confidence, [left, top, width, height], corners]. */
function photoFrame(file: string): Frame | null {
  const raw: [string, number | null, number[] | null][][] | undefined = JSON.parse(readFileSync(file, "utf8")).raw;
  // Logs from before 24 Sept 2026 kept no line boxes: nothing to replay.
  if (!raw) return null;
  const lines = raw.flat().flatMap(([text, , box]) => (box ? [{ text, left: box[0], top: box[1], width: box[2], height: box[3] }] : []));
  const right = Math.max(...lines.map((l) => l.left + l.width));
  // takePhoto: 4080x3060, portrait or landscape (the logs didn't keep the size).
  return right <= 3060 ? { width: 3060, height: 4080, lines } : { width: 4080, height: 3060, lines };
}

const describe = (section: any) =>
  section
    ? `${section.heading ? "heading" : "no heading"}, ${section.rows.length} rows, ${section.items} items, start ${section.start ?? "-"}, end ${section.end ?? "-"}` +
      `${section.whole ? ", WHOLE" : ` (${section.missing.join("; ")})`}`
    : "-";

/**
 * Snapshot vs high-resolution photo of the same view (the scanner takes a photo right after a
 * snapshot that shows the whole list): what each read. For the camera-strategy decision.
 */
function comparePairs(frames: (Frame & { pairedWith?: number; ocrMs?: number; captureMs?: number })[]): void {
  const vocabulary = getIngredientVocabulary()!;
  const words = buildWordSet(vocabulary);
  const measure = (frame: Frame & { ocrMs?: number; captureMs?: number }) => {
    const section = scanner.readSection(frame).section;
    const items = section ? scanner.listText(section.rows).split(", ").filter(Boolean) : [];
    const analysis = items.length ? analyzePhotoIngredients(items, vocabulary, () => ({ cleanScore: 0, cleanRating: "clean", pregnancySafe: true, flaggedIngredients: [] })) : null;
    const boundaries = section ? checkListBoundaries(section.rows, section.heading, vocabulary, words).checks.filter((c) => !c.verified).length : null;
    return (
      `${frame.width}x${frame.height} capture ${frame.captureMs ?? "?"} ms, OCR ${frame.ocrMs ?? "?"} ms; lines ${frame.lines.length}, ` +
      `heading ${section?.heading ? "Y" : "n"}, rows ${section?.rows.length ?? 0}, items ${items.length}, exact ${analysis?.matched ?? 0}, unknown ${analysis?.unknown ?? 0}, ` +
      `whole ${section?.whole ? "Y" : "n"}, unseen boundaries ${boundaries ?? "-"}`
    );
  };
  const pairs = frames.flatMap((frame, i) => (frame.pairedWith !== undefined && frames[frame.pairedWith] ? [[frames[frame.pairedWith], frames[i]]] : []));
  if (!pairs.length) console.log("  (no snapshot/photo pairs in this log)");
  for (const [snapshot, photo] of pairs) console.log(`  pair\n    snapshot: ${measure(snapshot)}\n    photo   : ${measure(photo)}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.pull) return pull(args.pull);
  if (!args.scans && !args.photos) {
    console.error("Usage: npm run scan:compare -- --pull=<dir> | --scans=<dir> | --photos=<dir> [--label=label.txt] [--frames]");
    process.exit(1);
  }
  await loadRestrictedSubstances();
  await loadIngredientInventory();
  const vocabulary = getIngredientVocabulary();
  if (!vocabulary) throw new Error("cosing_ingredients is empty; run npm run import:cosing first");

  const scans: { name: string; frames: Frame[] }[] = args.scans
    ? readdirSync(args.scans)
        .filter((f) => /^scan-\d+\.json$/.test(f))
        .sort()
        .map((f) => ({ name: f, frames: JSON.parse(readFileSync(path.join(args.scans, f), "utf8")).frames }))
    : readdirSync(args.photos)
        .filter((f) => /^ocr-\d+\.json$/.test(f))
        .sort()
        .flatMap((f) => {
          const frame = photoFrame(path.join(args.photos, f));
          return frame ? [{ name: f, frames: [frame] }] : [];
        });
  // --as-one: the photos as consecutive frames of one scan (as if the scanner took them).
  if (args.photos && args["as-one"] !== undefined) scans.splice(0, scans.length, { name: args.photos, frames: scans.flatMap((s) => s.frames) });

  const labelNames = args.label ? readFileSync(args.label, "utf8").split(",").map((name) => name.trim()).filter(Boolean) : null;
  /** Label ingredients none of whose words (4+ letters) the list read has: missing, not just misread. */
  const missing = (merged: PhotoAnalysis | null) => {
    const words = new Set((merged?.ingredients.map((i) => i.text).join(" ").toLowerCase() ?? "").split(/[^a-z0-9-]+/).filter(Boolean));
    // Present: a word of it read exactly, or an ingredient matched to it or misread close to it.
    const traced = new Set(merged?.ingredients.flatMap((i) => [i.matchedName, i.nearest].filter(Boolean).map((n) => inciKey(n!))) ?? []);
    return (labelNames ?? []).filter(
      (name) => !traced.has(inciKey(name)) && !name.toLowerCase().split(/[^a-z0-9-]+/).some((word) => word.length >= 2 && !/^d+$/.test(word) && words.has(word))
    );
  };
  const totals = { capture: 0, scan: 0, scored: 0, blocked: 0, scans: 0, checks: 0 };
  const scores: number[] = [];
  for (const { name, frames } of scans) {
    if (!frames.length) {
      console.log(`\n${name}: no frames recorded`);
      continue;
    }
    totals.scans++;
    const scan = scanner.createScan();
    const sent = new Set<string>();
    const verdicts: Record<string, number> = {};
    let result: { path: string; frame: number; scanStatus: string; analysisStatus: string; merged: PhotoAnalysis | null } | null = null;
    let failures: string[] = [];
    let lastCheckAt = -Infinity;
    let waitingForPhoto = false;
    let lookedAgain = false;
    for (const [n, frame] of frames.entries()) {
      const reading = scanner.readSection(frame);
      const report = scanner.addFrame(scan, reading);
      verdicts[report.verdict] = (verdicts[report.verdict] ?? 0) + 1;
      if (args.frames !== undefined) {
        console.log(
          `  f${String(n).padStart(2)}${frame.source ? ` ${frame.source}` : ""} ${report.verdict.padEnd(9)} ${describe(reading.section)}` +
            `${reading.reason ? ` [${reading.reason}]` : ""}${report.reason && report.verdict !== "no_list" ? ` [${report.reason}]` : ""}`
        );
      }
      // As the app: from every observation so far, when some frame showed the list's start and some its
      // end; at once for a frame showing the whole list, else at most every 1.5 s (every 4th frame in
      // logs without times).
      const at = frame.at ?? n * 375;
      if (waitingForPhoto && frame.source !== "photo") continue;
      if (!scanner.readyToCheck(scan) || (!reading.section?.whole && at - lastCheckAt < 1500 && !(waitingForPhoto && frame.source === "photo"))) continue;
      lastCheckAt = at;
      for (const candidate of scanner.candidates(scan)) {
        if (sent.has(candidate.key)) continue;
        sent.add(candidate.key);
        totals.checks++;
        const validation = validateScan(candidate, vocabulary);
        failures = validation.boundaries.checks.filter((c) => !c.verified).map((c) => `${c.kind}@${c.row + 1}: ${c.reason}`);
        if (args.frames !== undefined) {
          console.log(`      -> ${candidate.path} (${candidate.readings.length} reading(s)): ${validation.complete ? "complete" : `incomplete (${failures.join("; ")})`}`);
        }
        if (!validation.complete) continue;
        const found = { path: candidate.path, frame: n, ...outcome(validation), merged: validation.analysis?.merged ?? null };
        if (!result || found.analysisStatus === "SCORE_AVAILABLE") result = found;
        break;
      }
      // The scan is done once the whole list is read, whatever the analysis says; when the score is
      // withheld, after one last look in full resolution (as the app: the next photo in the log).
      if (result && (result.analysisStatus === "SCORE_AVAILABLE" || lookedAgain)) break;
      if (result && !waitingForPhoto) {
        waitingForPhoto = frames.slice(n + 1).some((f) => f.source === "photo");
        if (!waitingForPhoto) break;
        continue;
      }
      if (waitingForPhoto && frame.source === "photo") {
        lookedAgain = true;
        lastCheckAt = -Infinity;
      }
    }
    const observed = oracle(name, frames, 8, vocabulary, false, () => {}).observed;
    const lost = result ? missing(result.merged) : [];
    const extra = result && labelNames ? result.merged!.ingredients.filter((i) => i.matchedName && !labelNames.some((l) => inciKey(l) === inciKey(i.matchedName!) || l.toLowerCase().includes(i.matchedName!.toLowerCase()))).map((i) => i.matchedName) : [];
    if (observed) totals.capture++;
    if (result) totals.scan++;
    if (result?.analysisStatus === "SCORE_AVAILABLE") {
      totals.scored++;
      scores.push(result.merged!.scoring!.cleanScore);
    } else if (result) totals.blocked++;
    const duration = frames[frames.length - 1].at;
    console.log(`\n${name}: ${frames.length} frames${duration ? `, ${(duration / 1000).toFixed(0)} s` : ""}; ${Object.entries(verdicts).map(([v, c]) => `${v} ${c}`).join(", ")}`);
    console.log(`  Capture : ${observed === null ? "? (no list found)" : observed ? "PASS (all of the list's text observed)" : "FAIL"}`);
    console.log(
      `  Scan    : ${result ? `PASS (${result.path}, frame ${result.frame}${result.merged ? `, ${result.merged.detected} ingredients` : ""}${labelNames ? `, ${labelNames.length - lost.length}/${labelNames.length} of the label` : ""})` : "INCOMPLETE"}` +
        `${lost.length ? ` MISSING: ${lost.join(", ")}` : ""}${extra.length ? ` EXTRA: ${extra.join(", ")}` : ""}`
    );
    if (!result) console.log(`            ${[...scanner.rebuiltMissing(scan), ...failures.slice(0, 4)].join("; ") || "-"}`);
    if (result) {
      const m = result.merged;
      console.log(`  Analysis: ${result.analysisStatus}${m?.scoring ? ` score ${m.scoring.cleanScore}` : ""} (${m?.matched ?? 0}/${m?.detected ?? 0} matched, ${m?.unknown ?? 0} unknown${m?.unknown ? `: ${m.ingredients.filter((i) => i.status === "unknown").map((i) => i.text).join(", ")}` : ""})`);
    }
    if (args.pairs !== undefined) comparePairs(frames as (Frame & { pairedWith?: number; ocrMs?: number; captureMs?: number })[]);
  }
  console.log(
    `\n${totals.scans} scans: capture ${totals.capture} PASS, scan ${totals.scan} COMPLETE, analysis ${totals.scored} SCORE_AVAILABLE (${[...new Set(scores)].join(", ") || "-"}) / ${totals.blocked} BLOCKED; ${totals.checks} server checks`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
