import type { TextRecognitionResult } from '@react-native-ml-kit/text-recognition';
import { listText, readSection, Row, ScanFrame, ScanLine, Section } from './ingredientScanner';
import { mergePhotos, MergedList, PhotoList, uprightFrame } from './photoMerge';

/**
 * GUIDED_HIGH_RES_PHOTO: the barcode-less product's ingredient list from a few high-resolution photos
 * taken in the app's camera.
 *
 *   photo → OCR → quality → list section (readSection) → merge with the photos so far (photoMerge)
 *     → completeness on the device (start, end, brackets, lost text, words cut at a row's start)
 *     → only then the server: every row boundary checked for cut words, then the usual analysis.
 *
 * Photos are close-ups: the print should fill the frame, the list need not fit. Each photo is read
 * twice by ML Kit: the whole picture, to find the list, then the list's region cropped at full
 * resolution (bigger print to the recognizer: more ingredients read right, measured on real photos);
 * the crop's reading is used when it is reliable, else the whole picture's. What is still missing
 * decides the next photo (the text's continuation around a tube, its start or end, a region to show
 * again), up to MAX_PHOTOS. A photo that can't be trusted (no text, blurred) is taken again instead of
 * being used. Every photo is one observation: its two readings never count as two. Scan and analysis stay apart: a whole list whose score is
 * withheld is a finished scan; only an incomplete list asks for more photos, apart from one targeted
 * photo when the analysis was blocked by names OCR visibly misread in a known place.
 */

export const MAX_PHOTOS = 5;
/** Photos taken in all, kept or not (retakes of unusable photos): the scan gives up after this many. */
export const MAX_SHOTS = 9;
/** Median ML Kit confidence of the list's lines below which a photo is too blurred to use (good photos: 0.6-0.75). */
export const MIN_CONFIDENCE = 0.45;
/** Median row height as a share of the photo's height below which the print is too small to read. */
export const MIN_ROW_HEIGHT = 0.006;

type Line = ScanLine & { confidence?: number | null };

/**
 * A photo's size as ML Kit reads it (EXIF orientation applied), from the camera's report: the sensor's
 * size and how the phone was held. Portrait photos stand the sensor's landscape frame upright; landscape
 * ones keep it. (The app used to take every photo as portrait: a photo taken sideways got its width and
 * height swapped, and every edge and crop computed on it was wrong.)
 */
export function orientedSize(width: number, height: number, orientation: string | undefined): { width: number; height: number } {
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  return orientation === 'landscape-left' || orientation === 'landscape-right' ? { width: long, height: short } : { width: short, height: long };
}

const distance = (a?: [number, number], b?: [number, number]) => (a && b ? Math.hypot(b[0] - a[0], b[1] - a[1]) : undefined);

/** ML Kit's result as the scanner reads it: lines with their boxes, corner points, words and confidence. */
export function toScanFrame(ocr: TextRecognitionResult, width: number, height: number): ScanFrame {
  const lines: Line[] = ocr.blocks.flatMap(block =>
    block.lines.flatMap(line =>
      line.frame
        ? [
            {
              text: line.text,
              left: line.frame.left,
              top: line.frame.top,
              width: line.frame.width,
              height: line.frame.height,
              confidence: line.confidence ?? null,
              corners: line.cornerPoints?.map((point): [number, number] => [point.x, point.y]),
              words: line.elements?.map(element => {
                const corners = element.cornerPoints?.map((point): [number, number] => [point.x, point.y]);
                return { text: element.text, left: element.frame?.left ?? 0, width: element.frame?.width ?? 0, length: distance(corners?.[0], corners?.[1]) ?? element.frame?.width };
              }),
            },
          ]
        : [],
    ),
  );
  return { lines, width, height };
}

export type QualityProblem = 'no_text' | 'no_list' | 'blurry' | 'small_text';

export interface Quality {
  problem: QualityProblem | null;
  /** Median confidence of the list's lines (null: not reported). */
  confidence: number | null;
  /** Median row height as a share of the photo's height. */
  rowHeight: number | null;
  detail: string;
}

