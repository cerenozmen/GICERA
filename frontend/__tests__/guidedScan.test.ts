import {
  blockerRegion,
  deviceCompleteness,
  leftOpen,
  nextSide,
  photoEvidence,
  PhotoReading,
  promptForNeeds,
  promptHeadline,
  promptText,
  readPhoto,
  reconstruct,
  serverNeeds,
  unbalancedRow,
} from '../src/guidedScan';
import { ScanFrame, ScanLine } from '../src/ingredientScanner';
import { mergePhotos, PhotoList } from '../src/photoMerge';

/** A synthetic photo: rows of text 60 px apart, 12 px per character, starting at (x, y). */
function photo(rows: string[], { x = 600, y = 1500, width = 3060, height = 4080, confidence = 0.72 } = {}): ScanFrame {
  const lines: (ScanLine & { confidence: number })[] = rows.map((text, i) => ({ text, left: x, top: y + i * 60, width: text.length * 12, height: 45, confidence }));
  return { lines, width, height };
}

/** A photo's list for the merge, read as it was taken (rows, and the list's start/end). */
const list = (name: string, rows: string[], options: { heading?: boolean; start?: boolean; end?: boolean } = {}): PhotoList => {
  const heading = options.heading ?? false;
  return { name, rows, heading, start: options.start ?? heading, end: options.end ?? false };
};

/** Real high-resolution photos taken with the POC capture (Sept 2026): OCR lines with their boxes. */
function capture(name: string): { product: string; photos: ScanFrame[] } {
  const log = require(`./fixtures/${name}.json`);
  return { product: log.product, photos: log.photos.map((p: { width: number; height: number; lines: ScanLine[] }) => ({ width: p.width, height: p.height, lines: p.lines })) };
}
const readAll = (frames: ScanFrame[]): PhotoReading[] => frames.map((frame, i) => readPhoto(frame, `P${i + 1}`));

const FLAT = [
  'Ingredients: Aqua, Glycerin, Isopropyl Palmitate, Glyceryl',
  'Stearate, Paraffinum Liquidum, Sorbitol, Cetearyl Alcohol,',
  'Cetyl Alcohol, Stearic Acid, Phenoxyethanol, Tocopheryl',
  'Acetate, Parfum, Citric Acid.',
  'Made in Turkey. Keep out of reach of children.',
];

describe('one photo of a flat label', () => {
  it('is a candidate at once: start, end, nothing missing (no second photo)', () => {
    const reading = readPhoto(photo(FLAT), 'P1');
    expect(reading.quality.problem).toBeNull();
    const rec = reconstruct([reading]);
    expect(rec.completeness).toEqual({ status: 'CANDIDATE', needs: [] });
    expect(rec.candidate?.readings[0].rows).toHaveLength(4);
    expect(rec.candidate?.ingredientsText).toMatch(/^Aqua, Glycerin, .*Citric Acid$/);
  });

  it('a real flat photo (POC capture) is a candidate from one photo', () => {
    const { photos } = capture('guided-flat-90592');
    const rec = reconstruct(readAll(photos));
    expect(rec.completeness.status).toBe('CANDIDATE');
    expect(rec.merged?.rows.length).toBe(10);
  });
});

describe('photo quality: unusable photos are taken again, good ones are not turned away', () => {
  it('no text / no list', () => {
    expect(readPhoto(photo(['12']), 'P1').quality.problem).toBe('no_text');
    expect(readPhoto(photo(['Sudocrem soothes and protects the skin of babies', 'Apply a thin layer as required', 'Keep out of reach of children']), 'P1').quality.problem).toBe('no_list');
  });
  it('blurred: low OCR confidence on the list', () => {
    expect(readPhoto(photo(FLAT, { confidence: 0.3 }), 'P1').quality.problem).toBe('blurry');
    expect(readPhoto(photo(FLAT, { confidence: 0.6 }), 'P1').quality.problem).toBeNull();
  });
  it('a close-up whose rows run off the picture is kept (its cut row edges are asked for, not the photo retaken)', () => {
    const reading = readPhoto(photo(FLAT, { x: 10 }), 'P1');
    expect(reading.quality.problem).toBeNull();
    expect(reading.list?.cutStart?.every(Boolean)).toBe(true);
  });
  it('accepts every real POC photo that shows the list', () => {
    for (const name of ['guided-flat-90592', 'guided-tube-02247', 'guided-round-17399']) {
      for (const reading of readAll(capture(name).photos)) expect(reading.quality.problem).toBeNull();
    }
  });
});

