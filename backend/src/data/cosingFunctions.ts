/**
 * CosIng's function names (cosing_ingredients.function, comma-separated) as short Turkish tags for the
 * ingredient list. Informative only: they never change the score. Functions with no useful meaning to a
 * shopper (NOT REPORTED, ORAL CARE, ...) and the import's stray fragments are left out.
 */
export const FUNCTION_TAGS: Readonly<Record<string, string>> = {
  "SKIN CONDITIONING": "Cilt bakımı",
  SURFACTANT: "Temizleyici",
  CLEANSING: "Temizleyici",
  PERFUMING: "Parfüm",
  "HAIR CONDITIONING": "Saç bakımı",
  EMOLLIENT: "Yumuşatıcı",
  EMULSIFYING: "Kıvam verici",
  "EMULSION STABILISING": "Kıvam verici",
  ANTIOXIDANT: "Antioksidan",
  "SKIN PROTECTING": "Cilt koruyucu",
  HUMECTANT: "Nem tutucu",
  MOISTURISING: "Nemlendirici",
  "VISCOSITY CONTROLLING": "Kıvam verici",
  "GEL FORMING": "Kıvam verici",
  MASKING: "Koku maskeleyici",
  ANTISTATIC: "Antistatik",
  "FILM FORMING": "Film oluşturucu",
  ANTIMICROBIAL: "Antimikrobiyal",
  PRESERVATIVE: "Koruyucu",
  SOLVENT: "Çözücü",
  ASTRINGENT: "Gözenek sıkılaştırıcı",
  BINDING: "Bağlayıcı",
  "FOAM BOOSTING": "Köpürtücü",
  FOAMING: "Köpürtücü",
  ABRASIVE: "Aşındırıcı",
  TONIC: "Tonik",
  "HAIR DYEING": "Saç boyası",
  "COSMETIC COLORANT": "Renklendirici",
  "HAIR FIXING": "Saç şekillendirici",
  BLEACHING: "Ağartıcı",
  OPACIFYING: "Opaklaştırıcı",
  PEARLESCENT: "Parlaklık verici",
  BUFFERING: "pH düzenleyici",
  BULKING: "Dolgu maddesi",
  HYDROTROPE: "Çözünürlük artırıcı",
  "UV ABSORBER": "UV koruyucu",
  "UV FILTER": "Güneş filtresi",
  DEODORANT: "Deodorant",
  ANTIPERSPIRANT: "Ter önleyici",
  ABSORBENT: "Emici",
  CHELATING: "Stabilizan",
  STABILISING: "Stabilizan",
  PLASTICISER: "Esneklik verici",
  SOOTHING: "Yatıştırıcı",
  REFRESHING: "Ferahlatıcı",
  SMOOTHING: "Pürüzsüzleştirici",
  ANTISEBORRHOEIC: "Sebum dengeleyici",
  ANTIDANDRUFF: "Kepek önleyici",
  ANTICAKING: "Topaklanma önleyici",
  ANTIFOAMING: "Köpük önleyici",
  FLAVOURING: "Aroma",
  "NAIL CONDITIONING": "Tırnak bakımı",
  REDUCING: "İndirgeyici",
  OXIDISING: "Oksitleyici",
  "HAIR WAVING OR STRAIGHTENING": "Saç şekillendirici",
  DETANGLING: "Tarama kolaylaştırıcı",
  DEPILATORY: "Tüy dökücü",
  KERATOLYTIC: "Peeling etkili",
  REFATTING: "Yağ dengeleyici",
  DENATURANT: "Denatüre edici",
  PROPELLANT: "İtici gaz",
  ANTICORROSIVE: "Korozyon önleyici",
  TANNING: "Bronzlaştırıcı",
  "ORAL CARE": "Ağız bakımı",
  ANTIPLAQUE: "Ağız bakımı",
};

/**
 * The order tags are shown in: what matters to a shopper first. CosIng lists functions alphabetically
 * (glycerin: "DENATURANT, HAIR CONDITIONING, HUMECTANT, ..."), which would put the least telling first.
 */
