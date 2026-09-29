import { readFileSync } from "fs";
import path from "path";

/** One OCR line as the dev build saves it: text, confidence, frame [left, top, width, height], corners. */
export type RawLine = [string, number | null, number[] | null, number[][] | null];

export interface CapturedFrame {
  raw: RawLine[][];
  /** The app's list extraction, re-run with the current rules. */
  status: string;
  text: string | null;
}

// The app's own list extraction, so tools follow its current rules rather than the ones the phone
// ran when the photo was taken.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readIngredientList } = require("../../../frontend/src/ingredients") as {
  readIngredientList: (blocks: string[][]) => { status: string; ingredientsText: string | null };
};

export const isCapture = (file: string) => /^ocr-\d+\.json$/.test(file);

export const captureTime = (file: string) => new Date(Number(path.basename(file).slice(4, -5)));

/** Orders blocks, and lines within them, top to bottom as IngredientScanScreen does. */
function orderedText(raw: RawLine[][]): string[][] {
  const top = (line: RawLine) => (line[2] ? line[2][1] : 0);
  const blockTop = (block: RawLine[]) => Math.min(...block.map(top));
  return [...raw].sort((a, b) => blockTop(a) - blockTop(b)).map((block) => [...block].sort((a, b) => top(a) - top(b)).map((line) => line[0]));
}

function extract(raw: RawLine[][]): CapturedFrame {
  const reading = readIngredientList(orderedText(raw));
  return { raw, status: reading.status, text: reading.ingredientsText };
}

/**
 * Reads one capture file: multi-frame captures ({ frames: [{ raw }] }), single-frame ones ({ raw }),
 * or the earliest format (just the raw blocks).
 */
export function readCaptureFile(file: string): CapturedFrame[] {
  const saved = JSON.parse(readFileSync(file, "utf8"));
  if (Array.isArray(saved)) return [extract(saved)];
  if (saved.frames) return saved.frames.map((frame: { raw: RawLine[][] }) => extract(frame.raw));
  return [extract(saved.raw)];
}
