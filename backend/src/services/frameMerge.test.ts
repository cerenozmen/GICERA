import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ScoringResult } from "../types/product";
import { fixtureAnalyzer, loadPhotoFixture } from "./__fixtures__/photoFixtures";
import { analyzeFrames, FrameInput } from "./frameMerge";
import { buildVocabulary, inciKey } from "./ingredientCoverage";
import { parseIngredientsText } from "./scoringService";

// Real shots of the 30 ml face cream (score 80: phenoxyethanol -5, triethanolamine -15). Its fixture
// supplies the vocabulary slice and the real scorer's penalties.
const fixture = loadPhotoFixture("face-cream-30ml");
const vocabulary = buildVocabulary(fixture.vocabulary.inventory, fixture.vocabulary.flagged);
const score = (names: string[]): ScoringResult => {
  const penalty = names.reduce((sum, name) => sum + (fixture.penalties[name] ?? 0), 0);
  const cleanScore = Math.max(0, 100 - penalty);
  return { cleanScore, cleanRating: cleanScore >= 80 ? "clean" : "moderate", pregnancySafe: true, flaggedIngredients: [] };
};
const frame = (text: string, status = "ok"): FrameInput => ({ status, tokens: parseIngredientsText(text) });
const merge = (...frames: FrameInput[]) => analyzeFrames(frames, vocabulary, score);

const LIST = "Aqua, Glycerin, Sorbitol, Phenoxyethanol, Carbomer, Triethanolamine, Parfum, Inulin, Panthenol, Fructose, Citric Acid";

describe("multi-frame merge", () => {
  it("resolves a frame's misread from an exact read in another frame", () => {
    const result = merge(frame(LIST.replace("Phenoxyethanol", "Phenoxyethnl")), frame(LIST), frame(LIST));
    assert.equal(result.merged?.scoring?.cleanScore, 80);
    // The base is a frame that read everything; the misread frame only donates nothing.
    assert.notEqual(result.base, 0);
  });

  it("uses an exact read to correct the base frame's misread of a flagged ingredient", () => {
    // Base = the frame with more exact reads (10 vs 8); its "Iriethanolamine" is read exactly elsewhere.
    const base = LIST.replace("Triethanolamine", "Iriethanolamine");
    const other = LIST.replace("Parfum", "Partum").replace("Inulin", "Inuin").replace("Panthenol", "Pathenol");
    const result = merge(frame(other), frame(base));
    assert.equal(result.base, 1);
    assert.deepEqual(result.corrections.map((c) => [c.read, c.names[0], c.frames]), [["Iriethanolamine", "triethanolamine", [0]]]);
    assert.equal(result.merged?.scoring?.cleanScore, 80);
  });

  it("never guesses: a misread no frame read exactly stays unknown and the score is withheld", () => {
    const misread = LIST.replace("Triethanolamine", "Iriethanolamine");
    const result = merge(frame(misread), frame(misread), frame(misread));
    assert.equal(result.corrections.length, 0);
    assert.equal(result.merged?.withheldReason, "uncertain_flagged");
    assert.equal(result.merged?.scoring, null);
  });

  it("keeps a flagged ingredient another frame read exactly when the base dropped it", () => {
    // Base (10 exact reads) lost Triethanolamine without a trace; the other frame (9) read it exactly.
    const dropped = LIST.replace("Triethanolamine, ", "");
    const other = LIST.replace("Parfum", "Partum").replace("Inulin", "Inuin");
    const result = merge(frame(dropped), frame(other));
    assert.equal(result.base, 0);
    assert.deepEqual(result.insertions.map((i) => [i.names[0], i.frames]), [["triethanolamine", [1]]]);
    assert.equal(result.merged?.scoring?.cleanScore, 80);
    // Single-frame reading of the base alone would have scored it 95.
    assert.equal(merge(frame(dropped)).merged?.scoring?.cleanScore, 95);
  });

  it("does not add names another frame read past either end of the list", () => {
    const result = merge(frame(LIST), frame(`${LIST}, Talc`));
    assert.equal(result.insertions.length, 0);
    assert.ok(!result.merged?.ingredients.some((i) => i.matchedName === "talc"));
  });

  it("leaves out incomplete frames and never builds a complete list out of partial ones", () => {
    const withPartial = merge(frame(LIST), frame("Aqua, Glycerin", "partial"), frame(LIST));
    assert.equal(withPartial.merged?.scoring?.cleanScore, 80);
    const allPartial = merge(frame("Aqua, Glycerin, Sorbitol", "partial"), frame("Parfum, Inulin, Citric Acid", "partial"));
    assert.equal(allPartial.merged, null);
    assert.equal(allPartial.status, "partial");
  });

  it("does not take a short but fully read frame as the base", () => {
    const result = merge(frame("Aqua, Glycerin"), frame(LIST.replace("Inulin", "Inuin")));
    assert.equal(result.base, 1);
    assert.equal(result.merged?.detected, 11);
  });

  it("withholds the score when frames read different exact names that score differently", () => {
    // Same position, two real names two letters apart: diethanolamine (-60) vs triethanolamine (-15).
    const a = LIST.replace("Triethanolamine", "Diethanolamine");
    const result = merge(frame(a), frame(LIST), frame(a));
    assert.equal(result.conflicts.length, 1);
    assert.equal(result.merged?.withheldReason, "frame_conflict");
    // Names that score the same don't stop the score (ethanolamine and triethanolamine are both -15).
    const same = merge(frame(LIST.replace("Triethanolamine", "Ethanolamine")), frame(LIST));
    assert.equal(same.conflicts.length, 1);
    assert.equal(same.merged?.scoring?.cleanScore, 80);
  });
});

