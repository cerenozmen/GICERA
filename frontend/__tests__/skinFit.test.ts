import { skinFit } from "../src/skinFit";
import type { SkinProfile } from "../src/storage";

// (storage.ts loads AsyncStorage, a native module: the empty profile is spelled out here.)
const EMPTY_PROFILE: SkinProfile = {
  skinType: null,
  concerns: [],
  reactionFrequency: null,
  sunBurns: null,
  ageRange: null,
  routineLevel: null,
  pregnant: null,
  skinCondition: null,
};

const LIST = ["Aqua", "Glycerin", "Parfum", "Linalool", "Alcohol Denat.", "Panthenol", "Cocos Nucifera Oil", "Niacinamide", "Sodium Laureth Sulfate"];

describe("skinFit", () => {
  it("is null without a skin type (quiz not taken)", () => {
    expect(skinFit(null, LIST)).toBeNull();
    expect(skinFit(EMPTY_PROFILE, LIST)).toBeNull();
  });

  it("sensitive skin: fragrance, its allergens and alcohol to watch; soothing ingredients help", () => {
    const fit = skinFit({ ...EMPTY_PROFILE, skinType: "Hassas" }, LIST)!;
    expect(fit.basis).toEqual(["Cildin hassas"]);
    expect(fit.avoid.map((i) => i.name)).toEqual(["Parfum", "Linalool", "Alcohol Denat."]);
    expect(fit.good.map((i) => i.name)).toEqual(["Panthenol"]);
  });

  it("dry skin: alcohol and harsh cleansers to watch; humectants help", () => {
    const fit = skinFit({ ...EMPTY_PROFILE, skinType: "Kuru" }, LIST)!;
    expect(fit.avoid.map((i) => i.group)).toEqual(["Alkol", "Sert temizleyici"]);
    expect(fit.good.map((i) => i.name)).toEqual(["Glycerin", "Panthenol"]);
  });

  it("oily skin with acne: pore-clogging oils to watch; niacinamide helps", () => {
    const fit = skinFit({ ...EMPTY_PROFILE, skinType: "Yağlı", concerns: ["Akne ve sivilce"] }, LIST)!;
    expect(fit.basis).toEqual(["Cildin yağlı", "Akne ve sivilce"]);
    expect(fit.avoid).toEqual([{ name: "Cocos Nucifera Oil", group: "Gözenek tıkayabilir" }]);
    expect(fit.good.map((i) => i.name)).toContain("Niacinamide");
  });

  it("a frequently reacting skin of another type also watches fragrance", () => {
    const fit = skinFit({ ...EMPTY_PROFILE, skinType: "Normal", reactionFrequency: "Sık sık" }, LIST)!;
    expect(fit.avoid.map((i) => i.name)).toEqual(["Parfum", "Linalool"]);
  });
});
