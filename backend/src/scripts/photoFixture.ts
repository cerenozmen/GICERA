import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import {
  analyzePhotoIngredients,
  boundedDistance,
  IngredientVocabulary,
  inciKey,
  lookalikeTolerance,
  PhotoAnalysis,
} from "../services/ingredientCoverage";
import { getIngredientVocabulary, loadIngredientInventory } from "../services/ingredientInventoryCache";
import { loadRestrictedSubstances } from "../services/restrictedSubstancesCache";
import { parseIngredientsText, scoreIngredients } from "../services/scoringService";
import { captureTime, isCapture, RawLine, readCaptureFile } from "./captureFiles";

/**
 * Turns real photos of one product, taken with the app in development mode, into a test fixture
 * (src/services/__fixtures__/photo/<product>.json, checked by photoFixtures.test.ts) and prints a
 * per-shot comparison: detected / matched / unknown / coverage / score, what each ingredient
 * contributes, and how the shots differ.
 *
 * One batch = shots of one product under the same conditions. With the phone connected over USB:
 * 1. Photograph the product's ingredient list (e.g. 5 times) with a dev build of the app.
 * 2. npm run photo:fixture -- --pull --product=face-cream-30ml --name="Face cream 30 ml" --label=label.txt
 *      --packaging=curved --print=small --lighting=indoor
 *    --pull copies the phone's captures to captures/<product>/ and, once the fixture is written,
 *    deletes them from the phone so the next batch starts clean.
 * 3. Next batch of the same product: add --append and change the batch flags, e.g.
 *      --append --lighting=dim   or   --append --orientation=upside-down
 *
 *   --label        text file with the product's real INCI list (comma separated); enables the checks
 *                  for wrong matches and ingredients lost without a trace
 *   --lighting     batch tag: indoor, daylight, dim, glare, ...
 *   --orientation  batch tag: upright (default) or upside-down; the report compares it with the
 *                  orientation read from ML Kit's corner points
 *   --captures     instead of --pull: a directory of ocr-*.json already copied from the phone
 *   --shots        instead of either: JSON [{ id, status, text }] of already extracted lists
 */

type Packaging = "flat" | "curved";
type Print = "normal" | "small";

interface Shot {
  id: string;
  lighting: string;
  orientation: "upright" | "upside-down";
  /** Frontend extraction result: ok, partial, unreadable or no_list. */
  status: string;
  text: string | null;
  /** From ML Kit line geometry, when the capture has it. */
  geometry?: { lines: number; upsideDownLines: number; maxGapRatio: number | null };
  /** Multi-frame captures: every frame's extraction (status/text above are the first frame's). */
  frames?: { status: string; text: string | null }[];
}

interface Fixture {
  product: { slug: string; name: string; packaging: Packaging; print: Print; listLength: "short" | "long" | "unknown" };
  label: string[] | null;
  shots: Shot[];
  /** The slice of the real vocabulary within reach of the shots' texts, so tests need no database. */
  vocabulary: { inventory: string[]; flagged: string[] };
  /** What the real scorer does with each flagged name in the slice. */
  penalties: Record<string, number>;
  pregnancyUnsafe: string[];
}

function parseArgs(argv: string[]): Record<string, string | true> {
  const args: Record<string, string | true> = {};
  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)(?:=(.*))?$/);
    if (match) args[match[1]] = match[2] ?? true;
  }
  return args;
}

/** Share of text lines whose corner points run right-to-left (text photographed upside down), and the
 *  largest vertical gap between comma-bearing lines relative to their median spacing. Reported only. */
function lineGeometry(raw: RawLine[][]): Shot["geometry"] {
  const lines = raw.flat().filter((line) => Array.isArray(line) && line[2]);
  if (lines.length === 0) return undefined;
  const upsideDownLines = lines.filter(([, , , corners]) => corners && corners[1][0] < corners[0][0]).length;
  const tops = lines
    .filter(([text]) => text.includes(","))
    .map(([, , frame]) => frame![1])
    .sort((a, b) => a - b);
  const gaps = tops.slice(1).map((top, i) => top - tops[i]).filter((gap) => gap > 0);
  const median = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
  const maxGapRatio = gaps.length >= 3 && median ? Math.max(...gaps) / median : null;
  return { lines: lines.length, upsideDownLines, maxGapRatio: maxGapRatio && Number(maxGapRatio.toFixed(2)) };
}

const APP_ID = "com.gicera";

/** Copies the dev captures off the phone (adb, app must be a debug build); returns their file names. */
function pullCaptures(dir: string): string[] {
  const files = execFileSync("adb", ["exec-out", "run-as", APP_ID, "ls", "files"]).toString().split(/\s+/).filter(isCapture);
  if (files.length === 0) throw new Error("No captures on the phone; take the photos with a dev build first.");
  mkdirSync(dir, { recursive: true });
  for (const file of files) {
    writeFileSync(path.join(dir, file), execFileSync("adb", ["exec-out", "run-as", APP_ID, "cat", `files/${file}`]));
  }
  console.log(`Pulled ${files.length} captures to ${dir}`);
  return files;
}

