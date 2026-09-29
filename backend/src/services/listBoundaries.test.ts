import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { buildVocabulary } from "./ingredientCoverage";
import { buildWordSet, checkListBoundaries } from "./listBoundaries";
import { validateScan } from "./scanValidation";

/* eslint-disable @typescript-eslint/no-var-requires */
// The app's scanner, so the recorded frames are read exactly as on the phone.
const scanner = require("../../../frontend/src/ingredientScanner");
/* eslint-enable @typescript-eslint/no-var-requires */

// Recorded on the device (Sept 2026): tube live-scan snapshots, and high-resolution photos of a flat
// all-caps blush label and a mixed-case face cream. The vocabulary is the real one's slice sharing a
// word with that text (see vocabulary.json).
const dir = path.join(__dirname, "__fixtures__", "scan");
const vocabulary = buildVocabulary(JSON.parse(readFileSync(path.join(dir, "vocabulary.json"), "utf8")).names, []);
const words = buildWordSet(vocabulary);
const check = (rows: string[], heading = true) => checkListBoundaries(rows, heading, vocabulary, words);
const failed = (rows: string[], heading = true) => check(rows, heading).checks.filter((c) => !c.verified).map((c) => `${c.kind}@${c.row + 1}`);

interface Frame {
  width: number;
  height: number;
  lines: { text: string; left: number; top: number; width: number; height: number }[];
}
const tube = (name: string): Frame[] => JSON.parse(readFileSync(path.join(dir, name), "utf8")).frames;
const photo = (name: string): Frame => {
  const raw: [string, number, number[] | null][][] = JSON.parse(readFileSync(path.join(dir, name), "utf8")).raw;
  return { width: 3060, height: 4080, lines: raw.flat().flatMap(([text, , b]) => (b ? [{ text, left: b[0], top: b[1], width: b[2], height: b[3] }] : [])) };
};
const BLUSH = ["ocr-1790253982189.json", "ocr-1790254000753.json", "ocr-1790254004668.json", "ocr-1790254010006.json"];
const CREAM = ["ocr-1790254064128.json", "ocr-1790254075892.json", "ocr-1790254084562.json", "ocr-1790254093971.json", "ocr-1790254112678.json"];

// Completeness only: the score is not what these tests are about.
const noScore = () => ({ cleanScore: 100, cleanRating: "clean" as const, pregnancySafe: true, flaggedIngredients: [] });

/** Replays frames as the app does; returns every candidate checked: complete or not, and what was analysed. */
function replay(frames: Frame[]) {
  const scan = scanner.createScan();
  const sent = new Set<string>();
  const results: { path: string; complete: boolean; read: string }[] = [];
  for (const frame of frames) {
    scanner.addFrame(scan, scanner.readSection(frame));
    for (const candidate of scanner.candidates(scan)) {
      if (sent.has(candidate.key)) continue;
      sent.add(candidate.key);
      const validation = validateScan(candidate, vocabulary, noScore);
      const read = validation.analysis?.merged?.ingredients.map((i) => i.text).join(", ") ?? "";
      results.push({ path: candidate.path, complete: validation.complete, read: read.toLowerCase() });
    }
  }
  return results;
}

/** Label ingredients none of whose words (4+ characters) the reading has: lost, not just misread. */
const lost = (label: string[], read: string) =>
  label.filter((name) => !name.toLowerCase().split(/[\s/()-]+/).some((word) => word.length >= 4 && read.includes(word)));
const TUBE = [
  "Aqua", "Dimethicone", "Isoamyl Laurate", "Glycerin", "Ascorbyl Tetraisopalmitate", "Dicaprylyl Carbonate",
  "Magnesium Sulfate Heptahydrate", "Titanium Dioxide (CI 77891)", "Butylene Glycol", "Cetyl PEG/PPG-10/1 Dimethicone",
  "Polyglyceryl-4 Isostearate", "Dibutyl Adipate", "Dimethicone/Vinyl Dimethicone Crosspolymer", "Iron Oxide CI 77492",
  "Adansonia Digitata (Baobab) Seed Oil", "Glycyrrhiza Glabra Root Extract", "Phenoxyethanol", "Stearalkonium Hectorite",
  "Iron Oxide CI 77491", "Mica", "Iron Oxide CI 77499", "Deinococcus Ferment Extract Filtrate", "Calophyllum Inophyllum Seed Oil",
  "Niacinamide", "Glutathione", "Styrene/Acrylates Copolymer", "Propylene Carbonate", "Sucrose", "Cellulose Gum", "Tocopherol",
];
const JAR = [
  "Aqua", "Glycerin", "Isopropyl Palmitate", "Glyceryl Stearate", "Paraffinum Liquidum", "Sorbitol", "Cetearyl Alcohol",
  "Cetyl Alcohol", "Stearic Acid", "Palmitic Acid", "Phenoxyethanol", "Coco-Caprylate/Caprate", "Potassium Cetyl Phosphate",
  "Triethanolamine", "Carbomer", "Fragaria Vesca Fruit Extract", "Parfum", "Inulin", "Bis-Diglyceryl Polyacyladipate-2",
  "PEG-40 Castor Oil", "Tocopheryl Acetate", "Panthenol", "Sodium Cetearyl Sulfate", "Ethylhexylglycerin", "Tetrasodium EDTA",
  "Fructose", "Hexamethylindanopyran", "Tetramethyl Acetyloctahydronaphthalenes", "Potassium Phosphate", "BHA", "Citric Acid",
];

