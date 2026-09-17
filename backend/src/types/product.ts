export type ProductSource = "obf_bulk" | "obf_live" | "user";

export type RestrictionType = "banned" | "restricted" | "pregnancy_unsafe" | "controversial";

export interface FlaggedIngredient {
  inciName: string;
  restrictionType: RestrictionType;
  notes: string | null;
}

export type CleanRating = "clean" | "moderate" | "riskli";

export interface ScoringResult {
  cleanScore: number;
  cleanRating: CleanRating;
  pregnancySafe: boolean;
  flaggedIngredients: FlaggedIngredient[];
}

export interface ProductRecord {
  barcode: string;
  productName: string | null;
  brands: string | null;
  ingredientsText: string | null;
  imageUrl: string | null;
  source: ProductSource;
  cleanScore: number | null;
  cleanRating: CleanRating | null;
  pregnancySafe: boolean | null;
  flaggedIngredients: FlaggedIngredient[];
  updatedAt: string;
}

export interface ProductNotFoundResponse {
  found: false;
  barcode: string;
  message: string;
}

export interface ProductFoundResponse {
  found: true;
  product: ProductRecord;
}

export type ProductLookupResponse = ProductFoundResponse | ProductNotFoundResponse;
