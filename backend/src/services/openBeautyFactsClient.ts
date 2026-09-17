import { env } from "../config/env";

export interface OBFProduct {
  code: string;
  product_name?: string;
  brands?: string;
  ingredients_text?: string;
  image_url?: string;
}

interface OBFApiResponse {
  status: number; // 1 = found, 0 = not found
  product?: OBFProduct;
}

/**
 * Live lookup against Open Beauty Facts for products missing from our own
 * database (bulk-imported dump takes priority; this is the fallback).
 */
export async function fetchProductFromOBF(barcode: string): Promise<OBFProduct | null> {
  const url = `${env.obfApiBaseUrl}/product/${encodeURIComponent(barcode)}.json`;
  const response = await fetch(url, {
    headers: { "User-Agent": "GICERA-App/0.1 (skincare barcode analysis)" },
  });

  if (!response.ok) {
    throw new Error(`Open Beauty Facts API error: ${response.status}`);
  }

  const data = (await response.json()) as OBFApiResponse;
  if (data.status !== 1 || !data.product) {
    return null;
  }

  return data.product;
}
