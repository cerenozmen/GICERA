import { Product } from "./types";

/** Comma/semicolon split that ignores separators inside parentheses (mirrors the backend tokenizer). */
export function parseIngredients(text: string | null | undefined): string[] {
  if (!text) return [];
  const tokens: string[] = [];
  let current = "";
  let depth = 0;
  for (const char of text) {
    if (char === "(") depth++;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if ((char === "," || char === ";") && depth === 0) {
      tokens.push(current.trim());
      current = "";
    } else if (depth === 0) current += char;
  }
  tokens.push(current.trim());
  return tokens.map((t) => t.replace(/\s+/g, " ")).filter((t) => t.length > 0);
}

export interface FreeFromCheck {
  label: string;
  free: boolean;
}

// Rough keyword screen over the declared ingredient list, not a regulatory judgement.
const CHECKS: { label: string; test: (token: string) => boolean }[] = [
  { label: "Paraben", test: (t) => t.includes("paraben") },
  { label: "Sülfat", test: (t) => /(lauryl|laureth|coco|myreth)[\s-]*sul(ph|f)ate/.test(t) },
  { label: "Silikon", test: (t) => /(dimethicone|siloxane|silicone|methicone)/.test(t) },
  { label: "Alkol", test: (t) => /^(alcohol( denat\.?)?|ethanol|sd alcohol.*|isopropyl alcohol)$/.test(t) },
];

export function freeFromChecks(product: Product): FreeFromCheck[] {
  const tokens = parseIngredients(product.ingredientsText).map((t) => t.toLowerCase());
  return CHECKS.map((check) => ({ label: check.label, free: !tokens.some(check.test) }));
}

export function summaryText(product: Product): string {
  const flagged = product.flaggedIngredients.length;
  const pregnancy =
    product.pregnancySafe === false
      ? " Hamilelik döneminde kaçınılması önerilen içerikler barındırıyor."
      : " Hamilelik döneminde kullanımı için işaretlenmiş bir içerik bulunmuyor.";
  switch (product.cleanRating) {
    case "clean":
      return `İçeriği genel olarak güvenli ve temiz kabul ediliyor.${pregnancy}`;
    case "moderate":
      return `İçeriğinde dikkat edilmesi gereken ${flagged} madde var.${pregnancy}`;
    case "riskli":
      return `İçeriğinde ${flagged} riskli veya kısıtlı madde tespit edildi.${pregnancy}`;
    default:
      return "Bu ürün için analiz yapılamadı.";
  }
}