describe("list boundaries: cut words", () => {
  it("refuses row ends cut by a silhouette, as read on a real tube", () => {
    assert.deepEqual(failed(["Aqua, Dicaprylyl Carbonate, Mag", "Heptahydrate, Titanium Dioxide."]), ["break@1"]);
    assert.deepEqual(failed(["Aqua, Dimethicone/Vinyl Dime", "Crosspolymer, Iron Oxides."]), ["break@1"]);
    assert.deepEqual(failed(["Aqua, Dimethicone, Isoamy", "Laurate, Glycerin."]), ["break@1"]);
  });

  it("refuses row starts cut mid-word, and a list start cut before the heading", () => {
    assert.deepEqual(failed(["Aqua, Glycerin, Magnesium Sulfate", "ydrate, Titanium Dioxide."]), ["break@1"]);
    assert.deepEqual(failed(["ndekiler: Aqua, Glycerin,", "Parfum, Citric Acid."], false), ["start@1"]);
  });

  it("takes whole words and names running across a row break", () => {
    assert.deepEqual(failed(["Aqua, Dimethicone, Isoamyl", "Laurate, Glycerin,", "Magnesium Sulfate, Parfum."]), []);
  });

  it("refuses the list's last word when it is a piece ('…Tocophery' over other text)", () => {
    assert.deepEqual(failed(["Aqua, Glycerin, Tocophery"]), ["end@1"]);
  });

  it("tells a one-letter misread inside a long word from a cut piece", () => {
    // Misreads on a real blush photo: whole words.
    assert.deepEqual(failed(["TALC, MICA, CALCIUM ALUMINUM", "BOROSILIGATE, DIMETHICONE, MICROCRYSTALINE", "CELLULOSE, AQUA."]), []);
    // One letter short at the end of a row: the word may go on past the edge.
    assert.deepEqual(failed(["Aqua, Glycerin, Dimethicon", "Crosspolymer, Parfum."]), ["break@1"]);
  });

  it("uses letter case only on mixed-case labels ('Cl 77491' doesn't make an all-caps label mixed case)", () => {
    assert.deepEqual(failed(["Aqua, Glycerin, Cetyl Alcohol,", "Cety) Alcohol, Parfum."]), []); // a capital starts a word
    assert.deepEqual(failed(["TALC, MICA, CI 77491, Cl 77492,", "ETHYLENEPRÓPYLENE/STYRENE COPOLYMER, AQUA."]), ["break@1"]);
  });

  it("refuses a list whose first item was not read (': ,MICA' on a real blush photo)", () => {
    assert.deepEqual(failed([",MICA, MAGNESIUM MYRISTATE, SILICA."]), ["start@1"]);
  });
});

