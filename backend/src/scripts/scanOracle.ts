import { readdirSync, readFileSync } from "fs";
import path from "path";
import { getIngredientVocabulary, loadIngredientInventory } from "../services/ingredientInventoryCache";
import { buildWordSet, checkListBoundaries } from "../services/listBoundaries";
import { loadRestrictedSubstances } from "../services/restrictedSubstancesCache";

/**
 * "Oracle" analysis of recorded scans (development tool, not the app's algorithm):
 *
 *   npm run scan:oracle -- --scans=<dir> [--only=a.json,b.json] [--min=8] [--rows]
 *
 * Takes every text row OCR returned during a scan, from all frames at once and in no particular
 * order, and places them as an ideal offline algorithm could: two rows of different frames are the
 * same physical row when they share an exact run of MIN characters (after deterministic
 * normalisation), which also fixes where one sits relative to the other. Each physical row's observed
 * extent is the union of its pieces. Answers, per scan:
 *   - all required text observed = yes/no: would the list assembled this way pass the server's
 *     completeness check (every row boundary seen as whole words in some piece at that edge)?
 *   - for each boundary never seen whole, why:
 *       CAPTURE: nothing beyond the row's observed edge was ever read;
 *       RECONSTRUCTION: rows at the same place in other frames run on past the edge and share an exact
 *         run with it, but shorter than MIN (the join threshold);
 *       CAPTURE or OCR: rows at the same place run on past the edge but share no exact run of 4+
 *         characters with it (misread, or other text);
 *   - the exact-run histogram of pieces of the same row vs of different rows.
 * If all text was observed and the app didn't complete, its reconstruction is what failed.
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const scanner = require("../../../frontend/src/ingredientScanner");
/* eslint-enable @typescript-eslint/no-var-requires */

interface Frame {
  width: number;
  height: number;
  lines: { text: string; left: number; top: number; width: number; height: number }[];
  source?: string;
}

interface Piece {
  id: number;
  frame: number;
  /** Row index within its frame (top to bottom). */
  order: number;
  /** As read, and normalised (used for every comparison). */
  text: string;
  norm: string;
}

interface Placed {
  piece: Piece;
  start: number;
  end: number;
}

interface PhysicalRow {
  root: number;
  pieces: Placed[];
  start: number;
  end: number;
  /** Normalised, and as read (the same pieces). */
  text: string;
  display: string;
}

function parseArgs(argv: string[]): Record<string, string> {
  return Object.fromEntries(
    argv.flatMap((arg) => {
      const match = arg.match(/^--([^=]+)(?:=(.*))?$/);
      return match ? [[match[1], match[2] ?? ""]] : [];
    })
  );
}

/**
 * Deterministic normalisation for comparing OCR text: case, OCR's stray bars and doubled separators
 * ("Glycerin, , Ascorbyl", "Cl | 77491"), spacing around punctuation. No letter is changed.
 */
const normalise = (text: string) =>
  text
    .toLocaleLowerCase("tr")
    .replace(/[|!]/g, " ")
    .replace(/\s+([,.;:)])/g, "$1")
    .replace(/([(])\s+/g, "$1")
    .replace(/,(\s*,)+/g, ",")
    .replace(/\s+/g, " ")
    .trim();

/** Longest exact common run of two texts, and where it starts in each. */
function commonRun(a: string, b: string): { length: number; inA: number; inB: number } {
  let best = { length: 0, inA: 0, inB: 0 };
  const row = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = 0;
    for (let j = 1; j <= b.length; j++) {
      const up = row[j];
      row[j] = a[i - 1] === b[j - 1] ? diagonal + 1 : 0;
      if (row[j] > best.length) best = { length: row[j], inA: i - row[j], inB: j - row[j] };
      diagonal = up;
    }
  }
  return best;
}

const bucket = (n: number) => (n >= 12 ? "12+" : n >= 8 ? "8-11" : n >= 6 ? "6-7" : n >= 4 ? "4-5" : "<4");
const histogram = (values: number[]) => ["12+", "8-11", "6-7", "4-5", "<4"].map((b) => `${b}: ${values.filter((v) => bucket(v) === b).length}`).join(", ");

export interface OracleResult {
  /** All of the list's text was observed (null: no list found among the assembled rows). */
  observed: boolean | null;
  /** Boundaries never seen whole, with why (CAPTURE / OCR / RECONSTRUCTION). */
  failures: string[];
  listRows: number;
}

