/**
 * Guided high-resolution photos of one ingredient list, merged from exact OCR evidence only.
 *
 * Each photo is read on its own (ML Kit lines grouped into physical rows, the list section found in
 * it: ingredientScanner.readSection); the photos are merged afterwards:
 *
 *   - photos are placed on each other's rows by exact text shared (at least MIN_OVERLAP characters,
 *     case-insensitive) and by physical row order; a row that shares nothing exact is not merged;
 *   - every reading of every item is kept; where readings disagree, deterministically: a reading with
 *     its brackets whole, then the text read the same way by the most photos, then the reading nearer
 *     its photo's centre (sharper, not squeezed at a silhouette), then the longer one. Every differing
 *     reading of a row's edges is passed on, so one bad reading can't drop good ones (the server checks
 *     row boundaries against whole known words);
 *   - no ingredient name is guessed: a word no photo read whole ("Dibuty") stays as read.
 *
 * The merge is deterministic: the same photos give the same list whatever order they were taken in.
 */

export const MIN_OVERLAP = 8;
/** Characters two readings of one row may differ in length by up to where they are (OCR adds or drops letters). */
const DRIFT = 3;

export interface PhotoList {
  /** The photo's id (P1, P2, …). */
  name: string;
  /**
   * The real photo it was read from (sourcePhotoId; default: name). Readings of one photo (the whole
   * picture and its crop) are one observation: only the first of them given is merged.
   */
  source?: string;
  /** The list's physical rows as this photo read them (the first without its heading). */
  rows: string[];
  /** The photo shows the list's heading / its start / its end. */
  heading: boolean;
  start: boolean;
  end: boolean;
  /**
   * The photo's other physical rows next to its list section, nearest first. Taken only where they
   * share exact text with the list other photos read there (a turned tube's photo can cut its list
   * short at a row without a comma, "Dimethicone/Vinyl Dimethicone").
   */
  above?: string[];
  below?: string[];
  /**
   * Where each list row lies across the photo, as shares of its width (0 left edge, 1 right edge):
   * how central a reading is. Readings squeezed at the edge of a curved package are misread most.
   */
  spans?: [number, number][];
  aboveSpans?: [number, number][];
  belowSpans?: [number, number][];
  /**
   * Per list row: its start / end was physically cut in this photo (the row runs off the picture's edge,
   * or its edge word is squeezed at a curved package's silhouette), so the item there is only a piece.
   */
  cutStart?: boolean[];
  cutEnd?: boolean[];
  /** The same for the rows above / below the list section: [start cut, end cut]. */
  aboveCuts?: [boolean, boolean][];
  belowCuts?: [boolean, boolean][];
}

interface Reading {
  photo: string;
  text: string;
  /** Where on the physical row the reading starts (characters; the anchor photo's reading starts at 0). */
  start: number;
  /** Where the reading lies across its photo (shares of the width), when known. */
  span?: [number, number];
  /** Its first / last item was physically cut in the photo (PhotoList.cutStart / cutEnd). */
  cutStart?: boolean;
  cutEnd?: boolean;
}

interface Item {
  text: string;
  /** Followed by a comma in this reading. */
  closed: boolean;
  from: number;
  to: number;
  /** May be cut by the photo's edge (the reading's first/last item, the reading short of the row's edge). */
  cut: boolean;
  /** Which end of it may be cut: its start (the reading's first item) or its end (the last). */
  cutAtStart?: boolean;
  cutAtEnd?: boolean;
  photo: string;
  /** Distance of the item's middle from its photo's centre line (0 centre, 1 edge; 0.5 unknown). */
  offCentre: number;
}

export interface MergeLog {
  photo: string;
  /** Row offset the photo was placed at on the merged rows (null: nowhere). */
  offset: number | null;
  rows: { row: number; merged: number | null; overlap: number; note: string }[];
}

export interface MergedList {
  rows: string[];
  heading: boolean;
  start: boolean;
  end: boolean;
  /** Per merged row: every different reading of its first and last item (chosen first). */
  edges: { starts: string[]; ends: string[] }[];
  /**
   * Per merged row: some photo read its first (last) item whole there, not cut by the picture's edge or
   * a silhouette. An edge no photo saw whole needs another photo: no letters without pixels.
   */
  seen: { start: boolean; end: boolean }[];
  /** Per merged row: the readings it was merged from. */
  readings: { photo: string; text: string; start: number }[][];
  /** Items whose readings disagreed: what was chosen and what else was read. */
  choices: { row: number; chosen: string; readings: Record<string, number> }[];
  /** Photos that shared no exact text with the others (not used). */
  unplaced: string[];
  log: MergeLog[];
}

