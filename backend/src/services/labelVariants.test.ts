import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ScoringResult } from "../types/product";
import { analyzeFrames, FrameInput } from "./frameMerge";
import { analyzePhotoIngredients, buildVocabulary } from "./ingredientCoverage";
import { parseIngredientsText } from "./scoringService";

// Readings of a real eye cream tube (curved, small print): colour index names, a hydrate, and a ferment
// CosIng doesn't list. The vocabulary is the CosIng slice those names need, plus look-alike flagged names.
const vocabulary = buildVocabulary(
  ["aqua", "glycerin", "magnesium sulfate", "ci 77491", "ci 77492", "ci 77891", "titanium dioxide", "mica", "phenoxyethanol", "tocopherol"],
  ["morphine sulfate pentahydrate", "phenoxyethanol"]
);
const score = (names: string[]): ScoringResult => {
  const cleanScore = names.includes("phenoxyethanol") ? 95 : 100;
  return { cleanScore, cleanRating: "clean", pregnancySafe: true, flaggedIngredients: [] };
};
const analyze = (text: string) => analyzePhotoIngredients(parseIngredientsText(text), vocabulary, score);
const frame = (text: string, role: FrameInput["role"] = "complete"): FrameInput => ({ status: "ok", tokens: parseIngredientsText(text), role });

const TAIL = "Mica, Deinococcus Ferment Extract Filtrate, Tocopherol";
const LABEL =
  "Aqua, Glycerin, Magnesium Sulfate Heptahydrate, Titanium Dioxide (CI 77891), Iron Oxide CI 77492, Phenoxyethanol, Iron Oxide CI 77491, Mica, Deinococcus Ferment Extract Filtrate, Tocopherol";

describe("label spellings of inventory names", () => {
  it("matches a colour by its colour index, before or after its name, CI read as Cl or C|", () => {
    const analysis = analyze("Iron Oxide CI 77492, Iron Oxide Cl 77491, Iron Oxide C| 77491, CI 77891 Titanium Dioxide");
    assert.deepEqual(analysis.ingredients.map((i) => i.matchedName), ["ci 77492", "ci 77491", "ci 77491", "ci 77891"]);
  });

  it("matches a hydrate to its substance, not to a flagged name that ends alike", () => {
    const [item] = analyze("Magnesium Sulfate Heptahydrate").ingredients;
    assert.equal(item.matchedName, "magnesium sulfate");
    assert.equal(analyze("Magnesium Sulfate peptahydrate").ingredients[0].matchedName, "magnesium sulfate");
  });

  it("leaves an unknown colour index and a hydrate of an unknown substance unknown", () => {
    assert.ok(analyze("Iron Oxide CI 12345, Unobtainium Sulfate Monohydrate").ingredients.every((i) => i.status === "unknown"));
  });
});

describe("unknown hydrates judged by their substance", () => {
  it("takes a misread substance of a hydrate for a harmless one-letter misread, not for garbage", () => {
    const [item] = analyze("Magnesiumn Sulfate Heptahydrate").ingredients;
    assert.deepEqual([item.status, item.kind, item.nearest, item.distance], ["unknown", "resembles_safe", "magnesium sulfate", 1]);
  });

  it("still takes a misread flagged hydrate for a possible flagged one", () => {
    assert.equal(analyze("Morphime Sulfate Heptahydrate").ingredients[0].kind, "resembles_flagged");
  });
});

describe("one OCR confusion undone", () => {
  it("reads a flagged name misread by one confused letter as that name, with its penalty", () => {
    const [item] = analyze("Phenoxyethan0l").ingredients;
    assert.equal(item.matchedName, "phenoxyethanol");
  });

  it("drops a stray ! or : and resolves label spellings after it", () => {
    assert.equal(analyze("Magnesium! Sulfate Heptahydrate").ingredients[0].matchedName, "magnesium sulfate");
    assert.equal(analyze("Iron Oxide C: 77491").ingredients[0].status, "unknown");
    assert.equal(analyze("Glyc:erin").ingredients[0].matchedName, "glycerin");
  });

  it("leaves a reading with two confused letters unknown", () => {
    assert.equal(analyze("G1ycer1n").ingredients[0].status, "unknown");
  });
});

