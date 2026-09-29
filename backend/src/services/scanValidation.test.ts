import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildVocabulary } from "./ingredientCoverage";
import { ocrSuspect, outcome, validateScan } from "./scanValidation";
import { parseIngredientsText } from "./scoringService";

// The names of a real tube's label (backend/captures/scans/curved-tube/label.txt), plus the words the
// boundary check needs.
const NAMES = [
  "Aqua", "Dimethicone", "Isoamyl Laurate", "Glycerin", "Titanium Dioxide", "CI 77891", "Butylene Glycol", "Polyglyceryl-4 Isostearate",
  "Dibutyl Adipate", "Phenoxyethanol", "Mica", "Niacinamide", "Glutathione", "Propylene Carbonate", "Sucrose", "Cellulose Gum", "Tocopherol",
  "Iron Oxides", "Stearalkonium Hectorite", "Magnesium Sulfate", "Sodium Heptahydrate", "Castor Oil",
];
const vocabulary = buildVocabulary(NAMES, []);
const noScore = () => ({ cleanScore: 100, cleanRating: "clean" as const, pregnancySafe: true, flaggedIngredients: [] });

const AFTER = ["Butylene Glycol", "Polyglyceryl-4 Isostearate", "Dibutyl Adipate", "Phenoxyethanol", "Mica", "Niacinamide", "Glutathione", "Propylene Carbonate", "Sucrose", "Cellulose Gum", "Tocopherol"];

describe("brackets: an opening bracket whose ')' OCR lost", () => {
  const rows = ["Aqua, Dimethicone, Isoamyl Laurate, Glycerin,", "Titanium Dioxide (CI 77891, Butylene Glycol,", `${AFTER.slice(1).join(", ")}.`];
  const candidate = { readings: [{ rows, heading: true }], ingredientsText: rows.join(" "), evidence: [] };

  it("would make the analysis' tokenizer drop every item after it (why the check exists)", () => {
    const tokens = parseIngredientsText(candidate.ingredientsText);
    assert.equal(tokens.length, 5); // Aqua, Dimethicone, Isoamyl Laurate, Glycerin, Titanium Dioxide: the other 11 are gone
  });

  it("makes the scan INCOMPLETE: never analysed, never scored", () => {
    const validation = validateScan(candidate, vocabulary, noScore);
    assert.equal(validation.complete, false);
    assert.equal(validation.analysis, null);
    const failed = validation.boundaries.checks.filter((c) => !c.verified);
    assert.deepEqual(failed.map((c) => `${c.kind}@${c.row}`), ["brackets@1"]);
    assert.deepEqual(outcome(validation), { scanStatus: "INCOMPLETE", analysisStatus: "NOT_ANALYSED" });
  });

  it("also when only the joined list text is unbalanced", () => {
    const balancedRows = ["Aqua, Glycerin, Titanium Dioxide (CI 77891),", `${AFTER.join(", ")}.`];
    const validation = validateScan({ readings: [{ rows: balancedRows, heading: true }], ingredientsText: "Aqua, Glycerin, Titanium Dioxide (CI 77891, Butylene Glycol", evidence: [] }, vocabulary, noScore);
    assert.equal(validation.complete, false);
  });

  it("lets a closed bracket through, with every item after it analysed", () => {
    const whole = ["Aqua, Dimethicone, Isoamyl Laurate, Glycerin,", "Titanium Dioxide (CI 77891), Butylene Glycol,", `${AFTER.slice(1).join(", ")}.`];
    const validation = validateScan({ readings: [{ rows: whole, heading: true }], ingredientsText: whole.join(" "), evidence: [] }, vocabulary, noScore);
    assert.equal(validation.complete, true);
    assert.equal(validation.analysis?.merged?.detected, 16);
  });
});

describe("ocrSuspect: misread by OCR, or read right and missing from the dictionary", () => {
  it("flags garbled words and digits in words", () => {
    assert.equal(ocrSuspect("Phenoxvethanol", "none", vocabulary), true);
    assert.equal(ocrSuspect("Carbome", "none", vocabulary), true);
    assert.equal(ocrSuspect("PEG-40 Castor 0i", "digit_in_word", vocabulary), true);
  });
  it("doesn't flag a name made of known words", () => {
    assert.equal(ocrSuspect("Magnesium Sulfate Heptahydrate", "none", vocabulary), false);
  });
});
