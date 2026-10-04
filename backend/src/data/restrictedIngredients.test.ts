import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { restrictedIngredientSeed } from "./restrictedIngredients";

describe("restrictedIngredientSeed", () => {
  it("does not treat the INCI name BHA as salicylic acid", () => {
    // In CosIng "BHA" is butylated hydroxyanisole (CAS 25013-16-5, antioxidant) and salicylic acid is
    // "SALICYLIC ACID" (CAS 69-72-7). The alias made every product with the antioxidant BHA "unsafe in
    // pregnancy". CosIng's annexes carry no restriction for BHA, so it must not match any seed entry.
    const matches = restrictedIngredientSeed.filter((entry) => entry.aliases.some((alias) => alias.toLowerCase() === "bha"));
    assert.deepEqual(matches, []);
  });

  it("maps UV filters' common label names to their CosIng (INCI) entries", () => {
    const entry = (alias: string) => restrictedIngredientSeed.find((e) => e.aliases.includes(alias))?.inciName;
    assert.equal(entry("avobenzone"), "BUTYL METHOXYDIBENZOYLMETHANE");
    assert.equal(entry("oxybenzone"), "BENZOPHENONE-3");
    assert.equal(entry("octisalate"), "ETHYLHEXYL SALICYLATE");
    assert.equal(entry("octinoxate"), "ETHYLHEXYL METHOXYCINNAMATE");
  });
});