const PRIORITY = [
  "Koruyucu", "Güneş filtresi", "UV koruyucu", "Nem tutucu", "Nemlendirici", "Yatıştırıcı", "Antioksidan", "Peeling etkili",
  "Yumuşatıcı", "Cilt koruyucu", "Sebum dengeleyici", "Gözenek sıkılaştırıcı", "Temizleyici", "Parfüm", "Renklendirici",
  "Antimikrobiyal", "Ağartıcı", "Bronzlaştırıcı", "Deodorant", "Ter önleyici", "Kepek önleyici", "Kıvam verici", "Çözücü",
  "Köpürtücü", "Bitki özü", "Aroma", "Film oluşturucu", "Pürüzsüzleştirici", "Ferahlatıcı", "Cilt bakımı", "Saç bakımı",
];
const rank = (tag: string) => {
  const i = PRIORITY.indexOf(tag);
  return i < 0 ? PRIORITY.length : i;
};

/** A CosIng function field as Turkish tags, most telling first, without repeats. */
export function functionTags(field: string | null | undefined): string[] {
  const tags: string[] = [];
  for (const part of (field ?? "").split(",")) {
    const tag = FUNCTION_TAGS[part.trim().toUpperCase()];
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  return tags.sort((a, b) => rank(a) - rank(b));
}

/** Tags of several names (an ingredient matched more than one way), most telling first, without repeats. */
export function mergeTags(lists: string[][]): string[] {
  return [...new Set(lists.flat())].sort((a, b) => rank(a) - rank(b));
}

/**
 * Tags from the name alone, for a row no CosIng entry describes (a colour index, a plant oil or extract
 * under a name CosIng spells otherwise). Coarse but true for what each pattern names.
 */
const NAME_TAGS: [RegExp, string][] = [
  [/\bci\s?\d{5}\b|\b(yellow|red|blue|green|orange|black|violet|brown)\s?(no\.?\s?)?\d+\b|\bf?d&c\b|\blake\b|iron oxides?|\bmica\b|ultramarines?/i, "Renklendirici"],
  [/parf[uü]m|fragrance|perfume/i, "Parfüm"],
  [/\baroma\b|flavou?r/i, "Aroma"],
  [/paraben|benzoate|sorbate|phenoxyethanol|benzyl alcohol|chlorphenesin|hexanediol|caprylyl glycol/i, "Koruyucu"],
  [/tocopher|ascorb|vitamin\s?[ce]\b/i, "Antioksidan"],
  [/\b(aqua|water|eau|wasser|agua|acqua|su)\b|hydrosol|distillate/i, "Çözücü"],
  [/extract|ekstrakt|(?:^|\s)[öo]z[üu](?:$|\s)|\bpowder\b/i, "Bitki özü"],
  [/\b(oil|butter|wax|cera)\b|ya[gğ]ı?(?:$|\s)|squalane|triglyceride/i, "Yumuşatıcı"],
  [/glycerin|hyaluron|\burea\b|sodium pca|panthenol|\baloe\b/i, "Nem tutucu"],
  [/\b(sodium|ammonium)\s+(lauryl|laureth|coco|cocoyl|lauroyl)|glucoside|betaine\b|\bsulfate\b/i, "Temizleyici"],
  [/\bzinc oxide\b|titanium dioxide|methoxycinnamate|octocrylene|avobenzone|methoxydibenzoylmethane|salicylate\b/i, "Güneş filtresi"],
  [/\bacid\b|hydroxide\b|\bcitrate\b/i, "pH düzenleyici"],
  [/\bcolou?r(s|ings?)?\b/i, "Renklendirici"],
  [/fluoride|\bphosphate\b/i, "Ağız bakımı"],
  [/carrageenan|\bgum\b|cellulose|\bcarbomer\b|acrylamide|xanthan/i, "Kıvam verici"],
  [/\bclay\b|bentonite|kaolin/i, "Emici"],
  [/linal|citronel|limonene|geraniol|eugenol|coumarin|\bmenthol|mentolo/i, "Parfüm"],
];

export function tagsFromName(name: string): string[] {
  return mergeTags([NAME_TAGS.filter(([pattern]) => pattern.test(name)).map(([, tag]) => tag)]);
}