/** One photo read on its own: kept whole, never overwritten by another photo's reading. */
export interface PhotoReading {
  id: string;
  /** The photo upright (ML Kit's lines turned when the phone was held sideways). */
  frame: ScanFrame;
  turned: number;
  rows: Row[];
  section: Section | null;
  reason: string | null;
  /** What the merge takes from it (null: no list). */
  list: PhotoList | null;
  quality: Quality;
}

const median = (values: number[]) => (values.length ? [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] : null);

/** Where a row lies across the photo, as shares of its width; `text` may be the row's tail (heading cut off). */
function spanOf(row: Row, width: number, text = row.text): [number, number] {
  const left = row.left + (row.right - row.left) * Math.max(0, 1 - text.length / Math.max(1, row.text.length));
  return [left / width, row.right / width];
}

/** A word this much narrower per letter than its row's median is squeezed at a curved package's silhouette. */
export const SQUEEZED = 0.6;
/** A row within this share of the picture's side runs off it. */
const EDGE = 0.015;

/** Lines of a physical row (toRows groups them), in reading order. */
function rowLines(row: Row, lines: Line[]): Line[] {
  return lines
    .filter(line => {
      const middle = line.top + line.height / 2;
      return middle >= row.top && middle <= row.bottom && line.left >= row.left - 1 && line.left + line.width <= row.right + 1;
    })
    .sort((a, b) => a.left - b.left);
}

/**
 * Whether a row's start / end is physically cut in this photo: the row runs off the picture's side, or
 * its edge word is squeezed (letters much narrower than the row's usual) as print is at a cylinder's
 * silhouette, where the rest of the word turns out of sight. Pixels only, no dictionary.
 */
export function rowCuts(row: Row, lines: Line[], width: number): [boolean, boolean] {
  const words = rowLines(row, lines).flatMap(line => line.words ?? []);
  const perLetter = (w: { text: string; length?: number; width: number }) => (w.length ?? w.width) / Math.max(1, w.text.replace(/[^\p{L}\p{N}]/gu, '').length);
  const letters = words.filter(w => w.text.replace(/[^\p{L}\p{N}]/gu, '').length >= 3);
  const usual = median(letters.map(perLetter));
  const squeezed = (w?: { text: string; length?: number; width: number }) =>
    !!w && usual !== null && letters.length >= 3 && w.text.replace(/[^\p{L}\p{N}]/gu, '').length >= 3 && perLetter(w) < SQUEEZED * usual;
  return [row.left < EDGE * width || squeezed(words[0]), row.right > (1 - EDGE) * width || squeezed(words[words.length - 1])];
}