describe("recorded scans through the scanner and the server check", () => {
  it("never finds a real tube scan complete: its rows are cut by the silhouette in every frame", () => {
    for (const name of ["scan-tube-1658.json", "scan-tube-1652.json"]) {
      const results = replay(tube(name));
      assert.deepEqual(results.filter((r) => r.complete), [], name);
    }
  });

  it("completes the flat blush label from its photos (each boundary seen whole in some photo)", () => {
    const all = replay(BLUSH.map(photo));
    assert.ok(all.some((r) => r.complete && r.path === "full_frame"));
    // Alone, the photo that lost "TALC" is not complete.
    assert.deepEqual(replay([photo("ocr-1790253982189.json")]).filter((r) => r.complete), []);
  });

  it("completes the face cream from its photos", () => {
    assert.ok(replay(CREAM.map(photo)).some((r) => r.complete));
  });

  it("rebuilds a real tube from a scan turned end to end, without losing an ingredient", () => {
    const complete = replay(tube("scan-tube-new-296267.json")).filter((r) => r.complete);
    assert.ok(complete.some((r) => r.path === "multi_view"), "the list rebuilt from several views completes");
    for (const r of complete) assert.deepEqual(lost(TUBE, r.read), [], r.path);
  });

  it("never takes a real round jar's jumbled (arced) rows for a whole list with ingredients missing", () => {
    // Before: a frame read as a whole two-row list ("Aqua, Gycerin" / "Gyce Stearate."), 29 items lost;
    // a list rebuilt from OCR lines cutting across two arced rows, 9 items lost.
    for (const r of replay(tube("scan-jar-811784.json")).filter((x) => x.complete)) {
      assert.ok(lost(JAR, r.read).length <= 2, `${r.path}: ${lost(JAR, r.read).join(", ")}`);
    }
  });

  it("checks a rebuilt row's edges with every frame's reading of them, and analyses the one read whole", () => {
    const candidate = {
      readings: [{ rows: ["Aqua, Glycerin, Isoamy", "Laurate, Parfum."], heading: true }],
      edges: [
        { starts: ["Aqua, Glycerin, Isoamy"], ends: ["Aqua, Glycerin, Isoamy", "Glycerin, Isoamyl"] },
        { starts: ["Laurate, Parfum."], ends: ["Laurate, Parfum."] },
      ],
      ingredientsText: "Aqua, Glycerin, Isoamy Laurate, Parfum",
      evidence: [],
    };
    const validation = validateScan(candidate, vocabulary, noScore);
    assert.equal(validation.complete, true);
    assert.deepEqual(
      validation.analysis?.merged?.ingredients.map((i) => i.text.toLowerCase()),
      ["aqua", "glycerin", "isoamyl laurate", "parfum"]
    );
    // Without the whole reading, the row's end stays unseen.
    assert.equal(validateScan({ ...candidate, edges: undefined }, vocabulary, noScore).complete, false);
  });
});

/**
 * Scans the oracle (scripts/scanOracle.ts) found all of the list's text in, which the reconstruction
 * once failed to put together: its whole list must now come out, with every label ingredient in it.
 * On failure the message says where the reconstruction stops.
 */
describe("oracle gate: scans whose text was all observed are rebuilt whole", () => {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { oracle } = require("../scripts/scanOracle");
  /* eslint-enable @typescript-eslint/no-var-requires */
  const settledCheck = (frames: Frame[]) => {
    const scan = scanner.createScan();
    for (const frame of frames) scanner.addFrame(scan, scanner.readSection(frame));
    const candidate = scanner.candidates(scan).find((c: { path: string }) => c.path === "multi_view");
    if (!candidate) return { complete: false, why: scanner.rebuiltMissing(scan).join("; ") || "no rebuilt list", read: "" };
    const validation = validateScan(candidate, vocabulary, noScore);
    const why = validation.boundaries.checks.filter((c) => !c.verified).map((c) => `${c.kind}@${c.row + 1}: ${c.reason}`).join("; ");
    const read = validation.analysis?.merged?.ingredients.map((i) => i.text).join(", ").toLowerCase() ?? "";
    return { complete: validation.complete, why, read };
  };
  const cases: [string, string[] | null][] = [
    ["scan-tube-new-296267.json", TUBE],
    ["scan-tube-263679575.json", TUBE],
    ["scan-tube-265304179.json", TUBE],
    ["scan-tube-337344489.json", TUBE],
    ["scan-balm-337374034.json", null],
  ];
  for (const [name, label] of cases) {
    it(name, () => {
      const frames = tube(name);
      assert.equal(oracle(name, frames, 8, vocabulary, false, () => {}).observed, true, "oracle: all text observed");
      const result = settledCheck(frames);
      assert.ok(result.complete, `production reconstruction failed: ${result.why}`);
      if (label) assert.deepEqual(lost(label, result.read), []);
    });
  }

  it("the same list whatever order a real tube scan's frames come in", () => {
    const frames = tube("scan-tube-new-296267.json");
    const shuffled = (seed: number) => [...frames.keys()].sort((a, b) => ((a * seed) % 101) - ((b * seed) % 101) || a - b).map((i) => frames[i]);
    const texts = [frames, [...frames].reverse(), shuffled(37)].map((order) => {
      const scan = scanner.createScan();
      for (const frame of order) scanner.addFrame(scan, scanner.readSection(frame));
      return scanner.candidates(scan).find((c: { path: string }) => c.path === "multi_view")?.ingredientsText ?? null;
    });
    assert.ok(texts[0]);
    assert.deepEqual(new Set(texts).size, 1);
  });

  it("a jar scan whose text wasn't all observed (5-character overlaps at most) is not taken as whole with ingredients missing", () => {
    const result = settledCheck(tube("scan-jar-264287269.json"));
    if (result.complete) assert.ok(lost(JAR, result.read).length <= 1, lost(JAR, result.read).join(", "));
  });
});