describe("live scan evidence (slices of the list)", () => {
  const evidence = (text: string): FrameInput => ({ ...frame(text), role: "evidence" });

  it("lets a slice from the middle of the list confirm a misread by an exact read", () => {
    const rebuilt = LIST.replace("Phenoxyethanol", "Phenoxyethnl");
    const result = merge(frame(rebuilt), evidence("Sorbitol, Phenoxyethanol, Carbomer"));
    assert.deepEqual(result.corrections.map((c) => [c.read, c.names[0], c.frames]), [["Phenoxyethnl", "phenoxyethanol", [1]]]);
    assert.equal(result.merged?.scoring?.cleanScore, 80);
  });

  it("never makes a slice the base, even one read perfectly", () => {
    const result = merge(frame(LIST.replace("Inulin", "Inuin")), evidence("Aqua, Glycerin, Sorbitol"));
    assert.equal(result.base, 0);
    assert.equal(result.merged?.detected, 11);
    assert.equal(merge(evidence(LIST)).merged, null);
  });

  it("leaves a misread no slice read exactly as an unknown", () => {
    const rebuilt = LIST.replace("Triethanolamine", "Iriethanolamine");
    const result = merge(frame(rebuilt), evidence("Carbomer, Iriethanolamine, Parfum"), evidence("Sorbitol, Phenoxyethanol"));
    assert.equal(result.corrections.length, 0);
    assert.equal(result.merged?.withheldReason, "uncertain_flagged");
  });
});

describe("multi-frame merge on real shots (consecutive shots grouped in threes)", () => {
  const analyze = fixtureAnalyzer(fixture);
  const label = new Set(fixture.label!.map(inciKey));
  const upright = fixture.shots.filter((shot) => (shot as { orientation?: string }).orientation !== "upside-down" && !shot.id.includes("shaken"));
  const groups = Array.from({ length: Math.floor(upright.length / 3) }, (_, i) => upright.slice(i * 3, i * 3 + 3));
  const results = groups.map((group) => ({
    single: group[0].text ? analyze(group[0].text).scoring : null,
    multi: merge(...group.map((shot) => frame(shot.text ?? "", shot.status))).merged,
  }));

  it("accepts more shots than single-frame reading", () => {
    const single = results.filter((r) => r.single).length;
    const multi = results.filter((r) => r.multi?.scoring).length;
    assert.ok(multi > single, `multi ${multi} vs single ${single}`);
  });

  it("gives every accepted shot the product's score, with no wrong or lost ingredient", () => {
    for (const { multi } of results) {
      if (!multi?.scoring) continue;
      assert.equal(multi.scoring.cleanScore, 80);
      for (const item of multi.ingredients) if (item.matchedName) assert.ok(label.has(inciKey(item.matchedName)), item.matchedName);
      const traced = new Set(multi.ingredients.map((i) => inciKey(i.matchedName ?? i.nearest ?? "")));
      assert.deepEqual([...label].filter((name) => !traced.has(name)), []);
    }
  });
});