export function readPhoto(raw: ScanFrame, id: string, source = id): PhotoReading {
  const upright = uprightFrame(raw);
  const frame: ScanFrame = { width: upright.width, height: upright.height, lines: upright.lines };
  const reading = readSection(frame);
  const { section, rows } = reading;
  const letters = frame.lines.reduce((n, line) => n + (line.text.match(/\p{L}/gu)?.length ?? 0), 0);

  let list: PhotoList | null = null;
  let confidence: number | null = null;
  let rowHeight: number | null = null;
  if (section) {
    const listRows = rows.slice(section.from, section.to);
    const top = Math.min(...listRows.map(row => row.top));
    const bottom = Math.max(...listRows.map(row => row.bottom));
    const inList = (frame.lines as Line[]).filter(line => {
      const middle = line.top + line.height / 2;
      return middle >= top && middle <= bottom;
    });
    const confidences = inList.map(line => line.confidence).filter((c): c is number => typeof c === 'number');
    confidence = median(confidences);
    const height = median(listRows.map(row => row.height));
    rowHeight = height === null ? null : height / frame.height;
    const lines = frame.lines as Line[];
    const above = rows.slice(0, section.from).reverse();
    const below = rows.slice(section.to);
    const cuts = listRows.map(row => rowCuts(row, lines, frame.width));
    list = {
      name: id,
      source,
      rows: section.rows,
      heading: section.heading,
      start: !!section.start,
      end: !!section.end,
      above: rows.slice(0, section.from).reverse().map(row => row.text),
      below: rows.slice(section.to).map(row => row.text),
      spans: section.rows.map((text, i) => spanOf(listRows[i], frame.width, text)),
      aboveSpans: rows.slice(0, section.from).reverse().map(row => spanOf(row, frame.width)),
      belowSpans: rows.slice(section.to).map(row => spanOf(row, frame.width)),
      cutStart: cuts.map(c => c[0]),
      cutEnd: cuts.map(c => c[1]),
      aboveCuts: above.map(row => rowCuts(row, lines, frame.width)),
      belowCuts: below.map(row => rowCuts(row, lines, frame.width)),
    };
  }

  // Conservative checks: a sharp photo of small print must not be turned away.
  let problem: QualityProblem | null = null;
  let detail = 'ok';
  if (frame.lines.length < 3 || letters < 20) {
    problem = 'no_text';
    detail = `${frame.lines.length} OCR lines, ${letters} letters`;
  } else if (!section) {
    problem = 'no_list';
    detail = reading.reason ?? 'no list';
  } else if (confidence !== null && confidence < MIN_CONFIDENCE) {
    problem = 'blurry';
    detail = `median line confidence ${confidence.toFixed(2)} < ${MIN_CONFIDENCE}`;
  } else if (rowHeight !== null && rowHeight < MIN_ROW_HEIGHT) {
    problem = 'small_text';
    detail = `row height ${(rowHeight * frame.height).toFixed(0)} px of ${frame.height}`;
  }
  // (A close-up's rows may run off the picture's sides: not a reason to retake. Those row edges are
  // marked cut, and the text beyond them is asked for with the next photo.)
  return {
    id,
    frame,
    turned: upright.turned,
    rows,
    section,
    reason: reading.reason,
    list,
    quality: { problem, confidence, rowHeight, detail },
  };
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A point of ML Kit's frame (w × h) in the upright frame uprightFrame makes (the text read left to right). */
export function toUpright([x, y]: [number, number], turned: number, w: number, h: number): [number, number] {
  return turned === 90 ? [y, w - x] : turned === 270 ? [h - y, x] : turned === 180 ? [w - x, h - y] : [x, y];
}

/** The inverse: an upright point back in ML Kit's frame (w × h: that frame's size). */
export function fromUpright([u, v]: [number, number], turned: number, w: number, h: number): [number, number] {
  return turned === 90 ? [w - v, u] : turned === 270 ? [v, h - u] : turned === 180 ? [w - u, h - v] : [u, v];
}

const boxOf = (points: [number, number][]): Box => {
  const xs = points.map(p => p[0]);
  const ys = points.map(p => p[1]);
  return { left: Math.min(...xs), top: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
};
const corners = (b: Box): [number, number][] => [
  [b.left, b.top],
  [b.left + b.width, b.top],
  [b.left + b.width, b.top + b.height],
  [b.left, b.top + b.height],
];

/** Share of the photo a crop must leave out to be worth a second pass. */
const CROP_GAIN = 0.8;

/**
 * The ingredient list's region for the second, closer OCR pass, in ML Kit's frame of the photo (the
 * coordinates the crop is cut in): the list's rows with wide margins, so no first or last letter, heading
 * or list end is cut (on a curved package the row ends ML Kit missed lie beyond its rows: 18% of the
 * list's width or six line heights on each side, two and a half line heights above and below). Null
 * when there is no list, or the region is most of the photo anyway.
 */
export function cropBox(reading: PhotoReading, raw: { width: number; height: number }): Box | null {
  const section = reading.section;
  if (!section) return null;
  const listRows = reading.rows.slice(section.from, section.to);
  if (!listRows.length) return null;
  const lh = median(listRows.map(row => row.height)) ?? 0;
  const x0 = Math.min(...listRows.map(row => row.left));
  const x1 = Math.max(...listRows.map(row => row.right));
  const y0 = Math.min(...listRows.map(row => row.top));
  const y1 = Math.max(...listRows.map(row => row.bottom));
  const mx = Math.max(0.18 * (x1 - x0), 6 * lh);
  const my = 2.5 * lh;
  const { width: W, height: H } = reading.frame;
  const upright: Box = { left: Math.max(0, x0 - mx), top: Math.max(0, y0 - my), width: 0, height: 0 };
  upright.width = Math.min(W, x1 + mx) - upright.left;
  upright.height = Math.min(H, y1 + my) - upright.top;
  if (upright.width * upright.height > CROP_GAIN * W * H) return null;
  const box = boxOf(corners(upright).map(p => fromUpright(p, reading.turned, raw.width, raw.height)));
  return { left: Math.round(box.left), top: Math.round(box.top), width: Math.round(box.width), height: Math.round(box.height) };
}

/** The crop's OCR moved back into the whole photo's frame (so edges and positions mean the photo's). */
export function placeCrop(crop: ScanFrame, box: Box, raw: { width: number; height: number }): ScanFrame {
  return {
    width: raw.width,
    height: raw.height,
    lines: crop.lines.map(line => ({
      ...line,
      left: line.left + box.left,
      top: line.top + box.top,
      corners: line.corners?.map(([x, y]): [number, number] => [x + box.left, y + box.top]),
      words: line.words?.map(word => ({ ...word, left: word.left + box.left })),
    })),
  };
}

/**
 * Which reading of a photo is its observation: the crop's when it read the list and the crop's borders
 * cut none of its rows and it read about as much of the list; else the whole picture's. Never both.
 */
export function chooseReading(original: PhotoReading, crop: PhotoReading | null, box: Box | null, raw: { width: number; height: number }): { reading: PhotoReading; pass: 'crop' | 'original'; why: string } {
  if (!crop || !box) return { reading: original, pass: 'original', why: 'no crop' };
  if (!crop.section) return { reading: original, pass: 'original', why: 'crop: no list' };
  const inner = boxOf(corners(box).map(p => toUpright(p, crop.turned, raw.width, raw.height)));
  const { width: W, height: H } = crop.frame;
  const margin = 0.01 * Math.max(inner.width, inner.height);
  const listRows = crop.rows.slice(crop.section.from, crop.section.to);
  const touches = listRows.some(
    row =>
      (inner.left > 1 && row.left < inner.left + margin) ||
      (inner.left + inner.width < W - 1 && row.right > inner.left + inner.width - margin) ||
      (inner.top > 1 && row.top < inner.top + margin) ||
      (inner.top + inner.height < H - 1 && row.bottom > inner.top + inner.height - margin),
  );
  if (touches) return { reading: original, pass: 'original', why: 'crop border cuts the list' };
  const chars = (r: PhotoReading) => r.section!.rows.join(' ').length;
  if (original.section && chars(crop) < 0.8 * chars(original)) return { reading: original, pass: 'original', why: `crop read less (${chars(crop)} vs ${chars(original)} characters)` };
  return { reading: crop, pass: 'crop', why: 'crop' };
}

/** What a list still lacks. `row`: the merged row it concerns (for regions). */
export type Need =
  | { need: 'no_list' }
  | { need: 'start' }
  | { need: 'end' }
  | { need: 'left'; row: number }
  | { need: 'right'; row: number }
  | { need: 'brackets'; row: number }
  | { need: 'gap'; row: number };

export interface Completeness {
  /** CANDIDATE: nothing missing the device can see; the server checks the row boundaries. */
  status: 'CANDIDATE' | 'INCOMPLETE';
  needs: Need[];
}

// Mixed case: most words have lower-case letters and many start with a capital ("Cetearyl Alcohol"):
// there a row starting in lower case starts mid-word (the same rule as the server's listBoundaries).
const mixedCase = (text: string) => {
  const words = text.split(/[\s,;/()]+/).filter(word => (word.match(/\p{L}/gu) ?? []).length >= 3);
  const share = (test: RegExp) => words.filter(word => test.test(word)).length / words.length;
  return words.length > 0 && share(/\p{Ll}/u) >= 0.5 && share(/^[^\p{L}]*\p{Lu}/u) >= 0.4;
};

/**
 * A bracket left open at the end of the text ("(CI 77891" whose ")" OCR lost). Counted as the
 * analysis' tokenizer counts: a stray ")" ("Cetyl Alcoho)", an l misread) closes nothing and drops nothing.
 */
export function leftOpen(text: string): boolean {
  let depth = 0;
  for (const c of text) {
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth = Math.max(0, depth - 1);
  }
  return depth > 0;
}

/**
 * The row where a bracket that stays open to the end of the list was opened (null: none). An opening
 * bracket whose ")" OCR lost would make the analysis drop every item after it, silently.
 */
export function unbalancedRow(rows: string[]): number | null {
  if (!leftOpen(rows.join(' '))) return null;
  let depth = 0;
  let opened: number | null = null;
  rows.forEach((row, r) => {
    for (const c of row) {
      if (c === '(' || c === '[') {
        if (depth === 0) opened = r;
        depth++;
      } else if (c === ')' || c === ']') depth = Math.max(0, depth - 1);
    }
  });
  return opened ?? rows.length - 1;
}

/** What the device can tell is missing from the merged list before asking the server. */
export function deviceCompleteness(merged: MergedList | null): Completeness {
  if (!merged || !merged.rows.length) return { status: 'INCOMPLETE', needs: [{ need: 'no_list' }] };
  const needs: Need[] = [];
  if (!merged.start) needs.push({ need: 'start' });
  if (!merged.end) needs.push({ need: 'end' });
  const open = unbalancedRow(merged.rows);
  if (open !== null) needs.push({ need: 'brackets', row: open });
  merged.rows.forEach((row, r) => {
    // An item read as empty (",," or ", ,"): text there wasn't read.
    if (/(^|[,;])\s*[,;]/.test(row)) needs.push({ need: 'gap', row: r });
  });
  const cutWord = new Set<number>();
  if (mixedCase(merged.rows.join(' '))) {
    merged.rows.forEach((row, r) => {
      if (r > 0 && /^\p{Ll}/u.test(row.trim()) && !/-\s*$/.test(merged.rows[r - 1])) cutWord.add(r);
    });
  }
  // Every row's start and end seen whole in some photo: not run off the picture, not squeezed at a
  // silhouette. A piece ("alophyllum", "Dibuty", "Paraffin" of "Paraffinum") is never completed from
  // the dictionary: the photo that shows the rest is asked for.
  const last = merged.rows.length - 1;
  merged.rows.forEach((_, r) => {
    const seen = merged.seen[r] ?? { start: true, end: true };
    if (r === 0 ? !merged.heading && !seen.start && merged.start : !seen.start || cutWord.has(r)) {
      needs.push(r === 0 ? { need: 'start' } : { need: 'left', row: r });
    }
    if (!seen.end) needs.push(r === last ? { need: 'end' } : { need: 'right', row: r });
  });
  const unique = needs.filter((n, i) => needs.findIndex(m => JSON.stringify(m) === JSON.stringify(n)) === i);
  return { status: unique.length ? 'INCOMPLETE' : 'CANDIDATE', needs: unique };
}

/** The server's unverified row boundaries as what is missing. */
export function serverNeeds(boundaries: { kind: string; row: number; reason: string }[]): Need[] {
  return boundaries.map((b): Need => {
    if (b.kind === 'start') return { need: 'start' };
    if (b.kind === 'end') return { need: 'end' };
    if (b.kind === 'brackets') return { need: 'brackets', row: b.row };
    // A break: the row above ends in a piece of a word (its right side unseen), or the row below starts
    // with one (its left side unseen).
    return /next row starts/.test(b.reason) ? { need: 'left', row: b.row + 1 } : { need: 'right', row: b.row };
  });
}

/** Items of a row, commas in brackets not splitting. */
function splitItems(text: string): string[] {
  const out: string[] = [];
  let current = '';
  let depth = 0;
  for (const c of text) {
    if (c === '(' || c === '[') depth++;
    else if ((c === ')' || c === ']') && depth > 0) depth--;
    else if ((c === ',' || c === ';') && depth === 0) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += c;
  }
  out.push(current.trim());
  return out;
}

/**
 * Each photo's own exact readings, row by row, for the server to confirm misread names with: only the
 * items between separators (the first and last item of a row may be cut words), never an item with an
 * open bracket.
 */
export function photoEvidence(lists: PhotoList[]): string[][] {
  const out: string[][] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    list.rows.forEach((row, i) => {
      const parts = splitItems(row);
      const keepFirst = i === 0 && (list.start || list.heading);
      const keepLast = /[,;]\s*$/.test(row) || (i === list.rows.length - 1 && list.end);
      const inner = parts
        .slice(keepFirst ? 0 : 1, keepLast ? parts.length : parts.length - 1)
        .map(item => item.replace(/[.\s]+$/, '').trim())
        .filter(item => item && !leftOpen(item));
      const key = inner.join('|');
      if (inner.length && !seen.has(key)) {
        seen.add(key);
        out.push(inner);
      }
    });
  }
  return out;
}

/** What the server is asked to check (POST /api/analyze/scan). */
export interface GuidedCandidate {
  path: 'guided_photo';
  readings: { rows: string[]; heading: boolean }[];
  edges: { starts: string[]; ends: string[] }[];
  ingredientsText: string;
  evidence: string[][];
  /** Changes whenever the candidate does: an unchanged one isn't sent again. */
  key: string;
}

export function buildCandidate(merged: MergedList, lists: PhotoList[]): GuidedCandidate {
  const evidence = photoEvidence(lists);
  return {
    path: 'guided_photo',
    readings: [{ rows: merged.rows, heading: merged.heading }],
    edges: merged.edges,
    ingredientsText: listText(merged.rows),
    evidence,
    key: JSON.stringify([merged.rows, merged.edges, evidence]),
  };
}

export interface Reconstruction {
  merged: MergedList | null;
  completeness: Completeness;
  candidate: GuidedCandidate | null;
}

/** The kept photos merged and checked on the device (deterministic: the same photos, the same list). */
export function reconstruct(photos: PhotoReading[]): Reconstruction {
  const lists = photos.flatMap(photo => (photo.list ? [photo.list] : []));
  const merged = mergePhotos(lists);
  const completeness = deviceCompleteness(merged);
  return {
    merged,
    completeness,
    candidate: merged && completeness.status === 'CANDIDATE' ? buildCandidate(merged, lists) : null,
  };
}

// ---------------------------------------------------------------------------------------------
// What to ask the user next.

export type Side = 'left' | 'right' | 'start' | 'end';

export type Prompt =
  | { kind: 'first' }
  | { kind: 'retake'; problem: QualityProblem }
  | { kind: 'more'; side: Side; region?: string }
  | { kind: 'targeted'; region: string | null }
  | { kind: 'failed' };

/**
 * The side to show next: the one with more missing (the list's start and cut row starts are on its
 * left, its end and cut row ends on its right); on a tie, the side not asked for last (CENTER → LEFT →
 * RIGHT → again). A list lacking only its start or end asks for exactly that.
 */
export function nextSide(needs: Need[], asked: Side[]): Side | null {
  const left = needs.filter(n => n.need === 'left').length + needs.filter(n => n.need === 'start').length;
  const right = needs.filter(n => n.need === 'right').length + needs.filter(n => n.need === 'end').length;
  if (!left && !right) return null;
  const onlyStart = needs.every(n => n.need === 'start' || n.need === 'brackets' || n.need === 'gap');
  const onlyEnd = needs.every(n => n.need === 'end' || n.need === 'brackets' || n.need === 'gap');
  if (left && onlyStart) return 'start';
  if (right && onlyEnd) return 'end';
  if (left !== right) return left > right ? 'left' : 'right';
  const last = asked[asked.length - 1];
  return last === 'left' ? 'right' : 'left';
}

/** "listenin sol üst kısmı" for a place on the list (row of rows, share across the row). */
export function regionName(row: number, rows: number, across: number): string {
  const vertical = rows < 3 ? '' : row < rows / 3 ? 'üst' : row >= (2 * rows) / 3 ? 'alt' : '';
  const horizontal = across < 0.34 ? 'sol' : across > 0.66 ? 'sağ' : '';
  const place = [horizontal, vertical].filter(Boolean).join(' ');
  return place ? `listenin ${place} kısmı` : 'listenin ortası';
}

/** The next photo to ask for when the list is incomplete (null: nothing the user can show). */
export function promptForNeeds(needs: Need[], asked: Side[], merged: MergedList | null): Prompt | null {
  if (needs.some(n => n.need === 'no_list')) return { kind: 'retake', problem: 'no_list' };
  const side = nextSide(needs, asked);
  if (side) return { kind: 'more', side };
  // Only brackets or lost text left: show that part of the list again, more closely.
  const at = needs.find((n): n is Extract<Need, { row: number }> => 'row' in n);
  if (at && merged) return { kind: 'targeted', region: regionName(at.row, merged.rows.length, 0.5) };
  return null;
}

export const MESSAGES = {
  first: 'İçerik yazısını yakından ve net şekilde çekin.',
  firstHint: 'Yazılar çerçevenin büyük bölümünü kaplasın.',
  reading: 'İçerikler okunuyor…',
  analysing: 'İçerikler analiz ediliyor…',
  incomplete: 'İçerik listesinin tamamı okunamadı.',
  unclear: 'Bazı içerikler net okunamadı.',
  retake: 'Bu fotoğraf kullanılamadı.',
  failed: 'İçerik listesinin tamamı okunamadı. Lütfen tekrar deneyin.',
};

/** The main line of the camera screen: the first photo's instruction, or why another photo is needed. */
export function promptHeadline(prompt: Prompt): string {
  switch (prompt.kind) {
    case 'first':
      return MESSAGES.first;
    case 'retake':
      return MESSAGES.retake;
    case 'more':
      return MESSAGES.incomplete;
    case 'targeted':
      return MESSAGES.unclear;
    case 'failed':
      return MESSAGES.incomplete;
  }
}

/** What to do for the next photo, in plain words (never the scanner's technical names or an ingredient). */
export function promptText(prompt: Prompt): string {
  switch (prompt.kind) {
    case 'first':
      return MESSAGES.firstHint;
    case 'failed':
      return 'Lütfen tekrar deneyin.';
    case 'retake':
      return {
        no_text: 'Yazı okunamadı. Işığı kontrol edip yazıyı yakından tekrar çekin.',
        no_list: 'İçerik listesi bulunamadı. İçerik yazısını yakından çekin.',
        blurry: 'Yazı net görünmüyor. Telefonu sabit tutup tekrar çekin.',
        small_text: 'Yazılar çok küçük. Biraz yaklaşıp tekrar çekin.',
      }[prompt.problem];
    case 'more':
      return {
        right: 'Ürünü biraz çevirin ve yazının devamını ortalayarak çekin.',
        left: 'Ürünü diğer yöne biraz çevirin ve yazının önceki kısmını ortalayarak çekin.',
        start: 'İçerik listesinin başlangıcını yakından çekin.',
        end: 'İçerik listesinin son kısmını yakından çekin.',
      }[prompt.side];
    case 'targeted':
      return prompt.region ? `Bu bölümü biraz daha yakından ve ortalayarak çekin: ${prompt.region}.` : 'Bu bölümü biraz daha yakından ve ortalayarak çekin.';
  }
}

/** An ingredient as the server's analysis returns it. */
export interface ServerIngredient {
  text: string;
  status: 'matched' | 'unknown';
  /** Unknown: the server's judgement that OCR misread it (a letter garbled, a word no name has). */
  ocrSuspect?: boolean;
}

/**
 * Where on the list the names OCR visibly misread are, when the analysis was blocked by them: the
 * region one more photo, closer and centred, can read again. Null when no blocker looks like a
 * misread (a name read right but missing from the dictionary is not the scanner's to fix) or when the
 * blockers can't be found on the list.
 */
export function blockerRegion(ingredients: ServerIngredient[], merged: MergedList): string | null | undefined {
  const suspects = ingredients.filter(item => item.status === 'unknown' && item.ocrSuspect);
  if (!suspects.length) return undefined;
  const places = suspects.flatMap(item => {
    const needle = item.text.toLowerCase().trim();
    const words = needle.split(/\s+/).filter(word => word.length >= 4);
    for (const probe of [needle, ...words]) {
      const r = merged.rows.findIndex(row => row.toLowerCase().includes(probe));
      if (r >= 0) {
        const at = merged.rows[r].toLowerCase().indexOf(probe) + probe.length / 2;
        return [{ row: r, across: at / Math.max(1, merged.rows[r].length) }];
      }
    }
    return [];
  });
  if (!places.length) return null;
  const names = new Set(places.map(p => regionName(p.row, merged.rows.length, p.across)));
  // Misreads all over the list: the whole list again, closer.
  return names.size === 1 ? [...names][0] : null;
}
