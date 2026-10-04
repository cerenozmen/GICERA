import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzePhotoIngredients, buildVocabulary, inciKey } from "../services/ingredientCoverage";
import { ScoringResult } from "../types/product";
import { COMMON_NAMES } from "./commonNames";

describe("COMMON_NAMES", () => {
  it("maps each common name to a different name, once", () => {
    const keys = Object.keys(COMMON_NAMES).map(inciKey);
    assert.equal(new Set(keys).size, keys.length);
    for (const [common, inci] of Object.entries(COMMON_NAMES)) assert.notEqual(inciKey(common), inciKey(inci), common);
  });

  it("does not map the INCI names BHA or AHA", () => {
    assert.equal(COMMON_NAMES["BHA"], undefined);
    assert.equal(COMMON_NAMES["AHA"], undefined);
  });

  it("reads a common name as its INCI name, scored and flagged as it", () => {
    const vocabulary = buildVocabulary(["Aqua", "Tocopherol", "Retinol", "Glycerin"], ["retinol"], COMMON_NAMES);
    assert.ok(vocabulary.flagged.has(inciKey("Vitamin A")));
    assert.ok(!vocabulary.flagged.has(inciKey("Vitamin E")));

    const score = (names: string[]): ScoringResult => {
      const unsafe = names.includes("retinol");
      return { cleanScore: unsafe ? 90 : 100, cleanRating: "clean", pregnancySafe: !unsafe, flaggedIngredients: [] };
    };
    const analysis = analyzePhotoIngredients(["Water", "Glycerine", "Vitamin E", "Vitamin A"], vocabulary, score);
    assert.deepEqual(analysis.ingredients.map((i) => i.matchedName), ["aqua", "glycerin", "tocopherol", "retinol"]);
    assert.equal(analysis.scoring?.pregnancySafe, false);
  });

  it("skips a common name whose INCI name the inventory doesn't list", () => {
    const vocabulary = buildVocabulary(["Aqua"], [], { "Vitamin E": "Tocopherol" });
    assert.equal(vocabulary.known.has(inciKey("Vitamin E")), false);
  });
});
