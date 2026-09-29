import {
  chooseReading,
  cropBox,
  deviceCompleteness,
  fromUpright,
  orientedSize,
  placeCrop,
  readPhoto,
  rowCuts,
  toUpright,
} from '../src/guidedScan';
import { ScanFrame, ScanLine } from '../src/ingredientScanner';
import { mergePhotos, PhotoList } from '../src/photoMerge';

/** A synthetic photo: rows of text 60 px apart, 12 px per character, starting at (x, y). */
function photo(rows: string[], { x = 600, y = 1500, width = 3060, height = 4080 } = {}): ScanFrame {
  const lines: (ScanLine & { confidence: number })[] = rows.map((text, i) => ({ text, left: x, top: y + i * 60, width: text.length * 12, height: 45, confidence: 0.72 }));
  return { lines, width, height };
}

const list = (name: string, rows: string[], options: { heading?: boolean; end?: boolean } = {}): PhotoList => ({
  name,
  rows,
  heading: options.heading ?? false,
  start: options.heading ?? false,
  end: options.end ?? false,
});

const FLAT = [
  'Ingredients: Aqua, Glycerin, Isopropyl Palmitate, Glyceryl',
  'Stearate, Paraffinum Liquidum, Sorbitol, Cetearyl Alcohol,',
  'Cetyl Alcohol, Stearic Acid, Phenoxyethanol, Tocopheryl',
  'Acetate, Parfum, Citric Acid.',
  'Made in Turkey. Keep out of reach of children.',
];

describe('orientation: the photo as ML Kit reads it, however the phone was held', () => {
  it('portrait stands the sensor frame upright; landscape keeps it', () => {
    expect(orientedSize(4080, 3060, 'portrait')).toEqual({ width: 3060, height: 4080 });
    expect(orientedSize(4080, 3060, 'portrait-upside-down')).toEqual({ width: 3060, height: 4080 });
    expect(orientedSize(4080, 3060, 'landscape-left')).toEqual({ width: 4080, height: 3060 });
    expect(orientedSize(4080, 3060, 'landscape-right')).toEqual({ width: 4080, height: 3060 });
  });

  // A real Sudocrem photo taken with the phone sideways (Sept 2026): ML Kit's lines lie in the 4080×3060
  // picture, the text running up. The app had logged it as 3060×4080 (the bug).
  const log: { sensor: { width: number; height: number; orientation: string }; lines: ScanLine[] } = require('./fixtures/landscape-round-center.mlkit.json');
  const size = orientedSize(log.sensor.width, log.sensor.height, log.sensor.orientation);

  it('reads the list with the real size, every line inside the frame', () => {
    expect(size).toEqual({ width: 4080, height: 3060 });
    for (const line of log.lines) {
      expect(line.left + line.width).toBeLessThanOrEqual(size.width);
      expect(line.top + line.height).toBeLessThanOrEqual(size.height);
    }
    const reading = readPhoto({ ...size, lines: log.lines }, 'P1');
    expect(reading.turned).toBe(270);
    expect(reading.frame).toMatchObject({ width: 3060, height: 4080 });
    expect(reading.section?.rows.join(' ')).toMatch(/lanolin, 0zokerite, .*sorbitan sesquioleate, benzyl benzoate/);
  });

  it("maps points between ML Kit's frame and the upright one, both ways, for every turn", () => {
    for (const turned of [0, 90, 180, 270]) {
      const p: [number, number] = [1234, 567];
      expect(fromUpright(toUpright(p, turned, 4080, 3060), turned, 4080, 3060)).toEqual(p);
    }
  });

  it("crops the list with margins in ML Kit's frame, never cutting a list row", () => {
    const reading = readPhoto({ ...size, lines: log.lines }, 'P1');
    const box = cropBox(reading, size)!;
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.left + box.width).toBeLessThanOrEqual(size.width);
    expect(box.top + box.height).toBeLessThanOrEqual(size.height);
    const a = toUpright([box.left, box.top], reading.turned, size.width, size.height);
    const b = toUpright([box.left + box.width, box.top + box.height], reading.turned, size.width, size.height);
    const [x0, x1, y0, y1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1])];
    for (const row of reading.rows.slice(reading.section!.from, reading.section!.to)) {
      expect(row.left).toBeGreaterThan(x0);
      expect(row.right).toBeLessThan(x1);
      expect(row.top).toBeGreaterThan(y0);
      expect(row.bottom).toBeLessThan(y1);
    }
  });

  it("moves the crop's OCR back into the photo's frame", () => {
    const crop: ScanFrame = {
      width: 800,
      height: 400,
      lines: [{ text: 'Aqua, Glycerin', left: 10, top: 20, width: 300, height: 40, corners: [[10, 20], [310, 20], [310, 60], [10, 60]] }],
    };
    expect(placeCrop(crop, { left: 1000, top: 500, width: 800, height: 400 }, size)).toMatchObject({
      width: 4080,
      height: 3060,
      lines: [{ left: 1010, top: 520, corners: [[1010, 520], [1310, 520], [1310, 560], [1010, 560]] }],
    });
  });
});