/** One shot per capture file; for a multi-frame capture its first frame (what single-frame mode reads). */
function readCaptures(dir: string, files: string[], lighting: string, orientation: Shot["orientation"]): Shot[] {
  return files
    .filter(isCapture)
    .sort()
    .map((file) => {
      const frames = readCaptureFile(path.join(dir, file));
      return {
        id: captureTime(file).toISOString(),
        lighting,
        orientation,
        status: frames[0].status,
        text: frames[0].text,
        geometry: lineGeometry(frames[0].raw),
        ...(frames.length > 1 ? { frames: frames.map(({ status, text }) => ({ status, text })) } : {}),
      };
    });
}

/** Every vocabulary entry the classifier could reach from the shots' tokens (and their 2-way splits). */
function vocabularySlice(shots: Shot[], vocabulary: IngredientVocabulary): Fixture["vocabulary"] {
  const probes = new Set<string>();
  const texts = shots.flatMap((shot) => [shot.text, ...(shot.frames ?? []).map((frame) => frame.text)]);
  for (const text of texts) {
    for (const token of parseIngredientsText(text)) {
      probes.add(inciKey(token));
      const words = token.split(/\s+/);
      for (let i = 1; i < words.length; i++) {
        probes.add(inciKey(words.slice(0, i).join(" ")));
        probes.add(inciKey(words.slice(i).join(" ")));
      }
    }
  }
  const inventory: string[] = [];
  const flagged: string[] = [];
  for (const [key, name] of vocabulary.known) {
    const reachable = [...probes].some((probe) => boundedDistance(probe, key, lookalikeTolerance(probe)) <= lookalikeTolerance(probe));
    if (reachable) (vocabulary.flagged.has(key) ? flagged : inventory).push(name);
  }
  return { inventory: inventory.sort(), flagged: flagged.sort() };
}

