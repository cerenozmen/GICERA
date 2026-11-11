import { parseIngredients } from "./ingredients";
import { ProductSnapshot } from "./storage";

const NON_LATIN = /[^\u0000-ɏḀ-ỿ\s\d\p{P}\p{S}]/u;
const WATER_LIKE = /^(aqua|water|eau|su|agua)(\b|\s*\()/i;

/** Names of an own-list scan before the app began naming them. */
const GENERIC_SCAN = /^(Kendi taramam|İçerik taraması)/i;

/** The product's own name, or null when it is only a placeholder ("Kendi taramam") that must not be sent to the server as a name. */
export function realName(name: string | null | undefined): string | null {
  const trimmed = name?.trim() ?? "";
  return trimmed && !GENERIC_SCAN.test(trimmed) ? trimmed : null;
}

/** A server-suggested name that is just the placeholder echoed back is no name at all. */
export function usableAutoName(autoName: string | undefined): string | undefined {
  return autoName && !GENERIC_SCAN.test(autoName) ? autoName : undefined;
}

function titleCase(text: string): string {
  return text.charAt(0).toLocaleUpperCase("tr") + text.slice(1).toLocaleLowerCase("tr");
}

/** An own-list scan named after the first ingredients that say what it is (water and the like say nothing). */
function nameFromIngredients(text: string | null | undefined): string | null {
  const picks = parseIngredients(text)
    .filter((name) => !WATER_LIKE.test(name.trim()))
    .slice(0, 2)
    .map((name) => titleCase(name.replace(/\s*\(.*?\)\s*/g, " ").trim()));
  return picks.length ? `${picks.join(" · ")} içerikli ürün` : null;
}

/** Whether the scan's own name says nothing here: unreadable script, missing, or an own-list placeholder. */
export function needsAutoName(item: Pick<ProductSnapshot, "productName" | "product">): boolean {
  const name = item.productName?.trim() ?? "";
  return !name || NON_LATIN.test(name) || (!!item.product && GENERIC_SCAN.test(name));
}

/**
 * What the history shows for a scan: the product's own name, unless it is unreadable here (Cyrillic,
 * Korean … names from the open database) or a placeholder, in which case the brand or the
 * ingredients name it.
 */
export function displayName(item: Pick<ProductSnapshot, "productName" | "brands" | "product" | "autoName">): string {
  const name = item.productName?.trim() ?? "";
  const auto = usableAutoName(item.autoName);
  if (auto && needsAutoName(item)) return auto;
  if (item.product && (!name || GENERIC_SCAN.test(name))) {
    return nameFromIngredients(item.product.ingredientsText) ?? "İçerik taraması";
  }
  if (!name) return item.brands && !NON_LATIN.test(item.brands) ? `${item.brands} ürünü` : "İsimsiz ürün";
  if (NON_LATIN.test(name)) {
    return item.brands && !NON_LATIN.test(item.brands) ? `${item.brands} ürünü` : "Yabancı dilde ürün";
  }
  return name;
}