/** Longest exact (case-insensitive) common run of two texts and where it starts in each. */
export function exactRun(a: string, b: string): { length: number; inA: number; inB: number } {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  let best = { length: 0, inA: 0, inB: 0 };
  const row = new Array<number>(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i++) {
    let diagonal = 0;
    for (let j = 1; j <= y.length; j++) {
      const up = row[j];
      row[j] = x[i - 1] === y[j - 1] ? diagonal + 1 : 0;
      if (row[j] > best.length) best = { length: row[j], inA: i - row[j], inB: j - row[j] };
      diagonal = up;
    }
  }
  return best;
}

/** Opening and closing brackets balance ("(CI 77891" doesn't: OCR lost its ")"). */
export const balanced = (text: string) => (text.match(/[([]/g) ?? []).length === (text.match(/[)\]]/g) ?? []).length;

/** Items of a reading with their places on the row (commas inside brackets don't split). */
function items(reading: Reading, rowFrom: number, rowTo: number): Item[] {
  const out: Item[] = [];
  let depth = 0;
  let begin = 0;
  const text = reading.text;
  const offCentre = (at: number) => {
    if (!reading.span) return 0.5;
    const [left, right] = reading.span;
    const x = left + ((right - left) * at) / Math.max(1, text.length);
    return Math.min(1, Math.abs(x - 0.5) * 2);
  };
  const push = (end: number, closed: boolean) => {
    const raw = text.slice(begin, end);
    const lead = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (trimmed) {
      const from = begin + lead;
      out.push({
        text: trimmed,
        closed,
        from: reading.start + from,
        to: reading.start + from + trimmed.length,
        cut: false,
        photo: reading.photo,
        offCentre: offCentre(from + trimmed.length / 2),
      });
    }
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(' || c === '[') depth++;
    else if ((c === ')' || c === ']') && depth > 0) depth--;
    else if ((c === ',' || c === ';') && depth === 0) {
      push(i, true);
      begin = i + 1;
    }
  }
  push(text.length, false);
  if (out.length) {
    // The reading stops short of the row's edge: its item there may be cut by the photo's edge.
    // (Not an item a separator was read before / after: ", Ascorbyl Tetraisopalmitate," is whole.)
    if ((reading.start > rowFrom + DRIFT || reading.cutStart) && !/^\s*[,;]/.test(text)) out[0].cut = out[0].cutAtStart = true;
    if ((reading.start + text.length < rowTo - DRIFT || reading.cutEnd) && !out[out.length - 1].closed) out[out.length - 1].cut = out[out.length - 1].cutAtEnd = true;
  }
  return out;
}

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** One merged row from its readings: item by item, the best-supported real reading. */
function composeRow(readings: Reading[], row: number, choices: MergedList['choices']): { text: string; starts: string[]; ends: string[]; seen: { start: boolean; end: boolean } } {
  const from = Math.min(...readings.map(r => r.start));
  const to = Math.max(...readings.map(r => r.start + r.text.length));
  const all = readings
    .flatMap(r => items(r, from, to))
    .sort((a, b) => a.from - b.from || a.to - b.to || byText(a.text, b.text));
  // Items at the same place on the row (overlapping by more than half the shorter one) are readings of
  // one item. Items read whole are grouped first, and two whole items that don't overlap so are never
  // one slot: a reading joining two items ("Carbonate. Sucrose", a comma read as a period) mustn't make
  // one of them drop out.
  const overlap = (a: Item, b: Item) => Math.min(a.to, b.to) - Math.max(a.from, b.from);
  const same = (a: Item, b: Item) => overlap(a, b) > Math.min(a.to - a.from, b.to - b.from) / 2;
  const slots: Item[][] = [];
  for (const item of all.filter(i => !i.cut)) {
    const slot = slots.find(s => s.every(o => same(o, item)));
    if (slot) slot.push(item);
    else slots.push([item]);
  }
  const wholeSlots = slots.length;
  for (const item of all.filter(i => i.cut)) {
    const touched = slots.slice(0, wholeSlots).filter(s => s.some(o => overlap(o, item) > 1));
    if (touched.length) {
      // Cut by a photo's edge where other photos read whole items: those items are its text. Kept only
      // where it reaches past them, with the one item it lies on.
      const lo = Math.min(...touched.flat().map(o => o.from));
      const hi = Math.max(...touched.flat().map(o => o.to));
      // (A piece on one item stays with it: its reading can be the one with the item's brackets whole.)
      if (touched.length === 1) touched[0].push(item);
      else if (item.from < lo - DRIFT || item.to > hi + DRIFT) touched[0].push(item);
      continue;
    }
    const slot = slots.slice(wholeSlots).find(s => s.some(o => same(o, item)));
    if (slot) slot.push(item);
    else slots.push([item]);
  }
  const kept = slots.filter(slot => slot.length);
  kept.sort((a, b) => Math.min(...a.map(i => i.from)) - Math.min(...b.map(i => i.from)));
  const key = (i: Item) => `${i.text}${i.closed ? ',' : ''}`;
  const texts = kept.map(slot => {
    const whole = slot.filter(i => !i.cut);
    const pool = whole.length ? whole : slot;
    const votes = new Map<string, number>();
    const centre = new Map<string, number>();
    for (const i of pool) {
      votes.set(key(i), (votes.get(key(i)) ?? 0) + 1);
      centre.set(key(i), Math.min(centre.get(key(i)) ?? 1, i.offCentre));
    }
    let chosen: string;
    // A reading with an unclosed bracket is misread (it would swallow the rest of the list), so one with
    // its brackets whole comes first, even a piece covering the same place.
    const span = { from: Math.min(...slot.map(i => i.from)), to: Math.max(...slot.map(i => i.to)) };
    const covering = slot.filter(i => i.cut && i.from <= span.from + DRIFT && i.to >= span.to - DRIFT && balanced(key(i)));
    if (whole.length) {
      chosen = [...votes.keys()].sort(
        (a, b) =>
          Number(balanced(b)) - Number(balanced(a)) ||
          votes.get(b)! - votes.get(a)! ||
          centre.get(a)! - centre.get(b)! ||
          b.length - a.length ||
          byText(a, b),
      )[0];
      if (!balanced(chosen) && covering.length) chosen = key(covering[0]);
    } else {
      // Only pieces cut by photo edges: joined where they share an exact run (the start from the piece
      // reaching furthest left, the end from the one reaching furthest right), else the longest piece.
      const left = [...slot].sort((a, b) => a.from - b.from || b.to - a.to || byText(a.text, b.text))[0];
      const right = [...slot].sort((a, b) => b.to - a.to || a.from - b.from || byText(a.text, b.text))[0];
      const run = exactRun(left.text, right.text);
      chosen =
        left !== right && run.length >= MIN_OVERLAP
          ? `${left.text.slice(0, run.inA)}${right.text.slice(run.inB)}${right.closed ? ',' : ''}`
          : key([...slot].sort((a, b) => b.to - b.from - (a.to - a.from) || a.offCentre - b.offCentre || byText(a.text, b.text))[0]);
    }
    if (votes.size > 1) choices.push({ row, chosen, readings: Object.fromEntries(votes) });
    return chosen;
  });
  // Every item any photo read at the row's edge (whatever slot it went to): each is a real reading of
  // that edge, and the server checks each against whole known words.
  const edge = (chosen: string, side: 'start' | 'end') => {
    const reaching = all.filter(i => (side === 'start' ? i.from <= from + DRIFT : i.to >= to - DRIFT));
    const votes = new Map<string, number>();
    for (const i of reaching) votes.set(key(i), (votes.get(key(i)) ?? 0) + 1);
    const ranked = [...votes].sort((a, b) => b[1] - a[1] || byText(a[0], b[0])).map(([text]) => text);
    return [...new Set([chosen, ...ranked])].slice(0, 6);
  };
  const text = texts.map((t, i) => (i < texts.length - 1 && !t.endsWith(',') ? `${t},` : t)).join(' ');
  // The row's edges as seen: an item reaching the edge that no photo cut there (or, at the end, one read
  // with its closing separator).
  const seen = {
    start: all.some(i => i.from <= from + DRIFT && !i.cutAtStart),
    end: all.some(i => i.to >= to - DRIFT && (!i.cutAtEnd || i.closed)),
  };
  return { text, starts: edge(texts[0], 'start'), ends: edge(texts[texts.length - 1], 'end'), seen };
}

/**
 * Where a text sits on a merged row: the alignment with the row's readings sharing a run of at least
 * MIN_OVERLAP exact characters and, along it, the most exactly equal characters in all. Text repeated
 * within a row ("Iron Oxide … Iron Oxide") gives two alignments; the one the rest of the text agrees
 * with wins, and two equally good ones place nothing.
 */
export function placeOn(readings: Reading[], text: string): { start: number; overlap: number; matches: number } | null {
  const y = text.toLowerCase();
  const byStart = new Map<number, { matches: number; run: number }>();
  for (const r of readings) {
    const x = r.text.toLowerCase();
    // Diagonal d: text[j] against reading[j + d]. Per diagonal, its exact runs of 3 or more characters
    // (single letters that happen to match along a misplaced overlap don't count) and the longest.
    const diagonals = new Map<number, { runs: [number, number][]; longest: number }>();
    for (let d = -(y.length - 1); d < x.length; d++) {
      const runs: [number, number][] = [];
      let run = 0;
      let longest = 0;
      for (let j = Math.max(0, -d); j <= y.length && j + d <= x.length; j++) {
        if (j < y.length && j + d < x.length && x[j + d] === y[j]) {
          longest = Math.max(longest, ++run);
        } else {
          if (run >= 3) runs.push([j - run, j]);
          run = 0;
        }
      }
      diagonals.set(d, { runs, longest });
    }
    for (const [d, { longest }] of diagonals) {
      if (longest < MIN_OVERLAP) continue;
      // Characters of the text read the same at this place, allowing for letters OCR dropped or added
      // before them (runs on the diagonals within 2): a word repeated within the row ("Iron Oxide …
      // Mica, Iron Oxide") matches as long at the wrong place, but only the right one goes on matching.
      const covered = new Array<boolean>(y.length).fill(false);
      for (let near = d - 2; near <= d + 2; near++) for (const [from, to] of diagonals.get(near)?.runs ?? []) for (let j = from; j < to; j++) covered[j] = true;
      const matches = covered.filter(Boolean).length;
      const start = r.start + d;
      // The best single reading at this place (summed over readings, a word repeated in the row and
      // read by several photos would outweigh the right place).
      const seen = byStart.get(start) ?? { matches: 0, run: 0 };
      byStart.set(start, { matches: Math.max(seen.matches, matches), run: Math.max(seen.run, longest) });
    }
  }
  const ranked = [...byStart].sort((a, b) => b[1].matches - a[1].matches || a[0] - b[0]);
  if (!ranked.length) return null;
  const [start, best] = ranked[0];
  if (ranked.some(([s, v]) => Math.abs(s - start) > DRIFT && v.matches === best.matches)) return null;
  return { start, overlap: best.run, matches: best.matches };
}

/**
 * The photo turned upright from ML Kit's corner points: a photo held sideways or upside down reads as
 * text running down, up or right to left (line boxes in the picture's own coordinates).
 */
export function uprightFrame<L extends { left: number; top: number; width: number; height: number; corners?: [number, number][] }>(frame: {
  width: number;
  height: number;
  lines: L[];
}): { width: number; height: number; lines: L[]; turned: 0 | 90 | 180 | 270 } {
  let dx = 0;
  let dy = 0;
  for (const l of frame.lines) {
    if (!l.corners || l.corners.length < 2) continue;
    dx += l.corners[1][0] - l.corners[0][0];
    dy += l.corners[1][1] - l.corners[0][1];
  }
  const W = frame.width;
  const H = frame.height;
  // Reading direction right: as is; down: turn 90° (x' = y, y' = W - x); up: x' = H - y, y' = x; left: 180°.
  const turned: 0 | 90 | 180 | 270 = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 0 : 180) : dy > 0 ? 90 : 270;
  if (turned === 0) return { ...frame, turned };
  const map = ([x, y]: [number, number]): [number, number] => (turned === 90 ? [y, W - x] : turned === 270 ? [H - y, x] : [W - x, H - y]);
  const lines = frame.lines.map(l => {
    const corners = (
      l.corners ?? [
        [l.left, l.top],
        [l.left + l.width, l.top],
        [l.left + l.width, l.top + l.height],
        [l.left, l.top + l.height],
      ]
    ).map(map);
    const xs = corners.map(c => c[0]);
    const ys = corners.map(c => c[1]);
    return { ...l, left: Math.min(...xs), top: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys), corners };
  });
  return turned === 180 ? { width: W, height: H, lines, turned } : { width: H, height: W, lines, turned };
}

