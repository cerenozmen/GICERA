import { addFrame, candidates, createScan, readSection, rebuiltList, ScanFrame, ScanLine, settled } from '../src/ingredientScanner';

// Real frames recorded on the device (Sept 2026): OCR lines with their boxes, no images.
// Tube: live-scan snapshots of a cosmetic tube (16 text rows, the last "Tocopherol."), rows cut by the
// tube's silhouette on both sides in every frame.
const tube1658: { frames: ScanFrame[] } = require('./fixtures/scan-tube-1658.json');
const tube1652: { frames: ScanFrame[] } = require('./fixtures/scan-tube-1652.json');
// Sunscreen cream (Oct 2026): a long list; one snapshot misread a mid-list comma as a final period.
const sunscreenFalseEnd: { frames: ScanFrame[] } = require('./fixtures/scan-sunscreen-false-end.json');

/** A photo log of the old single-photo flow (4080x3060, portrait): blocks of [text, confidence, box]. */
function photo(name: string): ScanFrame {
  const raw: [string, number, number[] | null][][] = require(`./fixtures/${name}.json`).raw;
  const lines = raw.flat().flatMap(([text, , box]) => (box ? [{ text, left: box[0], top: box[1], width: box[2], height: box[3] }] : []));
  return { width: 3060, height: 4080, lines };
}

/** A synthetic frame: rows of text 40 px apart, 10 px per character, starting at (x, y). */
function frame(rows: string[], { x = 100, y = 300, width = 1080, height = 2340 } = {}): ScanFrame {
  const lines: ScanLine[] = rows.map((text, i) => ({ text, left: x, top: y + i * 40, width: text.length * 10, height: 30 }));
  return { lines, width, height };
}

const LABEL = [
  'Ingredients: Aqua, Glycerin, Isopropyl Palmitate, Glyceryl',
  'Stearate, Paraffinum Liquidum, Sorbitol, Cetearyl Alcohol,',
  'Cetyl Alcohol, Stearic Acid, Phenoxyethanol, Tocopheryl',
  'Acetate, Parfum, Citric Acid.',
];

describe('FULL_FRAME: one frame showing the whole list', () => {
  it('takes a flat label with heading, closing period and text below as whole', () => {
    const { section } = readSection(frame([...LABEL, 'Made in Turkey. Keep out of reach of children.']));
    expect(section?.whole).toBe(true);
    expect(section?.rows[0]).toBe('Aqua, Glycerin, Isopropyl Palmitate, Glyceryl');
    expect(section?.rows).toHaveLength(4);
  });

  it('does not need the heading: text above whose sentence ended, and capitalised names', () => {
    const { section } = readSection(frame(['Apply to clean skin.', ...LABEL.slice(1)].map((t, i) => (i === 1 ? t : t))));
    expect(section?.heading).toBe(false);
    expect(section?.start).toBe('text_above');
    const alone = readSection(frame(LABEL.slice(1))).section;
    expect(alone?.start).toBeNull(); // nothing shows where the list starts
    expect(alone?.whole).toBe(false);
  });

  it('is not whole when the list runs off the picture', () => {
    const cut = readSection(frame(LABEL.slice(0, 3), { y: 2230 })).section; // bottom rows below the picture
    expect(cut?.whole).toBe(false);
    const side = readSection(frame(LABEL, { x: 5 })).section; // rows touching the left edge
    expect(side?.cropped).toContain('left');
    expect(side?.whole).toBe(false);
  });

  it('reads a real blush photo whole, ending at the closing period, not in the address beside it', () => {
    const { section } = readSection(photo('photo-blush'));
    expect(section?.whole).toBe(true);
    expect(section?.rows[section.rows.length - 1]).toMatch(/77891\. \(LO519\)$/);
    expect(section?.rows.join(' ')).not.toMatch(/MARKWINS|recycling/i);
  });

  it('does not take a real blush photo whose first ingredient went unread (": ,MICA") as whole', () => {
    const { section } = readSection(photo('photo-blush-talc-lost'));
    expect(section?.emptyItems).toBe(1);
    expect(section?.whole).toBe(false);
  });

  it('reads a real cream photo whole and offers it as a full-frame candidate', () => {
    const scan = createScan();
    const report = addFrame(scan, readSection(photo('photo-cream')));
    expect(report.wholeList).not.toBeNull();
    expect(candidates(scan).map((c) => c.path)).toContain('full_frame');
  });

  it('groups whole readings of the same list from several frames (row boundaries checked across them)', () => {
    const scan = createScan();
    addFrame(scan, readSection(frame([...LABEL, 'Made in Turkey.'])));
    addFrame(scan, readSection(frame([...LABEL.slice(0, 2), LABEL[2].replace('Tocopheryl', 'Tocophery1'), LABEL[3], 'Made in Turkey.'])));
    const [full] = candidates(scan);
    expect(full.path).toBe('full_frame');
    expect(full.readings).toHaveLength(2);
  });
});

