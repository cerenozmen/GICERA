import { readdirSync, readFileSync } from "fs";
import path from "path";
import { analyzeFrames, MultiFrameAnalysis } from "../services/frameMerge";
import { inciKey, PhotoAnalysis } from "../services/ingredientCoverage";
import { getIngredientVocabulary, loadIngredientInventory } from "../services/ingredientInventoryCache";
import { loadRestrictedSubstances } from "../services/restrictedSubstancesCache";
import { parseIngredientsText, scoreIngredients } from "../services/scoringService";
import { captureTime, CapturedFrame, isCapture, readCaptureFile } from "./captureFiles";

/**
 * Compares single-frame and multi-frame reading on real captures (development tool).
 *
 *   npm run photo:compare -- --captures=captures/face-cream [--label=label.txt]
 *   npm run photo:compare -- --captures=<dir of single-frame captures> --simulate=3
 *
 * Multi-frame captures (taken with the dev build's multi-frame mode) are compared as they are.
 * --simulate groups consecutive single-frame captures into shots of N frames; those frames are
 * separate photos taken seconds apart, so they differ more than frames of one burst.
 */

function parseArgs(argv: string[]): Record<string, string> {
  return Object.fromEntries(argv.flatMap((arg) => (arg.match(/^--([^=]+)=(.*)$/) ? [arg.slice(2).split(/=(.*)/s).slice(0, 2)] : [])));
}

const result = (analysis: PhotoAnalysis | null, status: string) =>
  analysis?.scoring ? `score ${analysis.scoring.cleanScore}` : `tekrar çek (${analysis?.withheldReason ?? status})`;

function describeFrame(index: number, frame: { status: string; analysis: PhotoAnalysis | null }): string {
  const a = frame.analysis;
  if (!a) return `  F${index + 1}: ${frame.status}`;
  const suspicious = a.ingredients.filter((i) => i.status === "unknown" && i.kind !== "resembles_safe").map((i) => `${i.text} (${i.kind})`);
  return (
    `  F${index + 1}: det ${a.detected} mat ${a.matched} unk ${a.unknown} read ${a.readCoverage.toFixed(3)} ` +
    `-> ${result(a, frame.status)}${suspicious.length ? ` | suspicious: ${suspicious.join(", ")}` : ""}`
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.captures) {
    console.error("Usage: npm run photo:compare -- --captures=<dir> [--simulate=3] [--label=label.txt]");
    process.exit(1);
  }
  const label = args.label ? new Set(readFileSync(args.label, "utf8").split(",").map((name) => inciKey(name.trim()))) : null;
  await loadRestrictedSubstances();
  await loadIngredientInventory();
  const vocabulary = getIngredientVocabulary();
  if (!vocabulary) throw new Error("cosing_ingredients is empty; run npm run import:cosing first");

  const files = readdirSync(args.captures).filter(isCapture).sort();
  const perFile = files.map((file) => ({ time: captureTime(file), frames: readCaptureFile(path.join(args.captures, file)) }));
  const size = Number(args.simulate ?? 0);
  const shots: { time: Date; frames: CapturedFrame[] }[] =
    size > 1
      ? Array.from({ length: Math.floor(perFile.length / size) }, (_, i) => ({
          time: perFile[i * size].time,
          frames: perFile.slice(i * size, i * size + size).map((shot) => shot.frames[0]),
        }))
      : perFile;

  const tally = { single: [] as number[], multi: [] as number[], wrong: 0, lost: 0 };
  for (const shot of shots) {
    const inputs = shot.frames.map((frame) => ({ status: frame.status, tokens: parseIngredientsText(frame.text) }));
    const multi: MultiFrameAnalysis = analyzeFrames(inputs, vocabulary, scoreIngredients);
    const single = multi.frames[0];
    console.log(`\n${shot.time.toLocaleTimeString("tr-TR")} (${shot.frames.length} frames)`);
    multi.frames.forEach((frame, index) => console.log(describeFrame(index, frame)));
    for (const c of multi.corrections) console.log(`    corrected #${c.position + 1} "${c.read}" -> ${c.names[0]} (exact in ${c.frames.map((f) => `F${f + 1}`).join(", ")})`);
    for (const c of multi.insertions) console.log(`    inserted  #${c.position + 1} ${c.names[0]} (exact in ${c.frames.map((f) => `F${f + 1}`).join(", ")}; missing in base)`);
    for (const c of multi.conflicts) console.log(`    conflict  #${c.position + 1} "${c.read}": ${c.names.join(" vs ")}`);
    const m = multi.merged;
    const mergedLine = m
      ? `det ${m.detected} mat ${m.matched} unk ${m.unknown} read ${m.readCoverage.toFixed(3)} (base F${multi.base! + 1})`
      : "no complete frame";
    console.log(`  Merged: ${mergedLine}`);
    console.log(`  single-frame: ${result(single.analysis, single.status)}   |   multi-frame: ${result(m, multi.status)}`);

    if (single.analysis?.scoring) tally.single.push(single.analysis.scoring.cleanScore);
    if (m?.scoring) {
      tally.multi.push(m.scoring.cleanScore);
      if (label) {
        const wrong = m.ingredients.filter((i) => i.matchedName && !label.has(inciKey(i.matchedName)));
        const traced = new Set(m.ingredients.map((i) => inciKey(i.matchedName ?? i.nearest ?? "")));
        const lost = [...label].filter((name) => !traced.has(name));
        if (wrong.length) console.log(`  !! matched but not on label: ${wrong.map((i) => i.matchedName).join(", ")}`);
        if (lost.length) console.log(`  !! label ingredients with no trace: ${lost.join(", ")}`);
        tally.wrong += wrong.length;
        tally.lost += lost.length;
      }
    }
  }

  const summary = (scores: number[]) => `${scores.length}/${shots.length} accepted, scores: ${[...new Set(scores)].join(", ") || "-"}`;
  console.log(`\nsingle-frame: ${summary(tally.single)}`);
  console.log(`multi-frame:  ${summary(tally.multi)}`);
  if (label) console.log(`multi-frame accepted shots: ${tally.wrong} wrong matches, ${tally.lost} label ingredients lost`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