/**
 * Canonical order: the photo with the heading first, then those showing more rows, then by text. The
 * first is the anchor the others are placed on; the result doesn't depend on the order taken.
 */
const canonical = (a: PhotoList, b: PhotoList) =>
  Number(b.heading) - Number(a.heading) ||
  Number(b.start && b.end) - Number(a.start && a.end) ||
  b.rows.length - a.rows.length ||
  byText(a.rows.join('\n'), b.rows.join('\n')) ||
  byText(a.name, b.name);

export function mergePhotos(photos: PhotoList[]): MergedList | null {
  // One observation per real photo: a second reading of the same photo (its crop) is not independent
  // evidence ("paraffin" in one pass and "liquidium" in another never make "paraffinum liquidum").
  const sources = new Set<string>();
  const observed = photos.filter(p => {
    const source = p.source ?? p.name;
    if (sources.has(source)) return false;
    sources.add(source);
    return true;
  });
  const order = observed.filter(p => p.rows.length).sort(canonical);
  if (!order.length) return null;
  const [anchor, ...rest] = order;
  const rowReading = (photo: PhotoList, i: number, start: number): Reading => ({ photo: photo.name, text: photo.rows[i], start, span: photo.spans?.[i], cutStart: photo.cutStart?.[i], cutEnd: photo.cutEnd?.[i] });
  const rows: Reading[][] = anchor.rows.map((_, i) => [rowReading(anchor, i, 0)]);
  const log: MergeLog[] = [{ photo: anchor.name, offset: 0, rows: anchor.rows.map((_, i) => ({ row: i, merged: i, overlap: 0, note: 'anchor' })) }];
  const unplaced: string[] = [];
  let heading = anchor.heading;
  let start = anchor.start || anchor.heading;
  let end = anchor.end;
  /** Where each placed photo's first list row is on the merged rows. */
  const offsets = new Map<PhotoList, number>([[anchor, 0]]);

  /** Places a photo on the merged rows; false when it shares no exact text with them yet. */
  const placePhoto = (photo: PhotoList): boolean => {
    // The one row offset where the photo's rows share the most exact text with the merged rows (at least
    // two rows placed, or its only row). Counting characters, not rows: a short word shared by chance
    // (", benzyl ") mustn't tie with rows that share whole items.
    const n = photo.rows.length;
    const candidates = Array.from({ length: rows.length + n - 1 }, (_, k) => k - (n - 1)).map(offset => {
      const places = photo.rows.map((text, i) => (rows[offset + i] ? placeOn(rows[offset + i], text) : null));
      return {
        offset,
        placed: places.filter(Boolean).length,
        matches: places.reduce((sum, p) => sum + (p?.matches ?? 0), 0),
      };
    });
    const eligible = candidates.filter(c => c.placed >= Math.min(2, n)).sort((a, b) => b.matches - a.matches || a.offset - b.offset);
    const best = eligible[0];
    const offset = best && !(eligible[1] && eligible[1].matches === best.matches) ? best.offset : null;
    if (offset === null) return false;
    const entry: MergeLog = { photo: photo.name, offset, rows: [] };
    log.push(entry);
    const placed = new Set<number>();
    photo.rows.forEach((text, i) => {
      const r = offset + i;
      if (!rows[r]) return;
      const place = placeOn(rows[r], text);
      if (place) {
        rows[r].push(rowReading(photo, i, place.start));
        placed.add(i);
      }
      entry.rows.push({ row: i, merged: r, overlap: place?.overlap ?? 0, note: place ? 'merged' : `no ${MIN_OVERLAP}-character exact overlap: not merged` });
    });
    // Rows beyond the merged ones, by physical row order: below a placed row, or above one (never above
    // the heading row: what is above the heading isn't the list).
    for (let i = 0; i < n; i++) {
      const r = offset + i;
      if (r >= rows.length && placed.has(i - 1)) {
        rows.push([rowReading(photo, i, 0)]);
        placed.add(i);
        entry.rows.push({ row: i, merged: rows.length - 1, overlap: 0, note: 'new row below (row order)' });
      }
    }
    let added = 0;
    for (let i = -offset - 1; i >= 0; i--) {
      if (heading || !placed.has(i + 1)) break;
      rows.unshift([rowReading(photo, i, 0)]);
      placed.add(i);
      added++;
      entry.rows.push({ row: i, merged: 0, overlap: 0, note: 'new row above (row order)' });
    }
    if (added) {
      for (const e of log) for (const row of e.rows) if (row.merged !== null && e !== entry) row.merged += added;
      for (const [p, o] of offsets) offsets.set(p, o + added);
    }
    offsets.set(photo, offset + added);
    heading ||= photo.heading && offset + added === 0;
    start ||= (photo.start || photo.heading) && offset + added === 0;
    end ||= photo.end && offset + n - 1 + added === rows.length - 1;
    return true;
  };
  // In canonical order, again and again while photos get placed: a photo can share text only with rows
  // a photo after it adds (the centre photo between a left and a right one).
  let pending = rest;
  for (let progress = true; progress && pending.length; ) {
    const left = pending.filter(photo => !placePhoto(photo));
    progress = left.length < pending.length;
    pending = left;
  }
  for (const photo of pending) {
    unplaced.push(photo.name);
    log.push({ photo: photo.name, offset: null, rows: photo.rows.map((_, i) => ({ row: i, merged: null, overlap: 0, note: `photo not placed: no single best row offset with ${MIN_OVERLAP}+ exact characters shared` })) });
  }

  // Each photo's rows next to its list section, where they share exact text with the merged rows there
  // (contiguous, nearest first; never beyond the merged rows). Repeated until nothing more is placed: a
  // row one photo placed can be what another photo's row overlaps with.
  const reached = new Map<PhotoList, { above: number; below: number }>();
  for (let more = true; more; ) {
    more = false;
    for (const photo of order) {
      const offset = offsets.get(photo);
      if (offset === undefined) continue;
      const entry = log.find(e => e.photo === photo.name)!;
      const done = reached.get(photo) ?? { above: 0, below: 0 };
      reached.set(photo, done);
      const extend = (texts: string[] | undefined, spans: [number, number][] | undefined, cuts: [boolean, boolean][] | undefined, side: 'above' | 'below') => {
        for (let k = done[side]; k < (texts?.length ?? 0); k++) {
          const r = side === 'above' ? offset - 1 - k : offset + photo.rows.length + k;
          if (!rows[r]) return;
          const place = placeOn(rows[r], texts![k]);
          if (!place) return;
          rows[r].push({ photo: photo.name, text: texts![k], start: place.start, span: spans?.[k], cutStart: cuts?.[k]?.[0], cutEnd: cuts?.[k]?.[1] });
          entry.rows.push({ row: -1, merged: r, overlap: place.overlap, note: `row ${side} its list section, merged by exact overlap ${place.overlap}` });
          done[side] = k + 1;
          more = true;
        }
      };
      extend(photo.above, photo.aboveSpans, photo.aboveCuts, 'above');
      extend(photo.below, photo.belowSpans, photo.belowCuts, 'below');
    }
  }

  // The heading row starts where the photo that read the heading says the list starts: other photos'
  // readings reaching further left read (a misread) heading.
  if (heading) {
    rows[0] = rows[0].map(r => (r.start < -DRIFT ? { ...r, text: r.text.slice(-r.start).trimStart(), start: 0 } : r)).filter(r => r.text);
  }

  const choices: MergedList['choices'] = [];
  const composed = rows.map((readings, r) => composeRow(readings, r, choices));
  return {
    rows: composed.map(c => c.text),
    heading,
    start,
    end,
    edges: composed.map(c => ({ starts: c.starts, ends: c.ends })),
    seen: composed.map(c => c.seen),
    readings: rows.map(readings => readings.map(({ photo, text, start: at }) => ({ photo, text, start: at }))),
    choices,
    unplaced,
    log,
  };
}
