import { RestrictionType } from "../types/product";

export interface RestrictedIngredientSeed {
  inciName: string;
  aliases: string[];
  restrictionType: RestrictionType;
  notes: string;
}

/**
 * Seed list only. This stands in for the full CosIng "prohibited/restricted
 * substances" export until that dataset is imported into the
 * `restricted_substances` table (see database/migrations). Matching is done
 * on lowercased INCI name / aliases.
 */
export const restrictedIngredientSeed: RestrictedIngredientSeed[] = [
  {
    inciName: "hydroquinone",
    aliases: ["hydroquinone"],
    restrictionType: "banned",
    notes: "AB kozmetik tüzüğünde reçetesiz ürünlerde yasak (cilt lekesi tedavisi hariç).",
  },
  {
    inciName: "formaldehyde",
    aliases: ["formaldehyde", "formalin"],
    restrictionType: "banned",
    notes: "Kanserojen etkisi nedeniyle kozmetikte serbest formaldehit yasak/sınırlı.",
  },
  {
    inciName: "triclosan",
    aliases: ["triclosan"],
    restrictionType: "restricted",
    notes: "Belirli ürün tiplerinde ve konsantrasyonlarda kullanımına izin verilir.",
  },
  {
    inciName: "bht",
    aliases: ["bht", "butylated hydroxytoluene"],
    restrictionType: "controversial",
    notes: "Endokrin bozucu şüphesiyle tartışmalı, düşük konsantrasyonda izinli.",
  },
  {
    inciName: "phenoxyethanol",
    aliases: ["phenoxyethanol"],
    restrictionType: "restricted",
    notes: "AB'de %1 ile sınırlı koruyucu.",
  },
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
    inciName: "hydroquinone (pregnancy)",
    aliases: ["hydroquinone"],
    restrictionType: "pregnancy_unsafe",
    notes: "Hamilelikte kullanımı önerilmez.",
  },
  {
    inciName: "essential oil - camphor",
    aliases: ["camphor"],
    restrictionType: "pregnancy_unsafe",
    notes: "Bazı uçucu yağlar hamilelikte kaçınılması önerilen bileşenlerdir.",
  },
  {
    inciName: "octinoxate",
    aliases: ["octinoxate", "ethylhexyl methoxycinnamate"],
    restrictionType: "controversial",
    notes: "Endokrin bozucu şüphesi olan kimyasal güneş filtresi.",
  },
  {
    inciName: "oxybenzone",
    aliases: ["oxybenzone", "benzophenone-3"],
    restrictionType: "controversial",
    notes: "Endokrin bozucu şüphesi olan kimyasal güneş filtresi.",
  },
  {
    inciName: "diethyl phthalate",
    aliases: ["diethyl phthalate", "dep"],
    restrictionType: "restricted",
    notes: "Ftalat grubu, bazı pazarlarda kısıtlı.",
  },
  {
    inciName: "toluene",
    aliases: ["toluene"],
    restrictionType: "banned",
    notes: "Kozmetikte (tırnak ürünleri dışında sınırlı istisnalarla) yasak/ağır kısıtlı.",
  },
  {
    inciName: "coal tar",
    aliases: ["coal tar", "ci 77266"],
    restrictionType: "banned",
    notes: "Kanserojen şüphesiyle AB'de kozmetik kullanımı yasak.",
  },
];