/**
 * The oracle for one scan's frames (see the header), printing its findings through `log` (pass a
 * no-op to use it quietly, as the fixture tests and scan:compare do).
 */
export function oracle(
  name: string,
  frames: Frame[],
  min: number,
  vocabulary: NonNullable<ReturnType<typeof getIngredientVocabulary>>,
  showRows = false,
  log: (line: string) => void = console.log
): OracleResult {
  return analyse(name, frames, min, vocabulary, showRows, log);
}

function analyse(
  name: string,
  frames: Frame[],
  min: number,
  vocabulary: NonNullable<ReturnType<typeof getIngredientVocabulary>>,
  showRows: boolean,
  log: (line: string) => void
): OracleResult {
  const pieces: Piece[] = [];
  frames.forEach((frame, f) =>
    scanner.toRows(frame).forEach((row: { text: string }, order: number) => {
      const norm = normalise(row.text);
      if (norm.replace(/[^\p{L}]/gu, "").length >= 3) pieces.push({ id: pieces.length, frame: f, order, text: row.text, norm });
    })
  );

  // Candidate pairs: pieces of different frames sharing some 8-character run.
  const grams = new Map<string, number[]>();
  for (const p of pieces) {
    const seen = new Set<string>();
    for (let i = 0; i + 8 <= p.norm.length; i++) {
      const g = p.norm.slice(i, i + 8);
      if (seen.has(g)) continue;
      seen.add(g);
      grams.set(g, [...(grams.get(g) ?? []), p.id]);
    }
  }
  const pairKeys = new Set<string>();
  for (const ids of grams.values()) {
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) if (pieces[ids[i]].frame !== pieces[ids[j]].frame) pairKeys.add(`${ids[i]},${ids[j]}`);
  }
  const edges = [...pairKeys].map((key) => {
    const [a, b] = key.split(",").map(Number);
    const run = commonRun(pieces[a].norm, pieces[b].norm);
    return { a, b, length: run.length, shift: run.inA - run.inB }; // b's start in a's coordinates
  });
  edges.sort((x, y) => y.length - x.length);

  // Physical rows: pieces joined by runs of MIN+, strongest first, with their offsets; never two
  // pieces of one frame in one row, never an offset inconsistent with the row's.
  const parent = pieces.map((p) => p.id);
  const offset = pieces.map(() => 0); // start relative to parent
  const members = pieces.map((p) => [p.id]);
  const root = (x: number) => {
    while (parent[x] !== x) x = parent[x];
    return x;
  };
  const at = (x: number) => {
    let o = 0;
    while (parent[x] !== x) {
      o += offset[x];
      x = parent[x];
    }
    return o;
  };
  let refusedFrame = 0;
  let refusedShift = 0;
  for (const { a, b, length, shift } of edges) {
    if (length < min) break;
    const ra = root(a);
    const rb = root(b);
    if (ra === rb) {
      if (Math.abs(at(b) - (at(a) + shift)) > 3) refusedShift++;
      continue;
    }
    const framesA = new Set(members[ra].map((id) => pieces[id].frame));
    if (members[rb].some((id) => framesA.has(pieces[id].frame))) {
      refusedFrame++; // repeated text in two rows of one frame ("Iron Oxide CI 7749…")
      continue;
    }
    offset[rb] = at(a) + shift - at(b);
    parent[rb] = ra;
    members[ra].push(...members[rb]);
  }

  const rows: PhysicalRow[] = [];
  for (const p of pieces) {
    if (parent[p.id] !== p.id) continue;
    const placed = members[p.id].map((id) => ({ piece: pieces[id], start: at(id), end: at(id) + pieces[id].norm.length }));
    const start = Math.min(...placed.map((x) => x.start));
    const end = Math.max(...placed.map((x) => x.end));
    // A readable text for the row: its most common piece, extended by the pieces reaching furthest.
    const counts = new Map<string, number>();
    for (const x of placed) counts.set(x.piece.norm, (counts.get(x.piece.norm) ?? 0) + 1);
    const core = [...placed].sort((x, y) => counts.get(y.piece.norm)! - counts.get(x.piece.norm)! || y.piece.norm.length - x.piece.norm.length)[0];
    const left = [...placed].sort((x, y) => x.start - y.start)[0];
    const right = [...placed].sort((x, y) => y.end - x.end)[0];
    const compose = (of: (x: Placed) => string) => {
      let text = of(core);
      if (left.start < core.start) text = of(left).slice(0, Math.max(0, core.start - left.start)) + text;
      if (right.end > core.end) text += of(right).slice(Math.max(0, of(right).length - (right.end - core.end)));
      return text;
    };
    rows.push({ root: p.id, pieces: placed, start, end, text: compose((x) => x.piece.norm), display: compose((x) => x.piece.text) });
  }

  // Top-to-bottom order: each frame ranks the rows it shows.
  const rank = new Map<number, number[]>();
  const byFrame = new Map<number, { root: number; order: number }[]>();
  for (const row of rows) for (const { piece } of row.pieces) byFrame.set(piece.frame, [...(byFrame.get(piece.frame) ?? []), { root: row.root, order: piece.order }]);
  for (const list of byFrame.values()) {
    const sorted = [...list].sort((x, y) => x.order - y.order);
    sorted.forEach(({ root: r }, i) => rank.set(r, [...(rank.get(r) ?? []), i / Math.max(1, sorted.length - 1)]));
  }
  const meanRank = (r: number) => rank.get(r)!.reduce((s, v) => s + v, 0) / rank.get(r)!.length;
  const ordered = rows.filter((row) => new Set(row.pieces.map((x) => x.piece.frame)).size >= 3).sort((x, y) => meanRank(x.root) - meanRank(y.root));

  log(
    `\n${name}: ${frames.length} frames (${frames.filter((f) => f.source === "photo").length} photos), ${pieces.length} OCR rows -> ${ordered.length} physical rows seen in 3+ frames ` +
      `[joins refused: ${refusedFrame} same-frame, ${refusedShift} inconsistent offset]`
  );
  if (showRows) ordered.forEach((row, i) => log(`   ${String(i).padStart(3)} [${String(row.pieces.length).padStart(3)} pcs] ${row.display}`));

  // The ingredient list among them, found by the app's own section reading.
  const page = { width: 1000, height: 100000, lines: ordered.map((row, i) => ({ text: row.display, left: 100, top: 100 + i * 50, width: 600, height: 30 })) };
  const section = scanner.readSection(page).section;
  if (!section) {
    log("  no ingredient list among the assembled rows");
    return { observed: null, failures: [], listRows: 0 };
  }
  const firstKey = normalise(section.rows[0]).slice(0, 10);
  const first = ordered.findIndex((row) => row.text.includes(firstKey));
  const list = ordered.slice(first, first + section.rows.length);
  const words = buildWordSet(vocabulary);
  const breakOk = (end: string, start: string) => checkListBoundaries([end, start], true, vocabulary, words).checks.find((c) => c.kind === "break")!.verified;

  // Readings at a row's observed edge: pieces reaching it.
  const edgeTexts = (row: PhysicalRow, side: "start" | "end") =>
    [...new Set(row.pieces.filter((x) => (side === "start" ? x.start <= row.start + 1 : x.end >= row.end - 1)).map((x) => x.piece.text))];
  const rootOf = new Map<number, number>();
  for (const r of ordered) for (const { piece } of r.pieces) rootOf.set(piece.id, r.root);

  /** Why an edge was never seen whole (see the header). */
  const classify = (row: PhysicalRow, side: "start" | "end"): string => {
    // Rows of any frame at this row's place (its frame neighbours belong to this row's neighbours)
    // that were not joined to it.
    const index = ordered.indexOf(row);
    const up = ordered[index - 1];
    const down = ordered[index + 1];
    const slot = pieces.filter((p) => {
      if (rootOf.get(p.id) === row.root) return false;
      const a = pieces.find((q) => q.frame === p.frame && q.order === p.order - 1);
      const b = pieces.find((q) => q.frame === p.frame && q.order === p.order + 1);
      return (!!up && !!a && rootOf.get(a.id) === up.root) || (!!down && !!b && rootOf.get(b.id) === down.root);
    });
    const edge = side === "end" ? row.text.slice(-16) : row.text.slice(0, 16);
    let best = 0;
    let runsOnAtAll = 0;
    for (const p of slot) {
      const run = commonRun(edge, p.norm);
      const runsOn = side === "end" ? p.norm.length - (run.inB + run.length) > 2 + (edge.length - (run.inA + run.length)) : run.inB > 2 + run.inA;
      if (runsOn && run.length >= 4) runsOnAtAll++;
      if (runsOn && run.length > best) best = run.length;
    }
    if (best >= min) return `(joinable by ${best} characters, refused as inconsistent)`;
    if (best >= 4) return `RECONSTRUCTION (${runsOnAtAll} unjoined rows at this place run on past it; longest exact overlap ${best} < ${min})`;
    return slot.length ? `CAPTURE or OCR (${slot.length} unjoined rows at this place, none sharing 4+ exact characters with the edge)` : "CAPTURE (nothing beyond was ever read)";
  };

  const failures: string[] = [];
  list.forEach((row, i) => {
    if (i === 0 && !section.heading) {
      const ok = edgeTexts(row, "start").some((s) => checkListBoundaries([s], false, vocabulary, words).checks[0].verified);
      if (!ok) failures.push(`start of the list "${row.text.slice(0, 22)}" -> ${classify(row, "start")}`);
    }
    const next = list[i + 1];
    const ends = edgeTexts(row, "end");
    if (next) {
      const starts = edgeTexts(next, "start");
      if (ends.some((e) => starts.some((s) => breakOk(e, s)))) return;
      // Which side: the row's end is whole if it is with a plain capitalised next row.
      const endWhole = ends.some((e) => breakOk(e, "Aqua"));
      if (!endWhole) failures.push(`end of row ${i + 1} "…${row.text.slice(-22)}" -> ${classify(row, "end")}`);
      if (!starts.some((s) => breakOk("aqua,", s))) failures.push(`start of row ${i + 2} "${next.text.slice(0, 22)}…" -> ${classify(next, "start")}`);
    } else if (!ends.some((e) => checkListBoundaries([e], true, vocabulary, words).checks.find((c) => c.kind === "end")!.verified)) {
      failures.push(`end of the list "…${row.text.slice(-22)}" -> ${classify(row, "end")}`);
    }
  });

  log(`  all required text observed = ${failures.length ? "NO" : "YES"} (${list.length} list rows, heading ${section.heading ? "seen" : "not seen"}; ${failures.length} boundaries never seen whole)`);
  for (const failure of failures) log(`   ${failure}`);

  // Exact runs between pieces of one list row that extend each other vs pieces of different list rows.
  const same: number[] = [];
  const different: number[] = [];
  list.forEach((row, r) => {
    const sample = row.pieces.slice(0, 40);
    for (let i = 0; i < sample.length; i++)
      for (let j = i + 1; j < sample.length; j++) {
        const [x, y] = sample[i].start <= sample[j].start ? [sample[i], sample[j]] : [sample[j], sample[i]];
        if (x.end < y.end && x.end > y.start) same.push(commonRun(x.piece.norm, y.piece.norm).length);
      }
    for (const other of list.slice(r + 1)) for (const x of row.pieces.slice(0, 8)) for (const y of other.pieces.slice(0, 8)) different.push(commonRun(x.piece.norm, y.piece.norm).length);
  });
  log(`  longest exact run, pieces of one row extending each other: ${histogram(same)}`);
  log(`  longest exact run, pieces of different rows:              ${histogram(different)}`);
  return { observed: failures.length === 0 && list.length > 0, failures, listRows: list.length };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.scans) {
    console.error("Usage: npm run scan:oracle -- --scans=<dir> [--only=a.json,b.json] [--min=8] [--rows]");
    process.exit(1);
  }
  await loadRestrictedSubstances();
  await loadIngredientInventory();
  const vocabulary = getIngredientVocabulary();
  if (!vocabulary) throw new Error("cosing_ingredients is empty");
  const min = Number(args.min || 8);
  const files = readdirSync(args.scans)
    .filter((f) => /^scan-\d+\.json$/.test(f) && (!args.only || args.only.split(",").includes(f)))
    .sort();
  for (const file of files) {
    const frames: Frame[] = JSON.parse(readFileSync(path.join(args.scans, file), "utf8")).frames ?? [];
    if (frames.length) analyse(file, frames, min, vocabulary, args.rows !== undefined, console.log);
  }
}

if (require.main === module) main().catch((error) => {
  console.error(error);
  process.exit(1);
});