describe('MULTI_VIEW: the list rebuilt from views that each show part of it', () => {
  // A label wrapped around a cylinder: each view shows a window of every row.
  const view = (from: number, to: number) => frame(['Apply to clean skin.', ...LABEL, 'Made in Turkey.'].map((row) => row.slice(from, to).trim()));

  it('joins overlapping slices exactly into the whole rows', () => {
    const scan = createScan();
    addFrame(scan, readSection(view(0, 40)));
    // Start and end seen, rows cut on the right: offered, and the server's boundary check refuses
    // it ("Isopropyl P" is a piece of a word; backend listBoundaries.test.ts).
    expect(rebuiltList(scan)?.rows[0]).toBe('Aqua, Glycerin, Isopropyl P');
    addFrame(scan, readSection(view(20, 80)));
    expect(rebuiltList(scan)?.rows).toEqual([LABEL[0].replace('Ingredients: ', ''), ...LABEL.slice(1)]);
    // The first view also looked whole on its own (heading, period, text below): its cut words are
    // what the server refuses it for.
    expect(candidates(scan).map((c) => c.path)).toEqual(['full_frame', 'multi_view']);
  });

  it('never joins slices that do not overlap by 8 identical characters', () => {
    const scan = createScan();
    addFrame(scan, readSection(view(0, 30)));
    const before = [...scan.rows];
    const report = addFrame(scan, readSection(view(36, 80)));
    expect(report.verdict).toBe('unplaced');
    expect(scan.rows).toEqual(before);
  });

  it('does not take a cut row under the list for other text ("tric Acid." under "…Tocopheryl")', () => {
    const { section } = readSection(view(20, 80));
    expect(section?.rows[section.rows.length - 1]).toBe('ric Acid.');
  });

  it('starts over from the current view when view after view fits nowhere on what was rebuilt', () => {
    const scan = createScan();
    addFrame(scan, readSection(frame(['Aqua, Talc, Mica, Silica, Zinc Oxide,', 'Iron Oxides, Parfum, Linalool.'])));
    const other = readSection(frame([...LABEL, 'Made in Turkey.']));
    const verdicts = [1, 2, 3, 4].map(() => addFrame(scan, other).verdict);
    expect(verdicts).toEqual(['unplaced', 'unplaced', 'unplaced', 'restarted']);
    expect(scan.rows[0]).toMatch(/^Aqua, Glycerin/);
  });

  it('joins pieces seen in any order, and a misread row end does not stop the row from growing', () => {
    const scan = createScan();
    // Right part first, then the left, then a view whose row 1 ends misread at the silhouette.
    addFrame(scan, readSection(view(0, 45)));
    addFrame(scan, readSection(view(0, 45).lines.length ? { ...view(0, 45), lines: view(0, 45).lines.map(l => ({ ...l, text: l.text.replace('Isopropyl Palmitate, Glyc', 'Isopropyl Palmitate, Gxz') })) } : view(0, 45)));
    addFrame(scan, readSection(view(25, 90)));
    expect(scan.rows[0]).toBe('Aqua, Glycerin, Isopropyl Palmitate, Glyceryl');
  });

  it('does not use an OCR line that runs across two rows (arced text on a round jar)', () => {
    const scan = createScan();
    addFrame(scan, readSection(frame([...LABEL, 'Made in Turkey.'])));
    const before = [...scan.rows];
    // Row 1's start run into row 3's end, as ML Kit read a jar's arcs.
    const mixed = readSection(frame(['Ingredients: Aqua, Glycerin, Isopropyl Stearic Acid, Phenoxyethanol, Tocopheryl', LABEL[1], LABEL[3], 'Made in Turkey.']));
    const report = addFrame(scan, mixed);
    expect(report.mixed).toBe(1);
    expect(scan.rows).toEqual(before);
  });

  it('starts the list at its heading: rows read above it are other text, and none are added above it', () => {
    const scan = createScan();
    addFrame(scan, readSection(frame(['Keep in a cool, dry place, Away from sunlight,', ...LABEL.map(r => r.replace('Ingredients: ', '')), 'Made in Turkey.'])));
    expect(scan.rows[0]).toMatch(/^Keep in a cool/);
    addFrame(scan, readSection(frame(['Keep in a cool, dry place, Away from sunlight,', ...LABEL, 'Made in Turkey.'])));
    expect(scan.rows[0]).toBe('Aqua, Glycerin, Isopropyl Palmitate, Glyceryl');
    expect(scan.start).toBe('heading');
    addFrame(scan, readSection(frame(['Keep in a cool, dry place, Away from sunlight,', ...LABEL.map(r => r.replace('Ingredients: ', '')), 'Made in Turkey.'])));
    expect(scan.rows[0]).toBe('Aqua, Glycerin, Isopropyl Palmitate, Glyceryl');
  });
});

