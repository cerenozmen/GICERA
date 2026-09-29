import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fixtureAnalyzer, loadPhotoFixture } from "./__fixtures__/photoFixtures";
import { inciKey, MIN_PHOTO_COVERAGE } from "./ingredientCoverage";

// Specific cases from the real shots of one 30 ml face cream (31 INCI names, curved label, small print).
const fixture = loadPhotoFixture("face-cream-30ml");
const analyze = fixtureAnalyzer(fixture);
const shot = (id: string) => {
  const found = fixture.shots.find((s) => s.id.startsWith(id));
  assert.ok(found?.text, `no analysed shot ${id}`);
  return analyze(found.text);
};

describe("photo analysis: face cream shots", () => {
  it("scores the sharp shots 80 (phenoxyethanol -5, triethanolamine -15)", () => {
    const analysis = shot("2026-09-24T12:12:13");
    assert.equal(analysis.scoring?.cleanScore, 80);
    assert.deepEqual(
      analysis.ingredients.filter((i) => i.contribution).map((i) => `${i.matchedName}:${i.contribution}`),
      ["phenoxyethanol:5", "triethanolamine:15"]
    );
  });

  it("withholds the shot where triethanolamine was lost to OCR garbage, despite 90% coverage", () => {
    const analysis = shot("2026-09-24T12:10:20");
    assert.ok(analysis.coverage >= MIN_PHOTO_COVERAGE);
    assert.ok(!analysis.ingredients.some((i) => i.matchedName === "triethanolamine"));
    assert.equal(analysis.withheldReason, "unrecognizable");
    assert.equal(analysis.scoring, null);
  });

  it("withholds a shot where an unknown could be a flagged substance, despite 90% coverage", () => {
    // "Ctric Acid": 1 edit from citric acid but also 2 from boric acid, which carries a penalty.
    const analysis = shot("2026-09-24T12:10:04");
    assert.ok(analysis.coverage >= MIN_PHOTO_COVERAGE);
    assert.equal(analysis.withheldReason, "uncertain_flagged");
    assert.equal(analysis.scoring, null);
  });

  it("counts harmless one-letter misreads as read (a sharp shot that 0.806 coverage used to reject)", () => {
    // Unknowns: Glyeryl Stearate, Parafinum Liquidum, Ethylhexylgycerin, Hexamethyindanopyran (1 letter
    // each) and PEG-40 Castor 0i, Potasiun Phosphate (2 letters): 25 matched + 4 read = 29/31.
    const analysis = shot("2026-09-24T12:48:13");
    assert.ok(analysis.coverage < MIN_PHOTO_COVERAGE);
    assert.equal(analysis.readCoverage, 29 / 31);
    assert.equal(analysis.scoring?.cleanScore, 80);
  });

  it("withholds the shaken shot", () => {
    const analysis = shot("2026-09-24 14:12 (shaken)");
    assert.ok(analysis.coverage < MIN_PHOTO_COVERAGE);
    assert.equal(analysis.scoring, null);
  });

  it("does not let unknown ingredients move the score either way", () => {
    const base = "Aqua, Glycerin, Phenoxyethanol, Triethanolamine, Citric Acid, Panthenol, Fructose, Sorbitol, Inulin";
    assert.equal(analyze(base).scoring?.cleanScore, 80);
    assert.equal(analyze(`${base}, Tocophery Acetate`).scoring?.cleanScore, 80);
    // A flagged name misread by two letters is neither dropped nor guessed: no score.
    const misread = analyze(base.replace("Phenoxyethanol", "Phenoxyethnl"));
    assert.equal(misread.withheldReason, "uncertain_flagged");
    assert.equal(misread.scoring, null);
  });

  it("reads a name one letter from a single flagged name, and from no other, as that name, penalty included", () => {
    const base = "Aqua, Glycerin, Phenoxyethanol, Triethanolamine, Citric Acid, Panthenol, Fructose, Sorbitol, Inulin";
    // Seen for real: "Phenoxyethanl", and "Titaniun Dioxide" on a tube. Only ever lowers the score.
    const misread = analyze(base.replace("Phenoxyethanol", "Phenoxyethanl"));
    assert.equal(misread.ingredients.find((i) => i.text === "Phenoxyethanl")?.matchedName, "phenoxyethanol");
    assert.equal(misread.scoring?.cleanScore, 80);
  });
});

describe("OCR normalisation", () => {
  it("absorbs accents, case, spacing and trailing punctuation", () => {
    assert.equal(inciKey("Sorbitól"), inciKey("SORBITOL"));
    assert.equal(inciKey("Cítric Acid."), inciKey("citric acid"));
    assert.equal(inciKey("CitricAcid"), inciKey("Citric  Acid"));
    assert.equal(inciKey("Coco-Caprylate / Caprate"), inciKey("COCO-CAPRYLATE/CAPRATE"));
  });

  it("reads the colour index prefix 'Cl' as 'CI' (CosIng has no name starting Cl + digits)", () => {
    assert.equal(inciKey("Cl 77492"), inciKey("CI 77492"));
    assert.notEqual(inciKey("Cl 7492"), inciKey("CI 77492"));
  });

  it("undoes one OCR confusion only (0/o, l/i, stray !), never other edits", () => {
    const [castor] = analyze("PEG-40 Castor 0il").ingredients;
    assert.equal(castor.matchedName, "peg-40 castor oil");
    const [twice] = analyze("PEG-40 Castor 0i1").ingredients;
    assert.equal(twice.status, "unknown");
    assert.equal(twice.suspected, "digit_in_word");
  });

  it("splits two names merged by a missing comma only when the parts are certain", () => {
    const merged = analyze("Glyceryl Stearate Paraffinum Liquidum").ingredients.map((i) => i.matchedName);
    assert.deepEqual(merged, ["glyceryl stearate", "paraffinum liquidum"]);
  });
});