function report(fixture: Fixture, analyses: Map<string, PhotoAnalysis>): void {
  const label = fixture.label?.map((name) => inciKey(name));
  console.log(`\n${fixture.product.name} (${fixture.product.packaging}, ${fixture.product.print} print, ${fixture.product.listLength} list)`);
  console.log("shot                      light    det mat unk  cov    result                 geometry");
  for (const shot of fixture.shots) {
    const geometry = shot.geometry
      ? `upside-down ${shot.geometry.upsideDownLines}/${shot.geometry.lines}, max gap ${shot.geometry.maxGapRatio ?? "-"}x`
      : "";
    const analysis = analyses.get(shot.id);
    if (!analysis) {
      console.log(`${shot.id.padEnd(25)} ${shot.lighting.padEnd(8)} frontend: ${shot.status.padEnd(34)} ${geometry}`);
      continue;
    }
    const result = analysis.scoring ? `score ${analysis.scoring.cleanScore}` : `withheld (${analysis.withheldReason})`;
    const counts = [analysis.detected, analysis.matched, analysis.unknown].map((n) => String(n).padStart(3)).join(" ");
    console.log(`${shot.id.padEnd(25)} ${shot.lighting.padEnd(8)} ${counts}  ${analysis.coverage.toFixed(3)}  ${result.padEnd(22)} ${geometry}`);
    const unknown = analysis.ingredients.filter((item) => item.status === "unknown");
    if (unknown.length) console.log(`   unknown: ${unknown.map((i) => `${i.text} → ${i.kind}${i.nearest ? ` ~${i.nearest}` : ""}`).join(" | ")}`);
    const contributions = analysis.ingredients.filter((item) => item.contribution);
    console.log(`   contributions: ${contributions.map((i) => `${i.matchedName} -${i.contribution}`).join(", ") || "none"}`);
    if (label) {
      const wrong = analysis.ingredients.filter((i) => i.matchedName && !label.includes(inciKey(i.matchedName)));
      const traced = new Set(analysis.ingredients.map((i) => inciKey(i.matchedName ?? i.nearest ?? "")));
      const untraced = fixture.label!.filter((name) => !traced.has(inciKey(name)));
      if (wrong.length) console.log(`   matched but not on label: ${wrong.map((i) => `${i.text} → ${i.matchedName}`).join(", ")}`);
      if (untraced.length) console.log(`   label ingredients with no trace: ${untraced.join(", ")}`);
    }
  }

  const scored = fixture.shots.filter((shot) => analyses.get(shot.id)?.scoring);
  const scores = new Set(scored.map((shot) => analyses.get(shot.id)!.scoring!.cleanScore));
  console.log(`\nscored ${scored.length}/${fixture.shots.length} shots; distinct scores: ${[...scores].join(", ") || "-"}`);
  if (scored.length > 1) {
    const sets = scored.map((shot) => new Set(analyses.get(shot.id)!.ingredients.flatMap((i) => (i.matchedName ? [i.matchedName] : []))));
    const union = new Set(sets.flatMap((set) => [...set]));
    const partial = [...union].filter((name) => !sets.every((set) => set.has(name)));
    console.log(`matched in some scored shots but not others: ${partial.join(", ") || "none"}`);
  }

  // Candidate upside-down rule, not used by the app yet: most lines' corner points run right-to-left.
  const withGeometry = fixture.shots.filter((shot) => shot.geometry && shot.geometry.lines > 0);
  if (withGeometry.length) {
    const detected = (shot: Shot) => shot.geometry!.upsideDownLines / shot.geometry!.lines > 0.5;
    const count = (orientation: Shot["orientation"], flagged: boolean) =>
      withGeometry.filter((shot) => (shot.orientation ?? "upright") === orientation && detected(shot) === flagged).length;
    console.log(
      `upside-down rule on ${withGeometry.length} shots with coordinates: ` +
        `upright shots flagged ${count("upright", true)}/${count("upright", true) + count("upright", false)} (false positives), ` +
        `upside-down shots missed ${count("upside-down", false)}/${count("upside-down", true) + count("upside-down", false)}`
    );
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const slug = args.product;
  if (typeof slug !== "string" || (!args.pull && !args.captures && !args.shots)) {
    console.error("Usage: npm run photo:fixture -- --product=<slug> --pull | --captures=<dir> | --shots=<json> [see script header]");
    process.exit(1);
  }
  const file = path.join(__dirname, "../services/__fixtures__/photo", `${slug}.json`);
  if (existsSync(file) && !args.append) {
    throw new Error(`${path.basename(file)} exists; pass --append to add this batch (or delete the file to start over).`);
  }
  const existing: Fixture | null = args.append && existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
  const lighting = typeof args.lighting === "string" ? args.lighting : "unknown";
  const orientation = args.orientation === "upside-down" ? "upside-down" : "upright";

  let pulled: string[] = [];
  let newShots: Shot[];
  if (args.pull) {
    const dir = path.join(__dirname, "../../captures", slug);
    pulled = pullCaptures(dir);
    newShots = readCaptures(dir, pulled, lighting, orientation);
  } else if (typeof args.captures === "string") {
    newShots = readCaptures(args.captures, readdirSync(args.captures), lighting, orientation);
  } else {
    const listed = JSON.parse(readFileSync(String(args.shots), "utf8")) as Omit<Shot, "lighting" | "orientation">[];
    newShots = listed.map((shot) => ({ lighting, orientation, ...shot }));
  }
  const shots = [...(existing?.shots ?? []).filter((shot) => !newShots.some((s) => s.id === shot.id)), ...newShots];
  const label =
    typeof args.label === "string"
      ? readFileSync(args.label, "utf8").split(",").map((name) => name.trim()).filter(Boolean)
      : existing?.label ?? null;

  await loadRestrictedSubstances();
  await loadIngredientInventory();
  const vocabulary = getIngredientVocabulary();
  if (!vocabulary) throw new Error("cosing_ingredients is empty; run npm run import:cosing first");

  const slice = vocabularySlice(shots, vocabulary);
  const fixture: Fixture = {
    product: {
      slug,
      name: typeof args.name === "string" ? args.name : existing?.product.name ?? slug,
      packaging: (args.packaging as Packaging) ?? existing?.product.packaging ?? "flat",
      print: (args.print as Print) ?? existing?.product.print ?? "normal",
      listLength: label ? (label.length <= 10 ? "short" : "long") : "unknown",
    },
    label,
    shots,
    vocabulary: slice,
    penalties: Object.fromEntries(
      slice.flagged.map((name) => [name, 100 - scoreIngredients([name]).cleanScore]).filter(([, penalty]) => penalty)
    ),
    pregnancyUnsafe: slice.flagged.filter((name) => !scoreIngredients([name]).pregnancySafe),
  };
  writeFileSync(file, JSON.stringify(fixture, null, 1));

  const analyses = new Map(
    shots.filter((shot) => shot.text).map((shot) => [shot.id, analyzePhotoIngredients(parseIngredientsText(shot.text), vocabulary, scoreIngredients)])
  );
  report(fixture, analyses);
  console.log(`\nwrote ${path.relative(process.cwd(), file)}`);

  if (pulled.length) {
    execFileSync("adb", ["shell", "run-as", APP_ID, "rm", ...pulled.map((name) => `files/${name}`)]);
    console.log(`Removed ${pulled.length} captures from the phone (copies kept in captures/${slug}/).`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
