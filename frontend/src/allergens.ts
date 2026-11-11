import { G } from "./skinFit";
import { lowerTr } from "./ingredients";

/** Ingredient groups a user can mark as "I avoid this", matched against the lower-cased INCI / label names. */
export const ALLERGEN_PRESETS: { key: string; label: string; pattern: RegExp }[] = [
  { key: "fragrance", label: "Parfüm", pattern: G.fragrance.pattern },
  { key: "fragranceAllergens", label: "Parfüm alerjenleri (linalool, limonene…)", pattern: G.allergens.pattern },
  { key: "essentialOils", label: "Uçucu yağlar", pattern: G.essentialOils.pattern },
  { key: "alcohol", label: "Alkol", pattern: G.alcohol.pattern },
  { key: "sulfates", label: "Sülfatlar (SLS, SLES)", pattern: G.harshCleansers.pattern },
  { key: "parabens", label: "Paraben", pattern: /paraben/ },
  { key: "silicones", label: "Silikonlar", pattern: /dimethicone|methicone|siloxane|silicone/ },
  { key: "mineralOil", label: "Mineral yağ / petrolatum", pattern: /paraffinum liquidum|mineral oil|petrolatum|\bparaffin\b/ },
  { key: "formaldehyde", label: "Formaldehit salıcılar", pattern: /dmdm hydantoin|quaternium-15|diazolidinyl urea|imidazolidinyl urea|bronopol|formaldehyde/ },
  { key: "salicylates", label: "Salisilatlar", pattern: /salicylic acid|salicylate/ },
  { key: "lanolin", label: "Lanolin", pattern: /lanolin/ },
  { key: "coconut", label: "Hindistan cevizi", pattern: /cocos|coco-|coconut/ },
  { key: "nuts", label: "Kuruyemiş (badem, fıstık, fındık…)", pattern: /prunus amygdalus|arachis|corylus|juglans|macadamia|almond|peanut|hazelnut|walnut/ },
  { key: "gluten", label: "Gluten (buğday, arpa, çavdar)", pattern: /triticum|hordeum|secale|wheat|barley|\brye\b/ },
  { key: "soy", label: "Soya", pattern: /glycine soja|\bsoy/ },
  { key: "dairy", label: "Süt ürünleri", pattern: /\blac\b|\bmilk\b|lactose|casein|\bwhey\b/ },
  { key: "bee", label: "Bal ve arı ürünleri", pattern: /propolis|\bmel\b|honey|royal jelly|beeswax|cera alba|\bapis\b/ },
];

const PRESET = "p:";
const CUSTOM = "c:";

export const presetKey = (key: string) => PRESET + key;
export const customKey = (text: string) => CUSTOM + text.trim();

/** The user's own typed entries (without the storage prefix). */
export const customEntries = (avoided: string[]) => avoided.filter((a) => a.startsWith(CUSTOM)).map((a) => a.slice(CUSTOM.length));

export interface AvoidedHit {
  /** The ingredient as the list names it. */
  name: string;
  /** Why it matched: the group's label or the user's own word. */
  label: string;
}

/** Which of a product's ingredients the user said they avoid. */
export function avoidedHits(avoided: string[], ingredients: string[]): AvoidedHit[] {
  if (avoided.length === 0) return [];
  const rules: { label: string; test: (text: string) => boolean }[] = [];
  for (const entry of avoided) {
    if (entry.startsWith(PRESET)) {
      const preset = ALLERGEN_PRESETS.find((p) => p.key === entry.slice(PRESET.length));
      if (preset) rules.push({ label: preset.label, test: (text) => preset.pattern.test(text) });
    } else if (entry.startsWith(CUSTOM)) {
      const word = lowerTr(entry.slice(CUSTOM.length)).trim();
      if (word) rules.push({ label: entry.slice(CUSTOM.length).trim(), test: (text) => text.includes(word) });
    }
  }
  const hits: AvoidedHit[] = [];
  for (const name of ingredients) {
    const text = lowerTr(name);
    const rule = rules.find((r) => r.test(text));
    if (rule && !hits.some((h) => h.name === name)) hits.push({ name, label: rule.label });
  }
  return hits;
}