describe('brackets: an opening bracket whose ")" OCR lost', () => {
  it('makes the list INCOMPLETE (it would silently drop every item after it)', () => {
    const rows = ['Aqua, Titanium Dioxide (CI 77891, Glycerin,', 'Butylene Glycol, Mica, Sucrose, Cellulose Gum, Tocopherol.'];
    const merged = mergePhotos([list('P1', rows, { heading: true, end: true })]);
    const completeness = deviceCompleteness(merged);
    expect(completeness.status).toBe('INCOMPLETE');
    expect(completeness.needs).toEqual([{ need: 'brackets', row: 0 }]);
    expect(unbalancedRow(rows)).toBe(0);
  });
  it('a stray ")" (an l misread) opens nothing: not a gap', () => {
    expect(leftOpen('Cetyl Alcoho), Stearic Acid')).toBe(false);
    expect(leftOpen('Titanium Dioxide (CI 77891), Mica')).toBe(false);
    expect(leftOpen('Titanium Dioxide (CI 77891, Mica')).toBe(true);
  });
  it('never sends an item with an open bracket as evidence', () => {
    const evidence = photoEvidence([list('P1', ['Aqua, Titanium Dioxide (CI 77891, Glycerin, Mica,'], { heading: true })]);
    expect(evidence.flat()).not.toContainEqual(expect.stringContaining('('));
  });
});

describe('merging photos: exact evidence only', () => {
  // A tube's rows seen through three windows (centre, turned left, turned right).
  const CENTRE = ['ua, Glycerin, Cetearyl Alcohol, Phenoxy', 'yl Adipate, Dimethicone, Cellulose Gum, Toco'];
  const LEFT = ['Aqua, Glycerin, Cetearyl Alcohol,', 'Dibutyl Adipate, Dimethicone, Cellu'];
  const RIGHT = ['Cetearyl Alcohol, Phenoxyethanol, Dimethicone,', 'Cellulose Gum, Tocopherol.'];

  it('joins pieces of one physical row where they overlap exactly', () => {
    const merged = mergePhotos([list('C', CENTRE), list('L', LEFT, { heading: true }), list('R', RIGHT, { end: true })])!;
    expect(merged.rows).toEqual(['Aqua, Glycerin, Cetearyl Alcohol, Phenoxyethanol, Dimethicone,', 'Dibutyl Adipate, Dimethicone, Cellulose Gum, Tocopherol.']);
    expect(merged.start && merged.end).toBe(true);
  });

  it('gives the same list whatever order the photos were taken in', () => {
    const a = mergePhotos([list('C', CENTRE), list('L', LEFT, { heading: true }), list('R', RIGHT, { end: true })])!;
    const b = mergePhotos([list('R', RIGHT, { end: true }), list('C', CENTRE), list('L', LEFT, { heading: true })])!;
    expect(b.rows).toEqual(a.rows);
  });

  it('never completes a word no photo read whole ("Dibuty" stays "Dibuty")', () => {
    const merged = mergePhotos([list('A', ['Isostearate, Dibuty'], { heading: true }), list('B', ['Polyglyceryl-4 Isostearate, Dibuty'])])!;
    expect(merged.rows[0]).toMatch(/Dibuty$/);
    expect(merged.rows.join(' ')).not.toMatch(/Dibutyl/);
  });

  it('uses "Dibutyl" when another photo really read it', () => {
    const merged = mergePhotos([list('A', ['Polyglyceryl-4 Isostearate, Dibuty'], { heading: true }), list('B', ['yceryl-4 Isostearate, Dibutyl Adipate,'])])!;
    expect(merged.rows[0]).toMatch(/Dibutyl Adipate,$/);
  });

  it('keeps the reading two photos agree on over one misreading ("Cellulose Gum" ×2 vs "Cellulose Gurn")', () => {
    const merged = mergePhotos([
      list('P1', ['Sucrose, Cellulose Gurn, Tocopherol, Mica'], { heading: true }),
      list('P2', ['Sucrose, Cellulose Gum, Tocopherol, Mica']),
      list('P3', ['Sucrose, Cellulose Gum, Tocopherol, Mica']),
    ])!;
    expect(merged.rows[0]).toContain('Cellulose Gum,');
    expect(merged.choices[0].readings).toEqual({ 'Cellulose Gum,': 2, 'Cellulose Gurn,': 1 });
  });

  it('between equally supported readings, takes the one nearer its photo\'s centre', () => {
    const edge: PhotoList = { ...list('P1', ['Aqua, Glycerin, Phenoxvethanol, Mica, Sucrose'], { heading: true }), spans: [[0.5, 0.98]] };
    const central: PhotoList = { ...list('P2', ['Aqua, Glycerin, Phenoxyethanol, Mica, Sucrose']), spans: [[0.2, 0.8]] };
    expect(mergePhotos([edge, central])!.rows[0]).toContain('Phenoxyethanol');
    expect(mergePhotos([central, edge])!.rows[0]).toContain('Phenoxyethanol');
  });

  it('places a row whose word repeats ("Iron Oxide … Iron Oxide") where the rest of it agrees', () => {
    const merged = mergePhotos([
      list('L', ['Stearalkonium Hectorite, Iron Oxide Cl 77491', 'Mica, Sucrose, Tocopherol.'], { heading: true }),
      list('C', ['alkonium Hectorite, Iron Oxide Cl 77491, ,Mica, Iron 0', 'Mica, Sucrose, Tocopherol.']),
      list('R', ['ie Cl 77491, Mica, Iron Oxide', 'Mica, Sucrose, Tocopherol.'], { end: true }),
    ])!;
    expect(merged.log.find(e => e.photo === 'R')!.rows[0].note).toBe('merged');
    expect(merged.edges[0].ends).toContain('Iron Oxide');
  });

  it('a short word shared by chance (", benzyl ") does not place a photo on the wrong rows', () => {
    // Sudocrem's round lid (real photos, 17399): the left photo shares ", paraffin" and ", benzyl "
    // with the rows above; its whole items sit one row lower.
    const { photos } = capture('guided-round-17399');
    const merged = reconstruct(readAll(photos)).merged!;
    expect(merged.unplaced).toEqual([]);
  });
});

