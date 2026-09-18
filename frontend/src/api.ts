import { API_BASE_URL } from "./config";
import { LookupResult } from "./types";

export async function lookupBarcode(barcode: string): Promise<LookupResult> {
  const response = await fetch(`${API_BASE_URL}/products/${encodeURIComponent(barcode)}`);
  if (response.status === 404) {
    return (await response.json()) as LookupResult;
  }
  if (!response.ok) {
    throw new Error(`Sunucu hatası (${response.status})`);
  }
  return (await response.json()) as LookupResult;
}
