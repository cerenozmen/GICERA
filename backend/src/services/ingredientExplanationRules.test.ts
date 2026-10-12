import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { explanationFromReply, normalizeIngredientName } from "./ingredientExplanationRules";

describe("normalizeIngredientName", () => {
  it("matches the same name regardless of case and spaces", () => {
    assert.equal(normalizeIngredientName("Sodyum Benzoat"), "sodyum benzoat");
    assert.equal(normalizeIngredientName("  sodyum   benzoat "), "sodyum benzoat");
    assert.equal(normalizeIngredientName("SODIUM BENZOATE"), normalizeIngredientName("Sodium Benzoate"));
  });

  it("folds Turkish İ to i", () => {
    assert.equal(normalizeIngredientName("GLİSERİN"), "gliserin");
  });
});

describe("explanationFromReply", () => {
  it("keeps a real explanation, trimmed", () => {
    assert.equal(explanationFromReply("  Koruyucudur.\n"), "Koruyucudur.");
  });

  it("drops empty and unrecognised answers", () => {
    assert.equal(explanationFromReply(""), null);
    assert.equal(explanationFromReply(null), null);
    assert.equal(explanationFromReply("BILINMIYOR"), null);
    assert.equal(explanationFromReply("BİLİNMİYOR"), null);
    assert.equal(explanationFromReply("Bilinmiyor."), null);
  });
});
