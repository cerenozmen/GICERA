import {
  endsOpen,
  garbledHeading,
  joinLines,
  LEADING_HEADING,
  LIST_HEADING,
  normalizeListItems,
  STOP_LINE,
  lowerTr,
  stripHeading,
} from './ingredients';

/**
 * Ingredient-list scanner: reads camera frames, finds the ingredient list in each, and decides when
 * the whole list has been read.
 *
 *   frame → OCR lines → physical rows → ingredient-section candidate (readSection)
 *     FULL_FRAME: one frame shows the whole list (its start, its end, nothing cut at the picture's
 *                 edges): that frame's list is the candidate.
 *     MULTI_VIEW: otherwise rows seen in different frames are joined where they overlap exactly
 *                 (MIN_OVERLAP identical characters), never guessed; the rebuilt list is the candidate
 *                 once its start and end have been seen.
 *   candidate → server: every row boundary checked for cut words (backend listBoundaries.ts), then
 *               the usual analysis. Whether every name is recognised is the analysis' business, not
 *               the scanner's.
 *
 * Nothing here requires the heading: it is one signal among several.
 */

export interface ScanWord {
  text: string;
  left: number;
  width: number;
  /** Length along the reading direction (ML Kit's corner points; the same however the photo is turned). */
  length?: number;
}

export interface ScanLine {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  words?: ScanWord[];
  /** ML Kit's corner points [x, y] (development logs: the slant of arced rows on round jars). */
  corners?: [number, number][];
}

export interface ScanFrame {
  lines: ScanLine[];
  width: number;
  height: number;
}

/** Characters two slices of one row must share, exactly, to be joined. */
export const MIN_OVERLAP = 8;
/** Text within this share of the picture's width/height from its edge may be cut by the edge. */
const BORDER = 0.02;
/** Frames in a row that fit nowhere on the rebuilt list before it is started again from scratch. */
const RESTART_AFTER = 4;
/** Exact run (characters) an OCR line must share with each of two rebuilt rows to count as mixing them. */
const MIXED_RUN = 12;
/** Share of the letters a placed slice must read the same as the row where both have text. */
const AGREEMENT = 0.7;
/** Characters two readings of one row can differ in length by up to where they are (OCR drops or adds letters). */
const DRIFT = 3;

/** One physical text row of a frame (ML Kit may split a row into several lines). */
export interface Row {
  text: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
  height: number;
}

export type StartEvidence = 'heading' | 'text_above';
export type EndEvidence = 'stop_line' | 'text_below' | 'period';

/** The ingredient list as one frame shows it. */
export interface Section {
  /** The list's rows; the first without its heading. */
  rows: string[];
  heading: boolean;
  /** Where the frame shows the list begin / end, if it does. */
  start: StartEvidence | null;
  end: EndEvidence | null;
  /** Picture edges the list touches (text there may be cut). */
  cropped: ('top' | 'bottom' | 'left' | 'right')[];
  /** The list's rows among the frame's rows (FrameReading.rows): [from, to). */
  from: number;
  to: number;
  /** Items the OCR read as empty (",," or ": ,MICA"): text lost. */
  emptyItems: number;
  items: number;
  /** The whole list is in this frame (start, end, nothing cut at the picture's edges, no lost text). */
  whole: boolean;
  /** Why it isn't whole (logs). */
  missing: string[];
}

export interface FrameReading {
  rows: Row[];
  section: Section | null;
  /** Why no section was found (logs). */
  reason: string | null;
  lineHeight: number | null;
}

const commaCount = (text: string) => (text.match(/,/g) ?? []).length;
const lower = lowerTr;
const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();
const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const endsWithPeriod = (text: string) => /\.\s*(\([^()]*\))?$/.test(text);

/**
 * The list heading at the start of a row. OCR sometimes drops the colon ("INGREDIENTS Aqua, Gycerin"
 * on a real photo), so a bare heading word also counts when list text with commas follows; and on
 * small curved print it garbles the heading word itself (see garbledHeading).
 */
function isHeadingRow(text: string): boolean {
  return (
    LIST_HEADING.test(text) ||
    (LEADING_HEADING.test(text) && commaCount(text) >= 2) ||
    garbledHeading(text) !== null
  );
}

/**
 * Groups OCR lines into physical rows. On a curved label the boxes of stacked rows grow tall and
 * overlap vertically, so (from real tube scans): centres within 0.15 of the box height are one row;
 * up to 0.5 apart only when side by side, never when stacked.
 */
export function toRows(frame: ScanFrame): Row[] {
  const lines = [...frame.lines]
    .filter(line => line.text.trim())
    .sort((a, b) => a.top + a.height / 2 - (b.top + b.height / 2));
  const groups: ScanLine[][] = [];
  const overlapsHorizontally = (a: ScanLine, b: ScanLine) =>
    Math.min(a.left + a.width, b.left + b.width) > Math.max(a.left, b.left);
  const sameRow = (a: ScanLine, b: ScanLine) => {
    const apart =
      Math.abs(a.top + a.height / 2 - (b.top + b.height / 2)) /
      Math.min(a.height, b.height);
    return apart < 0.15 || (apart < 0.5 && !overlapsHorizontally(a, b));
  };
  for (const line of lines) {
    const group = groups.find(g => g.every(other => sameRow(other, line)));
    if (group) group.push(line);
    else groups.push([line]);
  }
  return groups.map(group => {
    const parts = [...group].sort((a, b) => a.left - b.left);
    return {
      text: collapse(parts.map(part => part.text).join(' ')),
      left: Math.min(...parts.map(part => part.left)),
      right: Math.max(...parts.map(part => part.left + part.width)),
      top: Math.min(...parts.map(part => part.top)),
      bottom: Math.max(...parts.map(part => part.top + part.height)),
      height: median(parts.map(part => part.height)),
    };
  });
}

/**
 * How much a text's items look like INCI names: the share starting with a capital or a digit, or, for
 * a list printed in lower case ("zinc oxide, paraffin, lanolin, ozokerite, …" on a real balm), the
 * share of short items (3 words at most) when there are 3+ items, no colon and few digits: not
 * sentences, not an address.
 */
function nameLike(text: string): number {
  const items = normalizeListItems(text);
  if (!items.length) return 0;
  const capitalised =
    items.filter(item => /^[\p{Lu}\d]/u.test(item)).length / items.length;
  if (capitalised >= 0.5) return capitalised;
  const short =
    items.filter(item => item.split(/\s+/).length <= 3).length / items.length;
  const digits = items.filter(item => /\d/.test(item)).length / items.length;
  return items.length >= 3 &&
    short >= 0.8 &&
    digits < 0.2 &&
    !text.includes(':')
    ? short
    : capitalised;
}

/**
 * A heading can follow other text on its row, after a sentence ends ("…soothing chapped skin.
 * Ingredients: Aqua, paraffin, …" on a real balm): the row is then two, the text before it and the
 * list from the heading on.
 */
function splitAtHeading(row: Row): Row[] {
  for (const match of row.text.matchAll(/[.!]\s+/g)) {
    const at = match.index! + match[0].length;
    const rest = row.text.slice(at);
    if (LIST_HEADING.test(rest) && rest.includes(','))
      return [
        { ...row, text: row.text.slice(0, at).trim() },
        { ...row, text: rest },
      ];
  }
  return [row];
}

/**
 * The ingredient section in one frame's rows: from a heading row or, without one, the first row of
 * the most list-like run of comma-separated rows, down to where the list ends. Several signals decide
 * (heading, commas, number of rows, capitalised names, text around it); none is required alone.
 */