describe('the crop pass: used only when reliable', () => {
  const size = { width: 3060, height: 4080 };
  const whole = readPhoto(photo(FLAT), 'P1');

  it('the crop when it read the list whole', () => {
    expect(chooseReading(whole, readPhoto(photo(FLAT), 'P1'), cropBox(whole, size), size).pass).toBe('crop');
  });

  it('the whole photo when the crop border cuts a row, or the crop read less', () => {
    const narrow = { left: 700, top: 1400, width: 400, height: 400 }; // the rows run past its right border
    expect(chooseReading(whole, readPhoto(photo(FLAT), 'P1'), narrow, size)).toMatchObject({ pass: 'original', why: 'crop border cuts the list' });
    const less = readPhoto(photo([...FLAT.slice(0, 2), 'Made in Turkey.']), 'P1');
    expect(chooseReading(whole, less, cropBox(whole, size), size).pass).toBe('original');
  });
});

describe('one observation per real photo', () => {
  it('a photo\'s crop and its whole picture never count as two photos (Sudocrem: "paraffin" + "liquidium")', () => {
    const wholePass: PhotoList = { ...list('P1', ['Ingredients: Aqua, paraffin', 'zinc oxide, lanolin, ozokerite, citric acid and BHT.'], { heading: true, end: true }), source: 'P1' };
    const cropPass: PhotoList = { ...list('P1:crop', ['Aqua, paraffin', 'liquidium, zinc oxide, lanolin, ozokerite, citric acid and BHT.'], { heading: true, end: true }), source: 'P1' };
    const merged = mergePhotos([wholePass, cropPass])!;
    expect(merged.log.map(e => e.photo)).toEqual(['P1']);
    expect(merged.rows.join(' ')).not.toMatch(/liquidium/);
  });
});

describe('no pixels, no letters: a cut row edge is never completed', () => {
  const rows = ['Aqua, Polyglyceryl-4 Isostearate, Dibuty', 'Adipate, Mica, Tocopherol.'];

  it('a row end cut at the silhouette keeps the list incomplete, whatever the dictionary knows', () => {
    const merged = mergePhotos([{ ...list('P1', rows, { heading: true, end: true }), cutEnd: [true, false] }])!;
    expect(merged.rows[0]).toMatch(/Dibuty$/);
    expect(deviceCompleteness(merged).needs).toContainEqual({ need: 'right', row: 0 });
  });

  it('another photo that really shows the word whole completes it', () => {
    const cut: PhotoList = { ...list('P1', rows, { heading: true, end: true }), cutEnd: [true, false] };
    const turned: PhotoList = { ...list('P2', ['Polyglyceryl-4 Isostearate, Dibutyl', 'Adipate, Mica, Tocopherol.'], { end: true }), cutEnd: [false, false] };
    const merged = mergePhotos([cut, turned])!;
    expect(merged.rows[0]).toMatch(/Dibutyl$/);
    expect(deviceCompleteness(merged).status).toBe('CANDIDATE');
  });

  it('a row start cut ("alophyllum") asks for the text before it', () => {
    const cut: PhotoList = { ...list('P1', ['Aqua, Mica, Sucrose,', 'alophyllum Inophyllum Seed Oil, Tocopherol.'], { heading: true, end: true }), cutStart: [false, true] };
    expect(deviceCompleteness(mergePhotos([cut])).needs).toContainEqual({ need: 'left', row: 1 });
  });

  it("a word squeezed at the silhouette (letters far narrower than the row's) is a cut edge", () => {
    const words = (texts: string[], perLetter: number[]) => texts.map((text, i) => ({ text, left: 0, width: 0, length: text.length * perLetter[i] }));
    const row = { text: 'Polyglyceryl-4 Isostearate, Dibuty', left: 400, right: 2600, top: 1000, bottom: 1045, height: 45 };
    const line = { text: row.text, left: 400, top: 1000, width: 2200, height: 45, words: words(['Polyglyceryl-4', 'Isostearate,', 'Dibuty'], [30, 30, 12]) };
    expect(rowCuts(row, [line], 3060)).toEqual([false, true]);
    const flat = { ...line, text: 'Polyglyceryl-4 Isostearate, Dibutyl', words: words(['Polyglyceryl-4', 'Isostearate,', 'Dibutyl'], [30, 30, 28]) };
    expect(rowCuts(row, [flat], 3060)).toEqual([false, false]);
  });
});