describe('where a list starts and ends in one frame', () => {
  it('finds a heading after a sentence on its row ("…chapped skin. Ingredients: Aqua, paraffin, …")', () => {
    const { section } = readSection(frame(['Soothes dry and chapped skin. Ingredients: Aqua, paraffin,', 'ozokerite, sorbitan sesquioleate, parfum.', 'Made in Ireland.']));
    expect(section?.heading).toBe(true);
    expect(section?.rows[0]).toBe('Aqua, paraffin,');
    expect(section?.whole).toBe(true);
  });

  it('does not end a list at a capitalised row below it that may be its own next row ("Coco Capry")', () => {
    const { section } = readSection(frame(['Ingredients: Aqua, Glycerin, Cetyl Alcohol,', 'Potassium Cetyl Phosphate', 'Coco Capry']));
    expect(section?.end).toBeNull();
    expect(section?.whole).toBe(false);
  });

  it('does not end a list at a short row ending in a period when list rows follow ("Gyce Stearate.")', () => {
    const { section } = readSection(frame(['Ingredients: Aqua, Gycerin', 'Gyce Stearate.', 'Alcohol, Stearic Acid, Palmitic Acid, Phenoxyethanol.', 'Made in Turkey.']));
    expect(section?.rows).not.toEqual(['Aqua, Gycerin', 'Gyce Stearate.']);
    expect(section?.whole).toBe(false);
  });
});

describe('a false end in one frame (real sunscreen scan)', () => {
  it('does not take a short "whole" frame when frames from the same start showed the list going on', () => {
    // Frame "INGREDIENTS ... PEG-100 STEARATE, CETEARETH 20." looked whole (period, text below); three
    // frames from the heading showed 11-14 rows. Checking that frame scored the cream on 11 of ~28 names.
    const scan = createScan();
    for (const f of sunscreenFalseEnd.frames) addFrame(scan, readSection(f));
    for (const candidate of candidates(scan)) {
      expect(candidate.ingredientsText).not.toMatch(/CETEARETH[\s-]*20\W*$/i);
    }
    expect(candidates(scan).some((c) => c.path === 'full_frame')).toBe(false);
  });
});

describe('real tube scans (rows cut by the silhouette)', () => {
  it('rebuilds the 16 rows, keeps stacked rows apart and "Tocopherol." once', () => {
    for (const { frames } of [tube1658, tube1652]) {
      const scan = createScan();
      for (const f of frames) addFrame(scan, readSection(f));
      const { rows } = settled(scan);
      expect(rows).toHaveLength(16);
      // (Scan 1658's recorded frames never read the row's first letters: "copherol.")
      expect(rows[15]).toMatch(/opherol.$/);
      expect(rows.some((text) => /glutathione/i.test(text) && /sucrose/i.test(text))).toBe(false);
      expect(rows.filter((text) => /opherol/i.test(text))).toHaveLength(1);
    }
  });

  it('rebuilds the same list whatever order the frames came in', () => {
    // Real order, reversed, and deterministic shuffles.
    const orders = (n: number) => {
      const real = Array.from({ length: n }, (_, i) => i);
      const shuffle = (seed: number) => [...real].sort((a, b) => ((a * seed) % 97) - ((b * seed) % 97) || a - b);
      return [real, [...real].reverse(), shuffle(31), shuffle(57), shuffle(83)];
    };
    for (const { frames } of [tube1658, tube1652]) {
      const readings = frames.map((f) => readSection(f));
      const results = orders(readings.length).map((order) => {
        const scan = createScan();
        for (const i of order) addFrame(scan, readings[i]);
        const [multi] = candidates(scan).filter((c) => c.path === 'multi_view');
        return JSON.stringify([settled(scan).rows, multi?.ingredientsText ?? null]);
      });
      expect(new Set(results).size).toBe(1);
    }
  });
  // Whether a tube frame looks whole or not, its rows are cut: the server's boundary check refuses
  // every candidate these scans produce (backend scanValidation.test.ts).
});

describe('evidence: a name cut inside its bracket at a row end', () => {
  // A real tube: "…Heptahydrate, Titanium Dioxide (CI 77891)," with the row end round the curve, read
  // clean up to the bracket in 7 frames of one scan ("hydrate, Titanium Dioxide (CI 789").
  const rows = ['Aqua, Dimethicone, Isoamyl Laurate, Glycerin,', 'Carbonate, Magnesium Sulfate Heptahydrate, Titanium Dioxide (CI 789', 'Butylene Glycol, Mica, Tocopherol.'];

  it('keeps the name before the bracket: it was read whole up to there', () => {
    const scan = createScan();
    addFrame(scan, readSection(frame(rows)));
    expect(scan.evidence.flat()).toContain('Titanium Dioxide');
  });

  it('still drops a last item cut inside a word', () => {
    const scan = createScan();
    addFrame(scan, readSection(frame([rows[0], 'Carbonate, Magnesium Sulfate Heptahydrate, Titanium Diox', rows[2]])));
    expect(scan.evidence.flat().some(item => /Titanium/.test(item))).toBe(false);
  });
});
