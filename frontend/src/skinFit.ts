import { lowerTr } from "./ingredients";
import type { SkinProfile } from "./storage";

/**
 * "Cildine uygunluk": which of a product's ingredients may not suit the user's skin (type, concerns, how
 * often it reacts) and which tend to help it. Guidance from well-known ingredient groups, kept apart from
 * the safety score (which is the same for everyone) and not a medical assessment.
 */

interface Group {
  label: string;
  pattern: RegExp;
}

const G = {
  fragrance: { label: "Parfüm", pattern: /parf[uü]m|fragrance|perfume|\baroma\b/ },
  allergens: {
    label: "Parfüm alerjeni",
    pattern: /linal(?:oo|o)l|limonene|citronell?ol|geraniol|eugenol|coumarin|cinnamal|citral\b|hexyl cinnamal|amyl cinnamal|benzyl (?:salicylate|benzoate|cinnamate)|farnesol|isoeugenol|hydroxycitronellal/,
  },
  essentialOils: { label: "Uçucu yağ", pattern: /(?:lavandula|citrus|mentha|eucalyptus|rosmarinus|melaleuca|cinnamomum|eugenia).*\boil\b|essential oil/ },
  alcohol: { label: "Alkol", pattern: /alcohol denat|\bsd alcohol|\bethanol\b|^alcohol$|^alkol$/ },
  menthol: { label: "Mentol", pattern: /menthol|mentolo|\bcamphor\b|peppermint/ },
  strongAcids: { label: "Güçlü asit (AHA)", pattern: /glycolic acid|lactic acid|mandelic acid/ },
  harshCleansers: { label: "Sert temizleyici", pattern: /sodium laur(?:yl|eth) sulfate|ammonium laur(?:yl|eth) sulfate|\bsls\b|\bsles\b/ },
  clay: { label: "Kil", pattern: /\bkaolin\b|bentonite|\bclay\b/ },
  comedogenic: {
    label: "Gözenek tıkayabilir",
    pattern: /cocos nucifera(?: \(coconut\))? oil|coconut oil|isopropyl (?:myristate|palmitate|isostearate)|myristyl myristate|\blanolin\b|theobroma cacao|cocoa butter|laureth-4|triticum vulgare(?: \(wheat\))? germ oil|wheat germ oil|algae extract/,
  },
  // Helpful
  soothing: { label: "Yatıştırıcı", pattern: /panthenol|allantoin|centella|madecassoside|asiaticoside|bisabolol|\baloe\b|avena|colloidal oatmeal|dipotassium glycyrrhizate/ },
  barrier: { label: "Bariyer onarıcı", pattern: /ceramide|cholesterol|phytosphingosine|squalane/ },
  humectant: { label: "Nem tutucu", pattern: /glycerin(?!e)|hyaluron|\burea\b|sodium pca|\bbetaine\b|panthenol/ },
  nourishing: { label: "Besleyici yağ", pattern: /butyrospermum|shea|squalane|jojoba|simmondsia/ },
  oilControl: { label: "Yağ dengeleyici", pattern: /niacinamide|salicylic acid|zinc (?:pca|gluconate|oxide)|melaleuca alternifolia/ },
  brightening: { label: "Ton eşitleyici", pattern: /niacinamide|ascorbic|ascorbyl|azelaic|tranexamic|arbutin|licorice|glycyrrhiza/ },
  antiAging: { label: "Yaşlanma karşıtı", pattern: /retinol|retinal\b|retinyl|bakuchiol|peptide|palmitoyl/ },
} satisfies Record<string, Group>;

interface Rule {
  /** Why the rule applies, as the section says it ("Cildin hassas"). */
  because: string;
  avoid: Group[];
  good: Group[];
}

function rulesFor(profile: SkinProfile): Rule[] {
  const rules: Rule[] = [];
  const reactive = profile.reactionFrequency === "Sık sık";
  switch (profile.skinType) {
    case "Hassas":
      rules.push({ because: "Cildin hassas", avoid: [G.fragrance, G.allergens, G.essentialOils, G.alcohol, G.menthol, G.strongAcids], good: [G.soothing, G.barrier] });
      break;
    case "Kuru":
      rules.push({ because: "Cildin kuru", avoid: [G.alcohol, G.harshCleansers, G.clay], good: [G.humectant, G.barrier, G.nourishing] });
      break;
    case "Yağlı":
      rules.push({ because: "Cildin yağlı", avoid: [G.comedogenic], good: [G.oilControl, G.humectant] });
      break;
    case "Karma":
      rules.push({ because: "Cildin karma", avoid: [G.comedogenic, G.alcohol], good: [G.oilControl, G.humectant] });
      break;
    case "Normal":
      rules.push({ because: "Cildin normal", avoid: [], good: [G.humectant, G.barrier] });
      break;
  }
  if (reactive && profile.skinType !== "Hassas") {
    rules.push({ because: "Cildin sık tepki veriyor", avoid: [G.fragrance, G.allergens, G.essentialOils], good: [G.soothing] });
  }
  const concerns = new Set(profile.concerns);
  if (concerns.has("Akne ve sivilce")) rules.push({ because: "Akne ve sivilce", avoid: [G.comedogenic], good: [G.oilControl] });
  if (concerns.has("Yağlanma") || concerns.has("Belirgin gözenek")) rules.push({ because: "Yağlanma ve gözenek", avoid: [G.comedogenic], good: [G.oilControl] });
  if (concerns.has("Kuruluk")) rules.push({ because: "Kuruluk", avoid: [G.alcohol, G.harshCleansers], good: [G.humectant, G.barrier] });
  if (concerns.has("Kızarıklık")) rules.push({ because: "Kızarıklık", avoid: [G.fragrance, G.alcohol, G.menthol], good: [G.soothing] });
  if (concerns.has("Leke ve ton eşitsizliği") || concerns.has("Matlık")) rules.push({ because: "Leke ve matlık", avoid: [], good: [G.brightening] });
  if (concerns.has("İnce çizgiler")) rules.push({ because: "İnce çizgiler", avoid: [], good: [G.antiAging, G.humectant] });
  return rules;
}

export interface FitItem {
  /** The ingredient as the list names it. */
  name: string;
  /** What it is, in the section's words ("Parfüm alerjeni"). */
  group: string;
}

export interface SkinFit {
  /** The profile facts the result rests on ("Cildin hassas", "Kızarıklık"). */
  basis: string[];
  avoid: FitItem[];
  good: FitItem[];
}

/** Null when there is no skin profile (the quiz wasn't taken). */
export function skinFit(profile: SkinProfile | null, ingredients: string[]): SkinFit | null {
  if (!profile?.skinType) return null;
  const rules = rulesFor(profile);
  const match = (pick: (rule: Rule) => Group[]) => {
    const items: FitItem[] = [];
    for (const name of ingredients) {
      const text = lowerTr(name);
      const group = rules.flatMap(pick).find((g) => g.pattern.test(text));
      if (group && !items.some((item) => item.name === name)) items.push({ name, group: group.label });
    }
    return items;
  };
  const avoid = match((rule) => rule.avoid);
  const good = match((rule) => rule.good).filter((item) => !avoid.some((a) => a.name === item.name));
  return { basis: [...new Set(rules.map((rule) => rule.because))], avoid, good };
}
