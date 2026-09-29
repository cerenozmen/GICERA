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
});
