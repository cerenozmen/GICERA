import { avoidedHits, customKey, presetKey } from "../src/allergens";

const list = ["Aqua", "Glycerin", "Parfum", "Linalool", "Butyrospermum Parkii Butter", "Cocos Nucifera Oil"];

describe("avoidedHits", () => {
  it("finds nothing when the user avoids nothing", () => {
    expect(avoidedHits([], list)).toEqual([]);
  });

  it("matches a preset group by its patterns", () => {
    expect(avoidedHits([presetKey("fragrance")], list)).toEqual([{ name: "Parfum", label: "Parfüm" }]);
    expect(avoidedHits([presetKey("coconut")], list).map((h) => h.name)).toEqual(["Cocos Nucifera Oil"]);
  });

  it("matches the user's own word anywhere in the name, case-insensitively", () => {
    expect(avoidedHits([customKey("SHEA"), customKey("butyro")], list)).toEqual([{ name: "Butyrospermum Parkii Butter", label: "butyro" }]);
  });

  it("lists each ingredient once even when several entries match it", () => {
    expect(avoidedHits([presetKey("fragranceAllergens"), customKey("linalool")], list)).toHaveLength(1);
  });
});