describe('what to ask for next', () => {
  it('a real tube photo from the centre: incomplete, and asks for a side', () => {
    const { photos } = capture('guided-tube-02247');
    const rec = reconstruct(readAll([photos[0]]));
    expect(rec.completeness.status).toBe('INCOMPLETE');
    const prompt = promptForNeeds(rec.completeness.needs, [], rec.merged);
    expect(prompt?.kind).toBe('more');
    expect(promptHeadline(prompt!)).toBe('İçerik listesinin tamamı okunamadı.');
  });

  it('the same tube from three angles: a candidate for the server', () => {
    const { photos } = capture('guided-tube-02247');
    expect(reconstruct(readAll(photos)).completeness.status).toBe('CANDIDATE');
  });

  it('the side with more missing first; on a tie the other side than last time', () => {
    expect(nextSide([{ need: 'start' }, { need: 'left', row: 3 }, { need: 'end' }], [])).toBe('left');
    expect(nextSide([{ need: 'right', row: 1 }, { need: 'right', row: 4 }, { need: 'start' }], [])).toBe('right');
    expect(nextSide([{ need: 'start' }, { need: 'end' }], ['left'])).toBe('right');
    expect(nextSide([{ need: 'end' }], [])).toBe('end');
  });

  it("reads the server's unverified boundaries as sides", () => {
    expect(
      serverNeeds([
        { kind: 'break', row: 2, reason: 'row ends in a piece of a word: "Dibuty"' },
        { kind: 'break', row: 4, reason: 'next row starts with a piece of a word: "ydrate"' },
        { kind: 'brackets', row: 1, reason: 'unbalanced parentheses' },
      ]),
    ).toEqual([
      { need: 'right', row: 2 },
      { need: 'left', row: 5 },
      { need: 'brackets', row: 1 },
    ]);
  });

  it('never names technical steps or ingredients to the user', () => {
    for (const side of ['left', 'right', 'start', 'end'] as const) expect(promptText({ kind: 'more', side })).not.toMatch(/LEFT|RIGHT|CENTER/);
    expect(promptText({ kind: 'targeted', region: 'listenin sol üst kısmı' })).toBe('Bu bölümü biraz daha yakından ve ortalayarak çekin: listenin sol üst kısmı.');
  });
});

describe('analysis blocked by misread names: one targeted photo', () => {
  const merged = mergePhotos([
    list('P1', ['Aqua, Glycerin, Phenoxvethanol,', 'Mica, Sucrose, Cellulose Gum,', 'Magnesium Sulfate Heptahydrate, Tocopherol.'], { heading: true, end: true }),
  ])!;

  it('asks for the region of a name OCR visibly misread', () => {
    const region = blockerRegion([{ text: 'Phenoxvethanol', status: 'unknown', ocrSuspect: true }], merged);
    expect(region).toBe('listenin sağ üst kısmı');
  });

  it('not for a name read right that the dictionary lacks (not the scanner\'s to fix)', () => {
    expect(blockerRegion([{ text: 'Magnesium Sulfate Heptahydrate', status: 'unknown', ocrSuspect: false }], merged)).toBeUndefined();
  });
});
