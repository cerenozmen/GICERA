import { RestrictionType } from "../types/product";

export interface RestrictedIngredientSeed {
  inciName: string;
  aliases: string[];
  restrictionType: RestrictionType;
  notes: string;
}

/**
 * Hand-curated additions merged on top of the CosIng-derived
 * `restricted_substances` table (see backend/src/scripts/importCosing.ts).
 * CosIng's Annexes cover banned/restricted/regulated substances but not
 * pregnancy-specific guidance, so that category is maintained here instead.
 */
export const restrictedIngredientSeed: RestrictedIngredientSeed[] = [
  {
    // The old INCI name and the common name of the same UV filter, still printed on labels (a real
    // sunscreen, Oct 2026: "OCTYL METHOXY-/CINNAMATE"). Same entry as CosIng's row for it.
    inciName: "ETHYLHEXYL METHOXYCINNAMATE",
    aliases: ["octyl methoxycinnamate", "octinoxate"],
    restrictionType: "controversial",
    notes: "AB Kozmetik Tüzüğü Ek VI (UV filtresi - düzenlemeye tabi). Maksimum konsantrasyon: 10%",
  },
  // Common (US) names of UV filters printed on labels instead of the INCI name (a real sunscreen,
  // Oct 2026: "AVOBENZONE", which without this resembled azobenzene, a banned substance). Each joins
  // CosIng's entry for that filter.
  {
    inciName: "BUTYL METHOXYDIBENZOYLMETHANE",
    aliases: ["avobenzone"],
    restrictionType: "controversial",
    notes: "AB Kozmetik Tüzüğü Ek VI (UV filtresi - düzenlemeye tabi). Maksimum konsantrasyon: 5%",
  },
  {
    inciName: "BENZOPHENONE-3",
    aliases: ["oxybenzone"],
    restrictionType: "controversial",
    notes: "AB Kozmetik Tüzüğü Ek VI (UV filtresi - düzenlemeye tabi). Maksimum konsantrasyon: 10%. Kullanım koşulları: Contains Benzophenone -3 (1)",
  },
  {
    inciName: "ETHYLHEXYL SALICYLATE",
    aliases: ["octisalate"],
    restrictionType: "controversial",
    notes: "AB Kozmetik Tüzüğü Ek VI (UV filtresi - düzenlemeye tabi). Maksimum konsantrasyon: 5%",
  },
  {
    inciName: "retinol",
    aliases: ["retinol", "retinyl palmitate", "retinyl acetate", "tretinoin"],
    restrictionType: "pregnancy_unsafe",
    notes: "A vitamini türevleri hamilelikte önerilmez.",
  },
  {
    inciName: "salicylic acid",
    // Not "bha": skincare marketing uses "BHA" for beta hydroxy acid, but on an ingredient list "BHA"
    // is its own INCI name, butylated hydroxyanisole (CosIng: CAS 25013-16-5, antioxidant).
    aliases: ["salicylic acid"],
    restrictionType: "pregnancy_unsafe",
    notes: "Yüksek konsantrasyonlarda (durulanmayan ürünlerde) hamilelikte kaçınılması önerilir.",
  },
  {
    inciName: "hydroquinone",
    aliases: ["hydroquinone"],
    restrictionType: "pregnancy_unsafe",
    notes: "Hamilelikte kullanımı önerilmez.",
  },
  {
    inciName: "camphor",
    aliases: ["camphor"],
    restrictionType: "pregnancy_unsafe",
    notes: "Bazı uçucu yağlar hamilelikte kaçınılması önerilen bileşenlerdir.",
  },
];
