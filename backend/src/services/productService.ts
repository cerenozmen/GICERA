import { supabase } from "../db/supabaseClient";
import { ProductLookupResponse, ProductRecord } from "../types/product";
import { fetchProductFromOBF } from "./openBeautyFactsClient";
import { scoreIngredientsText } from "./scoringService";

interface ProductRow {
  barcode: string;
  product_name: string | null;
  brands: string | null;
  ingredients_text: string | null;
  image_url: string | null;
  source: ProductRecord["source"];
  clean_score: number | null;
  clean_rating: ProductRecord["cleanRating"];
  pregnancy_safe: boolean | null;
  flagged_ingredients: ProductRecord["flaggedIngredients"] | null;
  updated_at: string;
}

function rowToRecord(row: ProductRow): ProductRecord {
  return {
    barcode: row.barcode,
    productName: row.product_name,
    brands: row.brands,
    ingredientsText: row.ingredients_text,
    imageUrl: row.image_url,
    source: row.source,
    cleanScore: row.clean_score,
    cleanRating: row.clean_rating,
    pregnancySafe: row.pregnancy_safe,
    flaggedIngredients: row.flagged_ingredients ?? [],
    updatedAt: row.updated_at,
  };
}

async function findCachedProduct(barcode: string): Promise<ProductRecord | null> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("barcode", barcode)
    .maybeSingle<ProductRow>();

  if (error) {
    throw new Error(`Supabase select failed: ${error.message}`);
  }

  return data ? rowToRecord(data) : null;
}

async function cacheProductFromOBF(barcode: string, obfProduct: {
  product_name?: string;
  brands?: string;
  ingredients_text?: string;
  image_url?: string;
}): Promise<ProductRecord> {
  const scoring = scoreIngredientsText(obfProduct.ingredients_text);

  const row = {
    barcode,
    product_name: obfProduct.product_name ?? null,
    brands: obfProduct.brands ?? null,
    ingredients_text: obfProduct.ingredients_text ?? null,
    image_url: obfProduct.image_url ?? null,
    source: "obf_live" as const,
    clean_score: scoring?.cleanScore ?? null,
    clean_rating: scoring?.cleanRating ?? null,
    pregnancy_safe: scoring?.pregnancySafe ?? null,
    flagged_ingredients: scoring?.flaggedIngredients ?? [],
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("products")
    .upsert(row, { onConflict: "barcode" })
    .select("*")
    .single<ProductRow>();

  if (error) {
    throw new Error(`Supabase upsert failed: ${error.message}`);
  }

  return rowToRecord(data);
}

/**
 * Barkod -> ürün akışı:
 * 1) kendi veritabanımızda ara (bulk import veya önceden cache'lenmiş)
 * 2) bulunamazsa Open Beauty Facts canlı API'sinden çek ve cache'le
 * 3) orada da yoksa "bulunamadı" döndür (frontend kullanıcı katkısı akışına yönlendirir)
 */
export async function lookupProductByBarcode(barcode: string): Promise<ProductLookupResponse> {
  const cached = await findCachedProduct(barcode);
  if (cached) {
    return { found: true, product: cached };
  }

  const obfProduct = await fetchProductFromOBF(barcode);
  if (!obfProduct) {
    return {
      found: false,
      barcode,
      message: "Ürün Open Beauty Facts veya kendi veritabanımızda bulunamadı.",
    };
  }

  const record = await cacheProductFromOBF(barcode, obfProduct);
  return { found: true, product: record };
}