export function readSection(frame: ScanFrame): FrameReading {
  const rows = toRows(frame).flatMap(splitAtHeading);
  const lineHeight = rows.length ? median(rows.map(row => row.height)) : null;
  if (!rows.length)
    return { rows, section: null, reason: 'no text', lineHeight };

  // Other text right below a list row shows where the list ends only when it can't be the list's own
  // next row, cut or misread ("tric Acid." under "…Tocopheryl" on a tube; "Coco Capry" under
  // "…Potassium Cety Phosphate" on a real jar, a capitalised name like any INCI name): the list row
  // ended its sentence, or the text below is a label section, or it reads as a sentence or an
  // address, not as names (a colon, a long number, mostly lower-case words).
  const sentenceLike = (text: string) => {
    const words = text.split(/\s+/).filter(word => /\p{L}{2}/u.test(word));
    const lowerWords = words.filter(word =>
      /^[^\p{L}]*\p{Ll}/u.test(word),
    ).length;
    return (
      /:/.test(text) ||
      /\d{3,}/.test(text) ||
      (words.length >= 3 && lowerWords / words.length >= 0.5)
    );
  };
  const endsHere = (listRow: string, below: string) =>
    endsWithPeriod(listRow) ||
    STOP_LINE.test(below) ||
    isHeadingRow(below) ||
    sentenceLike(below);

  const found: {
    start: number;
    end: number;
    closedBy: EndEvidence | null;
    heading: boolean;
  }[] = [];
  const collect = (start: number, heading: boolean) => {
    let end = start + 1;
    let closedBy: EndEvidence | null = null;
    for (; end < rows.length; end++) {
      const row = rows[end].text;
      const previous = rows[end - 1].text;
      if (STOP_LINE.test(row) || isHeadingRow(row)) {
        closedBy = 'stop_line';
        break;
      }
      // After a row ending in a period only a row that reads like list goes on with it ("Alcohol
      // Denat." can end a row mid-list): 2+ commas, no colon. Address or packaging lines beside or
      // under a list ("DIST. MARKWINS BEAUTY BRANDS, INC" on a real blush label) have fewer.
      if (
        endsWithPeriod(previous) &&
        (commaCount(row) < 2 || row.includes(':') || nameLike(row) < 0.5)
      ) {
        closedBy = 'text_below';
        break;
      }
      // A row with commas carries on the list.
      if (row.includes(',')) continue;
      // A short comma-less row ending in a period right after the list: its last item ("Tocopherol."
      // on a real tube, under a row cut by the silhouette that didn't end in a comma), unless list
      // rows follow it (OCR reads commas as periods: "Gyce Stearate." amid a real jar's arced rows).
      const next = rows[end + 1]?.text ?? '';
      if (
        endsWithPeriod(row) &&
        (endsOpen(previous) || row.split(/\s+/).length <= 4) &&
        !(commaCount(next) >= 1 && nameLike(next) >= 0.5)
      ) {
        end++;
        closedBy = end < rows.length ? 'text_below' : null;
        break;
      }
      // "Sodium Hyaluronate" alone on a row after "…, " (a name, not a sentence below a row cut
      // after its comma: "Sudocrem cildin korunma kapasitesini destekler…" on a real balm).
      if (endsOpen(previous) && row.split(/\s+/).length <= 4) continue;
      closedBy = endsHere(previous, row) ? 'text_below' : null;
      break;
    }
    found.push({ start, end, closedBy, heading });
  };
  rows.forEach((row, i) => {
    if (isHeadingRow(row.text)) collect(i, true);
  });
  // Without a heading: runs starting at a row with commas that doesn't continue the row above, and
  // reads like names (a sentence of usage text above the list has commas too: "…ulaşamayacağı,
  // güvenli bir yerde saklayın," right above a real tube's list whose heading OCR misread).
  rows.forEach((row, i) => {
    if (
      commaCount(row.text) >= 1 &&
      nameLike(row.text) >= 0.5 &&
      !found.some(c => i >= c.start && i < c.end)
    )
      collect(i, false);
  });

  const scored = found
    .map(c => {
      const text = stripHeading(
        joinLines(rows.slice(c.start, c.end).map(row => row.text)),
      );
      const items = normalizeListItems(text).length;
      return {
        ...c,
        items,
        score:
          (c.heading ? 5 : 0) +
          Math.min(items, 30) / 3 +
          (c.end - c.start) +
          nameLike(text) * 3,
      };
    })
    // Without a heading, ask for more: a real list (3+ items over 2+ rows, or 5+ items) of names.
    .filter(
      c =>
        c.heading ||
        ((c.items >= 5 || (c.items >= 3 && c.end - c.start >= 2)) &&
          nameLike(joinLines(rows.slice(c.start, c.end).map(r => r.text))) >=
            0.6),
    )
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) {
    const reason = found.length
      ? 'comma text found, but not list-like (too few items / not name-like)'
      : 'no heading and no comma-separated text';
    return { rows, section: null, reason, lineHeight };
  }

  const listRows = rows.slice(best.start, best.end);
  const texts = listRows.map(row => row.text);
  texts[0] = stripHeading(texts[0]).trim();
  if (!texts[0]) texts.shift();

  // Start: the heading, or other text just above whose sentence has ended, and a capitalised first item.
  const above = rows[best.start - 1];
  const first = listRows[0];
  const textAbove =
    !!above &&
    first.top - above.bottom < 2.5 * first.height &&
    /[.:!]\s*$|^[^\p{Ll}]+$/u.test(above.text) &&
    /^[\p{Lu}\d]/u.test(texts[0] ?? '');
  const start: StartEvidence | null = best.heading
    ? 'heading'
    : textAbove
    ? 'text_above'
    : null;

  // End: the next label section or other text below, or a closing period with the picture going on below.
  const last = listRows[listRows.length - 1];
  const lastText = texts[texts.length - 1] ?? '';
  const bottomCut = last.bottom > frame.height * (1 - BORDER);
  let end: EndEvidence | null = best.closedBy;
  if (end && endsOpen(lastText)) end = null; // "…Glycerin," then other text: the list went on elsewhere
  if (!end && endsWithPeriod(lastText) && !bottomCut) end = 'period';

  const cropped: Section['cropped'] = [];
  if (!best.heading && first.top < frame.height * BORDER) cropped.push('top');
  if (bottomCut && end !== 'stop_line' && end !== 'text_below')
    cropped.push('bottom');
  if (listRows.some(row => row.left < frame.width * BORDER))
    cropped.push('left');
  if (listRows.some(row => row.right > frame.width * (1 - BORDER)))
    cropped.push('right');

  const joined = texts.join(' ');
  const emptyItems = (joined.match(/(^|[,;])\s*(?=[,;])/g) ?? []).length;
  const missing: string[] = [];
  if (!start) missing.push('start not seen');
  if (!end) missing.push('end not seen');
  if (cropped.length)
    missing.push(`touches picture edge: ${cropped.join('/')}`);
  if (emptyItems) missing.push(`${emptyItems} empty item(s): text not read`);
  // More list-like text (name-like rows with commas) outside the list read than in it, other than
  // another list with its own heading (multi-language labels): the list read is only a piece of it
  // (a real jar's arced rows came out of OCR in a jumbled order).
  const listCommas = texts.reduce((n, text) => n + commaCount(text), 0);
  const outsideCommas = rows.reduce(
    (n, row, i) =>
      (i >= best.start && i < best.end) ||
      found.some(c => c.heading && i >= c.start && i < c.end) ||
      nameLike(row.text) < 0.5
        ? n
        : n + commaCount(row.text),
    0,
  );
  if (outsideCommas >= 3 && outsideCommas > listCommas)
    missing.push(
      `more list text outside the list read (${outsideCommas} vs ${listCommas} commas)`,
    );

  return {
    rows,
    lineHeight,
    reason: null,
    section: {
      rows: texts,
      from: best.end - texts.length,
      to: best.end,
      heading: best.heading,
      start,
      end,
      cropped,
      emptyItems,
      items: best.items,
      whole: missing.length === 0,
      missing,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// MULTI_VIEW: rebuilding the list's rows from pieces seen in different frames.
//
// A curved label shows each physical row in pieces: a different horizontal window per view, the
// words at the window's edges often misread (squeezed at the silhouette). Every piece a frame reads
// of a row is kept, placed on the row where it shares an exact run of MIN_OVERLAP characters with
// what is known of the row. The row's text is then taken from the pieces' insides, switching from one
// piece to the next in the middle of a run they share exactly, so a misread edge of one piece never
// ends up inside the row, and pieces join in any order the user turns the product.

/**
 * One reading per differently read word at the row's edge, most agreed on first (up to `max`). The
 * right word is not always the majority: at a silhouette OCR can misread the same way several times
 * ("Dibuty" in 5 frames, "Dibutyl" in 3 on a real tube).
 */
export function distinctEdgeReadings(
  row: RebuiltRow,
  side: 'start' | 'end',
  max: number,
): Piece[] {
  const seen = new Set<string>();
  const out: Piece[] = [];
  for (const piece of edgeReadings(row, side)) {
    // (Case kept: "Butylene" and "butylene" at a row's start tell different things.)
    const words = piece.text.trim().split(/\s+/);
    const word = side === 'start' ? words[0] : words[words.length - 1];
    if (seen.has(word)) continue;
    seen.add(word);
    out.push(piece);
    if (out.length === max) break;
  }
  return out;
}

/** Longest exact common run of two texts (case-insensitive), and where it starts in each. */
export function commonRun(
  a: string,
  b: string,
): { length: number; inA: number; inB: number } {
  const x = lower(a);
  const y = lower(b);
  let best = { length: 0, inA: 0, inB: 0 };
  const row = new Array<number>(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i++) {
    let diagonal = 0;
    for (let j = 1; j <= y.length; j++) {
      const up = row[j];
      row[j] = x[i - 1] === y[j - 1] ? diagonal + 1 : 0;
      if (row[j] > best.length)
        best = { length: row[j], inA: i - row[j], inB: j - row[j] };
      diagonal = up;
    }
  }
  return best;
}

const gramIndexes = new Map<string, Map<string, number[]>>();
/** Where every MIN_OVERLAP-character run of a text starts (cached per text). */
function gramIndex(text: string): Map<string, number[]> {
  let index = gramIndexes.get(text);
  if (index) return index;
  index = new Map();
  const t = lower(text);
  for (let i = 0; i + MIN_OVERLAP <= t.length; i++) {
    const gram = t.slice(i, i + MIN_OVERLAP);
    const at = index.get(gram);
    if (at) at.push(i);
    else index.set(gram, [i]);
  }
  if (gramIndexes.size > 2000) gramIndexes.clear();
  gramIndexes.set(text, index);
  return index;
}

/**
 * Longest exact (case-insensitive) run of at least MIN_OVERLAP characters shared by two texts, found
 * through their shared MIN_OVERLAP-character runs; null when there is none. (commonRun's result for
 * runs that long, much faster.)
 */
function longRun(
  a: string,
  b: string,
): { length: number; inA: number; inB: number } | null {
  const index = gramIndex(a);
  const x = lower(a);
  const y = lower(b);
  let best: { length: number; inA: number; inB: number } | null = null;
  for (let j = 0; j + MIN_OVERLAP <= y.length; j++) {
    const hits = index.get(y.slice(j, j + MIN_OVERLAP));
    if (!hits) continue;
    for (const i of hits) {
      if (i > 0 && j > 0 && x[i - 1] === y[j - 1]) continue; // counted from where it starts
      let k = MIN_OVERLAP;
      while (i + k < x.length && j + k < y.length && x[i + k] === y[j + k]) k++;
      if (!best || k > best.length) best = { length: k, inA: i, inB: j };
    }
  }
  return best;
}

/** Items of a slice safe to use as evidence: the first and last may be cut words, so they are dropped. */
function sliceItems(text: string, first: boolean): string[] {
  const items = normalizeListItems(text);
  const from = first ? 0 : 1;
  const to = /,\s*$/.test(text) ? items.length : items.length - 1;
  const kept = items.slice(from, Math.max(from, to));
  // A last item cut inside its bracket ("…, Titanium Dioxide (CI 789" at a tube's curve) was read whole
  // up to the bracket: the name before it is kept (its bracket's content never counts).
  const last = text.slice(text.lastIndexOf(',') + 1);
  const cut = /^([^()]*[A-Za-z]{3}[^()]*?)\s*\([^()]*$/.exec(last.trim());
  if (to < items.length && items.length - 1 >= from && cut) kept.push(cut[1].trim());
  return kept;
}

/** One reading of (part of) a physical row, placed on it (`start`: where it begins on the row). */
export interface Piece {
  text: string;
  start: number;
  /** Frames that read it exactly like this at this place (and how many). */
  frames: Set<number>;
  seen: number;
  /** Read by a frame that recognised the list heading right before it (the text after the heading). */
  afterHeading?: boolean;
}

export interface RebuiltRow {
  pieces: Piece[];
  /** composeRow's last result, and the state of the pieces it was for. */
  composed?: { key: string; text: string };
  /** The list heading was read at this row's start. */
  heading: boolean;
}

const pieceEnd = (piece: Piece) => piece.start + piece.text.length;
/**
 * Where the row starts. On the heading row, where the list starts: right after the heading as frames
 * that recognised it read it (other frames' pieces reach further left with the heading misread:
 * "lcindekller: Aqua").
 */
const startPieces = (row: RebuiltRow) =>
  row.heading && row.pieces.some(p => p.afterHeading)
    ? row.pieces.filter(p => p.afterHeading)
    : row.pieces;
export const rowStart = (row: RebuiltRow) =>
  Math.min(...startPieces(row).map(p => p.start));
export const rowEnd = (row: RebuiltRow) =>
  Math.max(...row.pieces.map(pieceEnd));
/**
 * Pieces kept per row. Every differently read piece is kept (a right reading can be in the minority:
 * a real tube read "Calophyllum" in 4 frames while its row wasn't rebuilt yet); only past this many
 * are the least seen dropped.
 */
const MAX_PIECES = 80;

/**
 * The readings at one of the row's edges (pieces reaching it), most agreed on first: grouped by the
 * word they start (end) with, groups ordered by how many frames read that word. OCR misreads the
 * words at a silhouette differently every time; the real word is the one read the same way again.
 */
export function edgeReadings(row: RebuiltRow, side: 'start' | 'end'): Piece[] {
  const edge = side === 'start' ? rowStart(row) : rowEnd(row);
  // Within the drift pieces are joined with: one reading with a letter or two added ("Cellulose e
  // Gurn", once) mustn't push the edge past the reading eight frames agreed on ("Cellulose Gum,").
  const reaching = (side === 'start' ? startPieces(row) : row.pieces).filter(
    p =>
      side === 'start' ? p.start <= edge + DRIFT : pieceEnd(p) >= edge - DRIFT,
  );
  const word = (p: Piece) => {
    const words = lower(p.text).trim().split(/\s+/);
    return side === 'start' ? words[0] : words[words.length - 1];
  };
  const votes = new Map<string, number>();
  for (const p of reaching)
    votes.set(word(p), (votes.get(word(p)) ?? 0) + p.seen);
  // Pieces reaching exactly to the edge first, then those closest to it: a piece cut a letter short
  // still lands within one, and the ones further off only fill what is left of `max` readings.
  const distance = (p: Piece) =>
    side === 'start' ? p.start - edge : edge - pieceEnd(p);
  // At a row's end, a reading that shows the item's closing comma: OCR drops commas at a
  // silhouette, it doesn't add them ("…Cellulose Gum" would join the next row's "Tocopherol.").
  const closed = (p: Piece) =>
    Number(side === 'end' && /[,;]\s*$/.test(p.text));
  return [...reaching].sort(
    (a, b) =>
      distance(a) - distance(b) ||
      closed(b) - closed(a) ||
      votes.get(word(b))! - votes.get(word(a))! ||
      b.seen - a.seen ||
      b.text.length - a.text.length ||
      a.start - b.start ||
      (a.text < b.text ? -1 : a.text > b.text ? 1 : 0),
  );
}

/**
 * Longest exact run shared by two pieces where their places on the row say they overlap (within 3
 * characters of misread-length drift). A run elsewhere would be text repeated within the row
 * ("Dimethicone/Vinyl Dimethicone") and would splice the row at the wrong place.
 */
function alignedRun(
  a: Piece,
  fromA: number,
  b: Piece,
): { inA: number; inB: number; length: number } | null {
  let best: { inA: number; inB: number; length: number } | null = null;
  for (let drift = -DRIFT; drift <= DRIFT; drift++) {
    const shift = a.start - b.start + drift; // b index = a index + shift
    let run = 0;
    for (let i = fromA; i <= a.text.length; i++) {
      const j = i + shift;
      if (
        i < a.text.length &&
        j >= 0 &&
        j < b.text.length &&
        lower(a.text[i]) === lower(b.text[j])
      )
        run++;
      else {
        if (run >= MIN_OVERLAP && (!best || run > best.length))
          best = { inA: i - run, inB: i - run + shift, length: run };
        run = 0;
      }
    }
  }
  return best;
}

/** The row's text, from its start reading to its end reading through the pieces' insides. */
export function composeRow(row: RebuiltRow): string {
  const key = `${row.heading}|${row.pieces
    .map(p => `${p.start}:${p.seen}:${p.afterHeading ? 1 : 0}`)
    .join(',')}`;
  if (row.composed?.key === key) return row.composed.text;
  const text = compose(row);
  row.composed = { key, text };
  return text;
}

function compose(row: RebuiltRow): string {
  // How far a piece's reading is confirmed by other frames: its whole items (between its first and
  // last, which may be cut) that other pieces read exactly the same.
  const itemsOf = new Map(
    row.pieces.map(p => [
      p,
      lower(p.text)
        .split(/[,;]/)
        .slice(1, -1)
        .map(item => item.trim())
        .filter(item => item.length >= 3),
    ]),
  );
  const agreement = new Map(
    row.pieces.map(p => [
      p,
      itemsOf
        .get(p)!
        .reduce(
          (n, item) =>
            n +
            row.pieces
              .filter(q => q !== p && lower(q.text).includes(item))
              .reduce((m, q) => m + q.seen, 0),
          0,
        ),
    ]),
  );
  const first = edgeReadings(row, 'start')[0];
  const last = edgeReadings(row, 'end')[0];
  let current = first;
  let from = 0; // where in `current` the row's text continues
  let text = '';
  const used = new Set<Piece>([first]);
  while (current !== last && pieceEnd(current) < pieceEnd(last)) {
    // The next piece: the end reading if it joins here, else the one whose items other frames read
    // exactly the same most (OCR misreads vary, the right reading repeats), else the one reaching
    // furthest.
    const options = row.pieces
      .filter(p => !used.has(p) && pieceEnd(p) > pieceEnd(current))
      .sort(
        (a, b) =>
          Number(b === last) - Number(a === last) ||
          agreement.get(b)! - agreement.get(a)! ||
          b.seen - a.seen ||
          pieceEnd(b) - pieceEnd(a) ||
          (a.text < b.text ? -1 : a.text > b.text ? 1 : 0),
      );
    let next: {
      piece: Piece;
      switchCurrent: number;
      switchNext: number;
    } | null = null;
    for (const piece of options) {
      const run = alignedRun(current, from, piece);
      if (!run) continue;
      const middle = Math.floor(run.length / 2);
      next = {
        piece,
        switchCurrent: run.inA + middle,
        switchNext: run.inB + middle,
      };
      break;
    }
    if (!next) break; // nothing joins: the row's text stops here (its end reading is elsewhere)
    text += current.text.slice(from, next.switchCurrent);
    current = next.piece;
    from = next.switchNext;
    used.add(current);
  }
  return collapse(text + current.text.slice(from));
}

/**
 * Where a frame's slice sits on a rebuilt row: its longest exact run with the row's text, when that
 * run is at least MIN_OVERLAP characters and occurs once in the row (text repeated within a row,
 * "Iron Oxide … Iron Oxide", would put it in the wrong place).
 */
function placeOn(
  row: RebuiltRow,
  text: string,
  composed: string,
): { start: number; overlap: number; inText: number } | null {
  const run = longRun(composed, text);
  if (!run) return null;
  const shared = lower(composed).slice(run.inA, run.inA + run.length);
  if (lower(composed).indexOf(shared) !== lower(composed).lastIndexOf(shared))
    return null;
  // Placed there, the rest of the slice must read like the row where both have text: most letters
  // the same at the same place (a misread here and there, not a different text). An OCR line that
  // repeats a word of the row ("methicone/Vinyi Dimethicone/Vinyl Dimethicone" on a real tube) would
  // otherwise sit on the wrong repetition and seem to reach past the row's start.
  // (Letters dropped or added by OCR shift the rest of a line by one or two: counted are the letters
  // in exact runs of 3+ along the anchored alignment or within two letters of it.)
  const x = lower(composed);
  const y = lower(text);
  const shift = run.inA - run.inB;
  const covered = new Array<boolean>(y.length).fill(false);
  for (let drift = -2; drift <= 2; drift++) {
    let length = 0;
    for (let j = 0; j <= y.length; j++) {
      const i = j + shift + drift;
      if (j < y.length && i >= 0 && i < x.length && x[i] === y[j]) length++;
      else {
        if (length >= 3) for (let k = j - length; k < j; k++) covered[k] = true;
        length = 0;
      }
    }
  }
  // Only where the row's text is read the same by two of its pieces: a row's end misread once at the
  // silhouette ("…Acrylates St CCopojat") must not keep out a slice that reads it right ("…Acrylates
  // Copolymer," in 4 frames of a real tube). (A row of one piece: its text as is.)
  const origin = edgeReadings(row, 'start')[0].start;
  const needed = Math.min(2, row.pieces.length);
  const supported = (i: number) => {
    let n = 0;
    for (const piece of row.pieces) {
      const k = origin + i - piece.start;
      if (
        k >= 0 &&
        k < piece.text.length &&
        lower(piece.text[k]) === x[i] &&
        ++n >= needed
      )
        return true;
    }
    return false;
  };
  let both = 0;
  let same = 0;
  for (let j = 0; j < y.length; j++) {
    const i = j + shift;
    if (i < 0 || i >= x.length || !supported(i)) continue;
    both++;
    if (covered[j]) same++;
  }
  if (same < AGREEMENT * both) return null;
  return {
    start: origin + run.inA - run.inB,
    overlap: run.length,
    inText: run.inB,
  };
}

/**
 * An OCR line that mixes two physical rows: different parts of it sit exactly on two different
 * rebuilt rows. On a round jar's lid the rows are arcs, and ML Kit's straight lines can cut across
 * them ("Aqua, Giycery Stearic Acid, Palmitic Acid, Phenoxyethanol": row 1's start, row 4's end);
 * placing such a line on either row would drop the items in between. Text repeated in two rows
 * ("Iron Oxide CI 7749…") sits on both with the same part of the line, which is not mixing.
 */
/** A line's longest exact run with each rebuilt row, where it lies in the line (for mixesRows). */
function rawRuns(scan: ScanState, text: string) {
  return scan.rows.map(composed => {
    const run = longRun(composed, text);
    return run ? { overlap: run.length, inText: run.inB } : null;
  });
}

function mixesRows(
  placements: ({ overlap: number; inText: number } | null)[],
): boolean {
  // Both parts must be long: a short word run (" Alcohol,") is shared by many rows.
  const found = placements.filter(
    (p): p is { overlap: number; inText: number } =>
      !!p && p.overlap >= MIXED_RUN,
  );
  return found.some((a, i) =>
    found.slice(i + 1).some(
      b =>
        // (A space or comma may belong to both parts.)
        a.inText + a.overlap <= b.inText + 2 ||
        b.inText + b.overlap <= a.inText + 2,
    ),
  );
}

const newPiece = (
  text: string,
  start: number,
  frame: number,
  afterHeading = false,
): Piece => ({
  text,
  start,
  frames: new Set([frame]),
  seen: 1,
  afterHeading,
});

function addPiece(
  row: RebuiltRow,
  text: string,
  start: number,
  frame: number,
  afterHeading = false,
): boolean {
  const same = row.pieces.find(
    p => p.text === text && Math.abs(p.start - start) <= 1,
  );
  if (same) {
    same.frames.add(frame);
    same.seen = same.frames.size;
    same.afterHeading = same.afterHeading || afterHeading;
    return false;
  }
  row.pieces.push(newPiece(text, start, frame, afterHeading));
  if (row.pieces.length > MAX_PIECES) {
    const keep = new Set([
      ...distinctEdgeReadings(row, 'start', 6),
      ...distinctEdgeReadings(row, 'end', 6),
    ]);
    const rest = row.pieces
      .filter(p => !keep.has(p))
      .sort((a, b) => b.seen - a.seen || (a.text < b.text ? -1 : 1));
    row.pieces = [...keep, ...rest.slice(0, MAX_PIECES - keep.size)];
  }
  return true;
}

/**
 * States of a scan (IngredientScanScreen): SEARCHING → READING → FULL_FRAME_VALIDATING (one frame
 * shows the whole list) or MULTI_VIEW_SCANNING (it doesn't) → VALIDATING → COMPLETE, NEED_MORE_VIEW
 * (back to scanning) or RETRY. Every state but COMPLETE and RETRY goes on scanning; the screen's
 * time limits end it. Why a frame didn't help (no heading, cut rows, …) is a diagnostic, not a state.
 */
export type ScanPhase =
  /** No ingredient list seen yet. */
  | 'SEARCHING'
  /** A list is in view and being read. */
  | 'READING'
  /** A frame shows the whole list: checking it. */
  | 'FULL_FRAME_VALIDATING'
  /** The list is spread over several views: collecting them. */
  | 'MULTI_VIEW_SCANNING'
  /** The rebuilt list is being checked. */
  | 'VALIDATING'
  | 'COMPLETE'
  /** Checked, and some part hasn't been seen whole yet. */
  | 'NEED_MORE_VIEW'
  /** Given up: no reliable reading. */
  | 'RETRY';

/** A frame showed the list's start (end) at a rebuilt row's edge, which was then at `at`. */
interface EdgeEvidence<K> {
  kind: K;
  row: RebuiltRow;
  at: number;
}

export interface ScanState {
  /** MULTI_VIEW: the physical rows rebuilt so far, and their texts (composeRow). */
  rebuilt: RebuiltRow[];
  rows: string[];
  /** The rebuilt list's start / end, as currently seen (null once text is found beyond them). */
  start: StartEvidence | null;
  end: EndEvidence | null;
  heading: boolean;
  startSeen: EdgeEvidence<StartEvidence> | null;
  endSeen: EdgeEvidence<EndEvidence> | null;
  /** Unique slices (as item lists) seen so far, sent to the server as evidence. */
  evidence: string[][];
  /**
   * FULL_FRAME: the latest frame showing the whole list, then earlier ones showing the same list row
   * for row (each row overlapping exactly): the server takes a row boundary as seen when any of them
   * shows it whole (OCR misreads different words in different frames).
   */
  wholeReadings: Section[];
  frames: number;
  unplacedStreak: number;
  /**
   * Every differently read frame showing some of the list, kept whole: what the scan has observed.
   * The list checked is rebuilt from these alone (settled), the same whatever order they came in.
   */
  observations: { key: string; reading: FrameReading }[];
  /**
   * Most list rows two frames showed between the list's start and end (both in the frame). A rebuilt
   * list with fewer rows lacks one: on a round jar the first frames' arced rows can skip one, and rows
   * are only ever added above or below.
   */
  rowsSeen: number;
  /** Frames that showed the list from start to end, by its number of rows (for rowsSeen). */
  rowCounts: Record<number, Set<number>>;
  /**
   * OCR lines seen mixing two rows (arced text, a round jar): then one frame showing the list in more
   * rows than rebuilt is enough to hold the rebuilt list back.
   */
  mixedLines: number;
  /**
   * Places where frames showed more rows between two rebuilt rows than the rebuilt list has there: a
   * row is missing from it (on a round jar a row's pieces can end up in its neighbour's). While two
   * frames say so and it isn't resolved, the rebuilt list isn't offered.
   */
  gaps: {
    above: RebuiltRow;
    below: RebuiltRow;
    rows: number;
    frames: Set<number>;
  }[];
  restarts: number;
  /** Bumped whenever the rebuilt list, its evidence or its start/end change (progress). */
  version: number;
}

export type FrameVerdict =
  | 'useful'
  | 'duplicate'
  | 'no_list'
  | 'unplaced'
  | 'restarted';

export interface FrameReport {
  verdict: FrameVerdict;
  reason: string | null;
  /** The frame's own list, when it shows it whole (FULL_FRAME candidate). */
  wholeList: Section | null;
  section: Section | null;
  /** Rebuilt row the frame's first list row was placed on. */
  offset: number | null;
  /** Per list row of the frame: exact overlap with its rebuilt row (0: not placed). */
  overlaps: number[];
  /** Characters the rebuilt rows grew by (either side), and new pieces kept. */
  grew: number;
  newPieces: number;
  /** OCR lines of the frame's list that mixed two physical rows (not used). */
  mixed: number;
  newEvidence: number;
  lineHeight: number | null;
}

export function createScan(): ScanState {
  return {
    rebuilt: [],
    rows: [],
    start: null,
    end: null,
    heading: false,
    startSeen: null,
    endSeen: null,
    evidence: [],
    wholeReadings: [],
    frames: 0,
    unplacedStreak: 0,
    observations: [],
    gaps: [],
    rowsSeen: 0,
    rowCounts: {},
    mixedLines: 0,
    restarts: 0,
    version: 0,
  };
}

/** Readings kept per whole list (the newest first). */
const MAX_READINGS = 5;

/** Two readings of the whole list, row for row: same number of rows, every row overlapping exactly. */
// (Any exact run of MIN_OVERLAP characters per row: small print is misread at both ends of a row in
// some frames, "…CI T7891" / "ETHYLENEPRÓPYLENE…" on a real blush label.)
const sameList = (a: Section, b: Section) =>
  a.rows.length === b.rows.length &&
  a.rows.every((row, i) => !!longRun(row, b.rows[i]));

function addWholeReading(scan: ScanState, section: Section): boolean {
  if (
    scan.wholeReadings.some(
      reading => reading.rows.join('\n') === section.rows.join('\n'),
    )
  ) {
    return false;
  }
  scan.wholeReadings = [
    section,
    ...scan.wholeReadings.filter(reading => sameList(reading, section)),
  ].slice(0, MAX_READINGS);
  return true;
}

const extent = (scan: ScanState) =>
  scan.rebuilt.reduce((n, row) => n + rowEnd(row) - rowStart(row), 0);

/** Recomputes what follows from the rebuilt rows: their texts, and whether start and end still hold. */
function refresh(scan: ScanState) {
  scan.rows = scan.rebuilt.map(composeRow);
  const first = scan.rebuilt[0];
  const last = scan.rebuilt[scan.rebuilt.length - 1];
  // Text found beyond where the list seemed to start or end: that start/end doesn't hold.
  // (The heading row's start is the heading itself, whatever else is read left of it.)
  if (
    scan.startSeen &&
    (scan.startSeen.row !== first ||
      (scan.startSeen.kind !== 'heading' &&
        rowStart(first) < scan.startSeen.at - 1))
  )
    scan.startSeen = null;
  if (
    scan.endSeen &&
    (scan.endSeen.row !== last || rowEnd(last) > scan.endSeen.at + 1)
  )
    scan.endSeen = null;
  scan.start = scan.startSeen?.kind ?? null;
  scan.end = scan.endSeen?.kind ?? null;
  scan.heading = !!first?.heading && !!scan.startSeen;
}

function restart(scan: ScanState, section: Section, frame: number) {
  scan.rebuilt = section.rows.map((text, i) => ({
    pieces: [newPiece(text, 0, frame, i === 0 && section.heading)],
    heading: i === 0 && section.heading,
  }));
  scan.startSeen = section.start
    ? { kind: section.start, row: scan.rebuilt[0], at: 0 }
    : null;
  const last = scan.rebuilt[scan.rebuilt.length - 1];
  scan.endSeen = section.end
    ? { kind: section.end, row: last, at: rowEnd(last) }
    : null;
  scan.unplacedStreak = 0;
  refresh(scan);
}

/**
 * Adds one frame's reading to the scan (mutates `scan`) and reports what it contributed: kept as an
 * observation, and added to the live reconstruction (progress, hints). What is checked is rebuilt
 * from the observations (see settled).
 */
export function addFrame(scan: ScanState, reading: FrameReading): FrameReport {
  const frame = scan.frames++;
  if (reading.section?.rows.length) {
    const key = JSON.stringify([
      reading.rows.map(row => row.text),
      reading.section.from,
      reading.section.to,
    ]);
    if (!scan.observations.some(o => o.key === key))
      scan.observations.push({ key, reading });
  }
  return apply(scan, reading, frame, false);
}

/**
 * Adds a reading to a reconstruction. `settling`: rebuilding from every observation (settled), where
 * nothing is started over.
 */
function apply(
  scan: ScanState,
  reading: FrameReading,
  frame: number,
  settling: boolean,
): FrameReport {
  const section = reading.section;
  const report: FrameReport = {
    verdict: 'no_list',
    reason: reading.reason,
    wholeList: section?.whole ? section : null,
    section,
    offset: null,
    overlaps: section ? section.rows.map(() => 0) : [],
    grew: 0,
    newPieces: 0,
    mixed: 0,
    newEvidence: 0,
    lineHeight: reading.lineHeight,
  };
  if (!section || !section.rows.length) return report;
  const newReading = section.whole && addWholeReading(scan, section);
  if (newReading) scan.version++;
  if (section.start && section.end && section.emptyItems === 0) {
    const n = section.rows.length;
    scan.rowCounts[n] = (scan.rowCounts[n] ?? new Set()).add(frame);
    // Two frames at least: one frame's OCR can split a row in two (a real cream photo did).
    if (scan.rowCounts[n].size >= 2) scan.rowsSeen = Math.max(scan.rowsSeen, n);
  }
  const before = JSON.stringify([scan.rows, scan.start, scan.end]);
  const extentBefore = extent(scan);

  if (!scan.rebuilt.length) {
    restart(scan, section, frame);
    report.offset = 0;
    report.grew = extent(scan);
    report.newPieces = section.rows.length;
  } else {
    // Place the frame's rows: at the one offset where most of them sit exactly (at least two, or its
    // only row). Offsets may be negative: rows above the first rebuilt one.
    const mixedRows = new Set<number>();
    const places = section.rows.map((text, i) => {
      const placements = scan.rebuilt.map((row, r) =>
        placeOn(row, text, scan.rows[r]),
      );
      if (mixesRows(rawRuns(scan, text))) {
        report.mixed++;
        scan.mixedLines++;
        mixedRows.add(i);
        return placements.map(() => null);
      }
      return placements;
    });
    const offsets = Array.from(
      { length: scan.rebuilt.length + section.rows.length - 1 },
      (_, k) => k - (section.rows.length - 1),
    );
    const scores = offsets.map(
      o => section.rows.filter((_, i) => !!places[i][o + i]).length,
    );
    const best = Math.max(...scores);
    const offset =
      best >= Math.min(2, section.rows.length) &&
      scores.filter(s => s === best).length === 1
        ? offsets[scores.indexOf(best)]
        : null;
    if (offset === null) {
      scan.unplacedStreak++;
      // What was rebuilt matches nothing any more (it may have been the wrong text): start over.
      if (scan.unplacedStreak >= RESTART_AFTER && !settling) {
        restart(scan, section, frame);
        scan.restarts++;
        scan.version++;
        report.verdict = 'restarted';
        report.reason = `${RESTART_AFTER} frames fit nowhere on the rebuilt list: rebuilt from this frame`;
        return report;
      }
      report.verdict = 'unplaced';
      report.reason = `no ${MIN_OVERLAP}-character exact overlap with the rebuilt rows (best: ${best} row(s))`;
      return report;
    }
    scan.unplacedStreak = 0;
    report.offset = offset;

    // Rows above the first rebuilt one: only when the frame's row below them sits on the first row,
    // and never above the heading row (what is above the heading is other text).
    let base = offset;
    if (offset < 0 && places[-offset][0] && !scan.rebuilt[0].heading) {
      scan.rebuilt.unshift(
        ...section.rows.slice(0, -offset).map(text => ({
          pieces: [newPiece(text, 0, frame)],
          heading: false,
        })),
      );
      report.newPieces += -offset;
      base = 0;
    }
    section.rows.forEach((text, i) => {
      const index = base + i;
      if (index < 0) return;
      if (index >= scan.rebuilt.length) {
        // A row below the rebuilt last one: only right after it, when the frame's row above sits on it.
        if (index !== scan.rebuilt.length || !report.overlaps[i - 1]) return;
        scan.rebuilt.push({
          pieces: [newPiece(text, 0, frame)],
          heading: false,
        });
        report.newPieces++;
        return;
      }
      const placeAt = (r: number) =>
        !scan.rebuilt[r]
          ? null
          : base === offset
          ? places[i][r]
          : placeOn(scan.rebuilt[r], text, composeRow(scan.rebuilt[r]));
      // Not when the row above or below fits it at least as well: the frame may have one row fewer
      // or more than the rebuilt list (an OCR line across two rows), which shifts the rest by one
      // ("Acetate, Parfum, Citric Acid." would sit on the row above by a shared "c Acid, ").
      const fits = placeAt(index);
      const neighbours = Math.max(
        placeAt(index - 1)?.overlap ?? 0,
        placeAt(index + 1)?.overlap ?? 0,
      );
      const place = fits && fits.overlap > neighbours ? fits : null;
      report.overlaps[i] = place?.overlap ?? 0;
      if (
        place &&
        addPiece(
          scan.rebuilt[index],
          text,
          place.start,
          frame,
          i === 0 && section.heading,
        )
      )
        report.newPieces++;
    });

    // Two of the frame's rows placed with more rows between them in the frame than in the rebuilt
    // list (and no row mixing two rows in between): the rebuilt list lacks a row there.
    const placedAt = section.rows
      .map((_, i) =>
        report.overlaps[i] > 0 ? { i, row: scan.rebuilt[base + i] } : null,
      )
      .filter((x): x is { i: number; row: RebuiltRow } => !!x);
    placedAt.forEach((a, k) => {
      const b = placedAt[k + 1];
      if (!b || b.i - a.i < 2) return;
      const between = scan.rebuilt.indexOf(b.row) - scan.rebuilt.indexOf(a.row);
      if (between >= b.i - a.i || [...mixedRows].some(m => m > a.i && m < b.i))
        return;
      const gap = scan.gaps.find(g => g.above === a.row && g.below === b.row);
      if (gap) gap.frames.add(frame);
      else
        scan.gaps.push({
          above: a.row,
          below: b.row,
          rows: b.i - a.i,
          frames: new Set([frame]),
        });
    });

    // The heading marks where the list starts: rebuilt rows above it are other text.
    const headingIndex = section.heading ? base : -1;
    if (headingIndex >= 0 && report.overlaps[0] > 0) {
      scan.rebuilt[headingIndex].heading = true;
      if (headingIndex > 0) scan.rebuilt.splice(0, headingIndex);
      base -= headingIndex;
    }
    refresh(scan);

    // The frame's rows just outside its list (its reading of where the list starts or ends can be a
    // row short: a real tube's "…Isostearate, Dibutyl" row sat right above a frame's list): kept as
    // pieces when they sit exactly on the rebuilt rows next to the placed ones.
    for (const direction of [-1, 1]) {
      for (let k = 1; ; k++) {
        const frameRow =
          reading.rows[direction < 0 ? section.from - k : section.to - 1 + k];
        const index =
          direction < 0 ? base - k : base + section.rows.length - 1 + k;
        const row = scan.rebuilt[index];
        if (!frameRow || !row) break;
        const place = placeOn(row, frameRow.text, scan.rows[index]);
        if (!place || mixesRows(rawRuns(scan, frameRow.text))) break;
        if (addPiece(row, frameRow.text, place.start, frame))
          report.newPieces++;
      }
    }
    refresh(scan);

    // The frame shows the list's start at the first rebuilt row's start, or its end at the last's end.
    const firstRow = scan.rebuilt[base];
    const lastIndex = base + section.rows.length - 1;
    const lastRow = scan.rebuilt[lastIndex];
    const firstPiece = firstRow?.pieces.find(
      p => p.text === section.rows[0] && (!firstRow.heading || p.afterHeading),
    );
    const lastPiece = lastRow?.pieces.find(
      p => p.text === section.rows[section.rows.length - 1],
    );
    if (
      section.start &&
      base === 0 &&
      firstPiece &&
      firstPiece.start <= rowStart(firstRow) + 1
    ) {
      scan.startSeen = {
        kind: section.start,
        row: firstRow,
        at: rowStart(firstRow),
      };
    }
    if (
      section.end &&
      lastIndex === scan.rebuilt.length - 1 &&
      lastPiece &&
      pieceEnd(lastPiece) >= rowEnd(lastRow) - 1
    ) {
      scan.endSeen = { kind: section.end, row: lastRow, at: rowEnd(lastRow) };
    }
  }
  refresh(scan);
  report.grew = Math.max(0, extent(scan) - extentBefore);

  const known = new Set(scan.evidence.map(items => items.join('|')));
  section.rows.forEach((text, i) => {
    const items = sliceItems(text, i === 0 && !!section.start);
    if (!items.length || known.has(items.join('|'))) return;
    known.add(items.join('|'));
    scan.evidence.push(items);
    report.newEvidence++;
  });

  const changed =
    JSON.stringify([scan.rows, scan.start, scan.end]) !== before ||
    report.newEvidence > 0 ||
    report.newPieces > 0 ||
    newReading;
  report.verdict = changed ? 'useful' : 'duplicate';
  if (!changed) report.reason = 'nothing new';
  if (changed) scan.version++;
  return report;
}

/** The rebuilt list, once its start and end have been seen (the server then checks its row boundaries). */
export function rebuiltList(scan: ScanState):
  | (Pick<Section, 'rows' | 'heading'> & {
      edges: { starts: string[]; ends: string[] }[];
    })
  | null {
  if (
    !scan.rows.length ||
    !scan.start ||
    !scan.end ||
    missingRows(scan).length ||
    scan.rebuilt.length < rowsNeeded(scan)
  )
    return null;
  // Every row's differing readings at its edges: the server takes a boundary as seen whole when any
  // pair of readings shows it whole (the first row's start without its heading).
  const edges = scan.rebuilt.map((row, i) => ({
    starts: distinctEdgeReadings(row, 'start', 6).map(p =>
      i === 0 ? stripHeading(p.text).trim() : p.text,
    ),
    ends: distinctEdgeReadings(row, 'end', 6).map(p => p.text),
  }));
  const rows = [...scan.rows];
  rows[0] = stripHeading(rows[0]).trim();
  return { rows, heading: scan.heading, edges };
}

/**
 * Grows only when the scan gets closer to a complete list: more rebuilt text, the list's start or
 * end seen, more frames showing the whole list (up to MAX_READINGS). OCR jitter producing yet another
 * spelling of the same slice doesn't count. For no-progress detection.
 */
export function progressLevel(scan: ScanState): number {
  return (
    extent(scan) +
    (scan.start ? 500 : 0) +
    (scan.end ? 500 : 0) +
    200 * scan.wholeReadings.length
  );
}

/** What the server is asked to check (POST /api/analyze/scan). */
export interface Candidate {
  path: 'full_frame' | 'multi_view';
  readings: { rows: string[]; heading: boolean }[];
  /** MULTI_VIEW: each row's differing readings at its edges (see rebuiltList). */
  edges?: { starts: string[]; ends: string[] }[];
  ingredientsText: string;
  evidence: string[][];
  /** Changes whenever the candidate does: only a changed candidate is worth sending again. */
  key: string;
}

/**
 * Canonical order of observations: frames with the heading first, then those showing more of the list,
 * then by their text. The reconstruction built in this order doesn't depend on the order frames came in.
 */
function canonical(usual: number) {
  return (
    a: { key: string; reading: FrameReading },
    b: { key: string; reading: FrameReading },
  ): number => {
    const x = a.reading.section!;
    const y = b.reading.section!;
    return (
      Number(y.heading) - Number(x.heading) ||
      Math.abs(x.rows.length - usual) - Math.abs(y.rows.length - usual) ||
      y.rows.length - x.rows.length ||
      Number(y.whole) - Number(x.whole) ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
    );
  };
}

/**
 * The number of rows most frames showing the list's start and end agree on (0: none did). A frame
 * with an extra row (OCR split one, or mixed two) is a poor frame to rebuild from first.
 */
function usualRows(observations: { reading: FrameReading }[]): number {
  const counts = observations
    .map(({ reading }) => reading.section!)
    .filter(section => section.start && section.end)
    .map(section => section.rows.length)
    .sort((x, y) => x - y);
  if (!counts.length) return 0;
  const times = new Map<number, number>();
  for (const n of counts) times.set(n, (times.get(n) ?? 0) + 1);
  const [mode, modeTimes] = [...times].sort(
    (x, y) => y[1] - x[1] || y[0] - x[0],
  )[0];
  // Seen twice or more: that. Otherwise the median (a split row adds one, a missed row takes one).
  return modeTimes >= 2 ? mode : counts[Math.floor(counts.length / 2)];
}

const settledCache = new WeakMap<
  ScanState,
  { count: number; state: ScanState }
>();

/**
 * The reconstruction to check: rebuilt from all observations in canonical order, twice (the second
 * time every observation's pieces find the rows the first pass added after it). The same set of
 * observations always gives the same list. Never started over: the best observations come first, so
 * the ones that fit nowhere are misread ones (on a real jar, four such at the end of the order wiped a
 * rebuilt 10-row list and left 2 rows of garbage).
 */
export function settled(scan: ScanState): ScanState {
  const cached = settledCache.get(scan);
  if (cached && cached.count === scan.observations.length) return cached.state;
  const state = createScan();
  const order = [...scan.observations].sort(
    canonical(usualRows(scan.observations)),
  );
  for (let pass = 0; pass < 2; pass++) {
    order.forEach((observation, i) =>
      apply(state, observation.reading, i, true),
    );
  }
  state.frames = order.length;
  settledCache.set(scan, { count: scan.observations.length, state });
  return state;
}

/** Worth rebuilding and checking: some frame showed the list's start and some its end. */
export function readyToCheck(scan: ScanState): boolean {
  return (
    scan.observations.some(o => o.reading.section!.start) &&
    scan.observations.some(o => o.reading.section!.end)
  );
}

/**
 * The lists ready to be checked, from the settled reconstruction: the whole list as single frames
 * showed it (FULL_FRAME) and the list rebuilt from several frames (MULTI_VIEW), whichever exist.
 */
export function candidates(live: ScanState): Candidate[] {
  const scan = settled(live);
  const out: Candidate[] = [];
  const make = (
    path: Candidate['path'],
    readings: Candidate['readings'],
    evidence: string[][],
  ): Candidate => {
    const ingredientsText = listText(readings[0].rows);
    return {
      path,
      readings,
      ingredientsText,
      evidence,
      key: `${path}\n${readings.map(r => r.rows.join('\n')).join('\n--\n')}\n${
        evidence.length
      }`,
    };
  };
  // (Not when another frame showed the list in more rows: one is missing from these readings, as
  // with a round jar's arced rows. A flat label shows the same rows in every frame. Nor when two
  // frames from the list's start showed it going on past this end: that end is a misread, as a
  // mid-list comma read as a period over text below was on a real sunscreen.)
  if (
    scan.wholeReadings.length &&
    scan.wholeReadings[0].rows.length >= rowsNeeded(scan) &&
    scan.wholeReadings[0].rows.length >= rowsFromStart(live)
  ) {
    const readings = scan.wholeReadings.map(({ rows, heading }) => ({
      rows,
      heading,
    }));
    const others = scan.wholeReadings
      .slice(1)
      .map(reading => normalizeListItems(joinLines(reading.rows)));
    out.push(make('full_frame', readings, [...others, ...scan.evidence]));
  }
  const rebuilt = rebuiltList(scan);
  if (rebuilt) {
    const candidate = make(
      'multi_view',
      [{ rows: rebuilt.rows, heading: rebuilt.heading }],
      scan.evidence,
    );
    out.push({
      ...candidate,
      edges: rebuilt.edges,
      key: `${candidate.key}
${JSON.stringify(rebuilt.edges)}`,
    });
  }
  return out;
}

/**
 * Most rows two frames showed from the list's start (whether or not they reached its end). A frame
 * that looks whole with fewer rows has a false end: the list was seen going on past it.
 */
function rowsFromStart(scan: ScanState): number {
  const counts = scan.observations
    .map(o => o.reading.section)
    .filter(section => !!section?.start)
    .map(section => section!.rows.length)
    .sort((a, b) => b - a);
  return counts[1] ?? 0;
}

/** Rows the rebuilt list must have at least (see ScanState.rowsSeen and mixedLines). */
function rowsNeeded(scan: ScanState): number {
  // Rows seen mixed (arced text): the number of rows most frames showed from the list's start to its
  // end (a real jar: 10 rows in 18 frames, 11 in 2 where OCR split a row; the largest count two frames
  // agree on would be 11). Otherwise the largest
  // number two frames agree on (rowsSeen).
  if (scan.mixedLines === 0) return scan.rowsSeen;
  const counts = Object.entries(scan.rowCounts).flatMap(
    ([n, frames]) => Array(frames.size).fill(Number(n)) as number[],
  );
  if (!counts.length) return scan.rowsSeen;
  counts.sort((x, y) => x - y);
  const times = new Map<number, number>();
  for (const n of counts) times.set(n, (times.get(n) ?? 0) + 1);
  const [mode, modeTimes] = [...times].sort(
    (x, y) => y[1] - x[1] || y[0] - x[0],
  )[0];
  return modeTimes >= 2 ? mode : counts[Math.floor(counts.length / 2)];
}

/** Gaps (see ScanState.gaps) two frames showed and the rebuilt list hasn't filled. */
function missingRows(scan: ScanState) {
  return scan.gaps.filter(gap => {
    const above = scan.rebuilt.indexOf(gap.above);
    const below = scan.rebuilt.indexOf(gap.below);
    return (
      gap.frames.size >= 2 &&
      above >= 0 &&
      below > above &&
      below - above < gap.rows
    );
  });
}

/** What the rebuilt list still lacks (logs), in the settled reconstruction. */
export function rebuiltMissing(live: ScanState): string[] {
  const scan = settled(live);
  const missing: string[] = [];
  for (const gap of missingRows(scan)) {
    missing.push(
      `a row missing below rebuilt row ${
        scan.rebuilt.indexOf(gap.above) + 1
      } (${gap.frames.size} frames show one)`,
    );
  }
  if (scan.rebuilt.length && scan.rebuilt.length < rowsNeeded(scan))
    missing.push(
      `${
        rowsNeeded(scan) - scan.rebuilt.length
      } row(s) missing: frames showed the list in ${rowsNeeded(scan)} rows`,
    );
  if (!scan.rows.length) missing.push('no list yet');
  if (scan.rows.length && !scan.start) missing.push('list start not seen');
  if (scan.rows.length && !scan.end) missing.push('list end not seen');
  return missing;
}

/** The list as one comma-separated text, the way the analysis reads it. */
export function listText(rows: string[]): string {
  return normalizeListItems(joinLines(rows)).join(', ');
}