describe("unlisted: a name read the same in two frames that the inventory lacks", () => {
  it("withholds the score when only one frame read it", () => {
    const result = analyzeFrames([frame(LABEL)], vocabulary, score);
    assert.equal(result.merged?.withheldReason, "unrecognizable");
  });

  it("withholds the score when the only other reading is the evidence the list was built from", () => {
    const result = analyzeFrames([frame(LABEL), frame(TAIL, "evidence")], vocabulary, score);
    assert.equal(result.merged?.withheldReason, "unrecognizable");
  });

  it("scores the list when two evidence frames read it letter for letter", () => {
    const result = analyzeFrames([frame(LABEL), frame(TAIL, "evidence"), frame(`Iron Oxide CI 77491, ${TAIL}`, "evidence")], vocabulary, score);
    const unknown = result.merged!.ingredients.filter((i) => i.status === "unknown");
    assert.deepEqual(unknown.map((i) => `${i.text} ${i.kind}`), ["Deinococcus Ferment Extract Filtrate unlisted"]);
    assert.equal(result.merged?.scoring?.cleanScore, 95);
  });

  it("withholds the score when the second frame read it differently", () => {
    const result = analyzeFrames([frame(LABEL), frame(TAIL, "evidence"), frame(TAIL.replace("Deinococcus", "Deinococcvs"), "evidence")], vocabulary, score);
    assert.equal(result.merged?.scoring, null);
  });

  it("never makes a name that could be a flagged one unlisted, however often it is read", () => {
    const misread = LABEL.replace("Phenoxyethanol", "Phenoxyethnal");
    const result = analyzeFrames([frame(misread), frame(misread)], vocabulary, score);
    assert.equal(result.merged?.withheldReason, "uncertain_flagged");
  });

  it("corrects a garbled hydrate from another frame's reading of it", () => {
    const result = analyzeFrames(
      [frame(LABEL.replace("Magnesium Sulfate", "Magnesium! Sulfate")), frame("Glycerin, Magnesium Sulfate Heptahydrate, Titanium Dioxide", "evidence"), frame(TAIL, "evidence"), frame(`Iron Oxide CI 77491, ${TAIL}`, "evidence")],
      vocabulary,
      score
    );
    assert.equal(result.merged?.scoring?.cleanScore, 95);
  });
});

describe("unlisted: one new word among words of INCI names, read once", () => {
  const words = buildVocabulary(
    ["aqua", "lactobacillus ferment extract filtrate", "sodium sulfate", "triethanolamine", "micrococcus lysate"],
    ["triethanolamine", "sodium laureth sulfate"]
  );
  const read = (text: string) => analyzePhotoIngredients(parseIngredientsText(text), words, score);

  it("scores a list with a real name the inventory lacks, showing it as unknown", () => {
    const analysis = read("Aqua, Deinococcus Ferment Extract Filtrate");
    assert.equal(analysis.ingredients[1].kind, "unlisted");
    assert.equal(analysis.scoring?.cleanScore, 100);
  });

  it("withholds the score for garbage, a misread known word, two new words or a digit", () => {
    for (const text of ["yaledrdie", "Micrococus Ferment Extract Filtrate", "Deinococcus Qwertyzia Extract", "Deinococcus Ferment Extract F1ltrate", "Deinococcus Ferment"]) {
      assert.equal(read(`Aqua, ${text}`).scoring, null, text);
    }
  });

  it("withholds the score for names whose commas OCR lost, one of which could be flagged", () => {
    for (const text of ["Yaledrdie Sodium Sulfate", "Sodium Sulfate Triethanolamine Aqua", "Qwertzia Triethanolamine Sodium Sulfate"]) {
      assert.equal(read(`Aqua, ${text}`).scoring, null, text);
    }
  });

  it("never treats a reading close to a flagged name as unlisted", () => {
    assert.equal(read("Sodium Laureth Sulfxle").ingredients[0].kind, "resembles_flagged");
  });
});
