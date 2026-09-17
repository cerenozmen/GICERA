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
    inciName: "retinol",
    aliases: ["retinol", "retinyl palmitate", "retinyl acetate", "tretinoin"],
    restrictionType: "pregnancy_unsafe",
    notes: "A vitamini türevleri hamilelikte önerilmez.",
  },
  {
    inciName: "salicylic acid",
    aliases: ["salicylic acid", "bha"],
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
