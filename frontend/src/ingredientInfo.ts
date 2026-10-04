import { lowerTr } from "./ingredients";

/**
 * What common cosmetic ingredients do, as short Turkish tags for the result screens. A plain lookup
 * by INCI name: informative only, it never changes the score (that comes from the server).
 */
const ROLES: [RegExp, string[]][] = [
  [/niacinamide/, ["Aydınlatıcı", "Ton eşitleyici"]],
  [/panthenol/, ["Yatıştırıcı", "Nemlendirici"]],
  [/(sodium )?hyaluron/, ["Nem tutucu"]],
  [/allantoin/, ["Yatıştırıcı", "Onarıcı"]],
  [/ceramide/, ["Cilt bariyerini güçlendirir"]],
  [/\bglycerin\b/, ["Nemlendirici"]], // not ethylhexylglycerin (a preservative booster)
  [/squalane/, ["Nemlendirici", "Bariyer destekleyici"]],
  [/sodium pca/, ["Nem tutucu"]],
  [/urea\b/, ["Nemlendirici"]],
  [/betaine/, ["Nemlendirici"]],
  [/centella|madecassoside|asiaticoside/, ["Yatıştırıcı"]],
  [/bisabolol/, ["Yatıştırıcı"]],
  [/aloe/, ["Yatıştırıcı", "Nemlendirici"]],
  [/dipotassium glycyrrhizate/, ["Yatıştırıcı"]],
  [/tocopherol/, ["Antioksidan"]],
  [/ascorbic|ascorbyl/, ["Antioksidan", "Aydınlatıcı"]],
  [/retinol|retinal\b|retinyl/, ["Yenileyici"]],
  [/salicylic/, ["Gözenek arındırıcı"]],
  [/glycolic|lactic acid|mandelic/, ["Peeling etkili"]],
  [/azelaic/, ["Ton eşitleyici"]],
  [/zinc oxide|titanium dioxide/, ["Güneş filtresi"]],
  [/peptide|palmitoyl/, ["Sıkılaştırıcı"]],
  [/shea|butyrospermum/, ["Besleyici"]],
  [/cholesterol/, ["Bariyer destekleyici"]],
  [/phytosphingosine/, ["Bariyer destekleyici"]],
  [/caprylic\/capric triglyceride|caprylic capric/, ["Yumuşatıcı"]],
  [/dimethicone|cyclopentasiloxane/, ["Yumuşatıcı"]],
  [/cetearyl alcohol|cetyl alcohol|stearyl alcohol/, ["Yumuşatıcı"]],
  [/phenoxyethanol|ethylhexylglycerin|paraben|sodium benzoate|potassium sorbate/, ["Koruyucu"]],
  [/parfum|fragrance/, ["Parfüm"]],
  [/^(aqua|water|eau)\b/, ["Çözücü"]],
];

const BENEFICIAL = new Set([
  "Aydınlatıcı", "Ton eşitleyici", "Yatıştırıcı", "Nemlendirici", "Nem tutucu", "Onarıcı", "Cilt bariyerini güçlendirir",
  "Bariyer destekleyici", "Antioksidan", "Yenileyici", "Sıkılaştırıcı", "Besleyici",
]);

export function ingredientRoles(name: string): string[] {
  const n = lowerTr(name);
  const roles: string[] = [];
  for (const [pattern, tags] of ROLES) {
    if (pattern.test(n)) for (const tag of tags) if (!roles.includes(tag)) roles.push(tag);
  }
  return roles;
}

export function isBeneficial(name: string): boolean {
  return ingredientRoles(name).some((r) => BENEFICIAL.has(r));
}
