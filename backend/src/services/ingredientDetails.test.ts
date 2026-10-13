import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { functionTags, tagsFromName } from "../data/cosingFunctions";
import { placeFlagged, rowVariants } from "./ingredientDetails";

describe("placeFlagged: every flagged substance on the product screen marks one row", () => {
  it("ties a substance to the row the scoring read as it, whatever the row's spelling", () => {
    const texts = ["Aqua", "Parfum (Fragrance)", "Sodyum Benzoat"];
    const readings = [
      { names: ["AQUA"], flags: [] },
      { names: ["PARFUM"], flags: ["Parfum"] },
      { names: ["SODIUM BENZOATE"], flags: ["Sodium Benzoate"] },
    ];
    const { flagged, unplaced } = placeFlagged(texts, readings, ["Parfum", "Sodium Benzoate"]);
    assert.deepEqual(flagged, [[], ["Parfum"], ["Sodium Benzoate"]]);
    assert.deepEqual(unplaced, []);
  });

  it("counts a substance listed twice (two restriction types) once", () => {
    const readings = [{ names: ["RETINOL"], flags: ["Retinol", "Retinol"] }];
    assert.deepEqual(placeFlagged(["Retinol"], readings, ["Retinol", "Retinol"]).flagged, [["Retinol"]]);
  });

  it("falls back to a row whose text holds the name, and reports what no row holds", () => {
    const readings = [{ names: [], flags: [] }, { names: [], flags: [] }];
    const { flagged, unplaced } = placeFlagged(["Aqua", "Methylparaben 0.2%"], readings, ["Methylparaben", "Triclosan"]);
    assert.deepEqual(flagged, [[], ["Methylparaben"]]);
    assert.deepEqual(unplaced, ["Triclosan"]);
  });
});

describe("functionTags", () => {
  it("translates CosIng functions, drops unknown parts and repeats", () => {
    assert.deepEqual(functionTags("PRESERVATIVE"), ["Koruyucu"]);
    assert.deepEqual(functionTags("SURFACTANT, CLEANSING, FOAMING"), ["Temizleyici", "Köpürtücü"]);
    assert.deepEqual(functionTags("DENATURANT, HAIR CONDITIONING, HUMECTANT").slice(0, 1), ["Nem tutucu"]);
    assert.deepEqual(functionTags("NOT REPORTED, 2"), []);
    assert.deepEqual(functionTags(null), []);
  });
});

describe("rowVariants", () => {
  it("drops brackets, headings and footnote marks, and tries each slash-separated name", () => {
    assert.deepEqual(rowVariants("Aqua/Water/Eau"), ["Aqua/Water/Eau", "Aqua", "Water", "Eau"]);
    assert.deepEqual(rowVariants("Ingredients: Cera Alba*"), ["Cera Alba"]);
    assert.deepEqual(rowVariants("Titanium Dioxide (CI 77891)"), ["Titanium Dioxide"]);
    assert.deepEqual(rowVariants("1,2-Hexanediol"), ["1,2-Hexanediol"]);
  });
});

describe("tagsFromName", () => {
  it("names what a colour, a fragrance, a plant oil or extract is", () => {
    assert.deepEqual(tagsFromName("Yellow 5 (CI 19140)"), ["Renklendirici"]);
    assert.deepEqual(tagsFromName("Parfum/Fragrance"), ["Parfüm"]);
    assert.deepEqual(tagsFromName("Mauritia Hexuosa Fruit Oil"), ["Yumuşatıcı"]);
    assert.deepEqual(tagsFromName("Aloe Vera Extract"), ["Nem tutucu", "Bitki özü"]);
    assert.deepEqual(tagsFromName("Croydon"), []);
  });
});
