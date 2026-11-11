import { displayName } from "../src/displayName";

const custom = (productName: string, ingredientsText: string) =>
  ({ productName, brands: "Kendi içerik listem", product: { ingredientsText } as never });

describe("displayName", () => {
  it("keeps a readable product name", () => {
    expect(displayName({ productName: "JEONJU Tonik", brands: "Jeonju" })).toBe("JEONJU Tonik");
  });

  it("names a Cyrillic product after its brand", () => {
    expect(displayName({ productName: "Зубная паста серии Professional", brands: "Splat" })).toBe("Splat ürünü");
  });

  it("names an own scan after its first non-water ingredients", () => {
    expect(displayName(custom("Kendi taramam", "Aqua, Glycerin, Niacinamide, Parfum"))).toBe("Glycerin · Niacinamide içerikli ürün");
  });

  it("keeps a name the user typed for an own scan", () => {
    expect(displayName(custom("Gece kremim", "Aqua, Glycerin"))).toBe("Gece kremim");
  });
});

describe("displayName with a server-suggested name", () => {
  it("prefers it when the own name is unreadable", () => {
    expect(displayName({ productName: "Зубная паста", brands: "Splat", autoName: "Splat Diş Macunu" })).toBe("Splat Diş Macunu");
  });

  it("ignores it when the product has a readable name", () => {
    expect(displayName({ productName: "JEONJU Tonik", brands: "Jeonju", autoName: "Yüz Toniği" })).toBe("JEONJU Tonik");
  });
});

describe("placeholder names", () => {
  it("never shows a server name that just echoes the placeholder", () => {
    expect(displayName({ ...custom("Kendi taramam", "Aqua, Glycerin, Niacinamide"), autoName: "Kendi taramam Serum" })).toBe("Glycerin · Niacinamide içerikli ürün");
  });
});

describe("placeholder echoed in another case", () => {
  it("rejects 'Kendi Taramam Serum' too", () => {
    expect(displayName({ ...custom("Kendi taramam", "Aqua, Glycerin, Niacinamide"), autoName: "Kendi Taramam Serum" })).toBe("Glycerin · Niacinamide içerikli ürün");
  });
});
