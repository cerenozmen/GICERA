export type RestrictionType = "banned" | "restricted" | "pregnancy_unsafe" | "controversial";
export type CleanRating = "clean" | "moderate" | "riskli";

export interface FlaggedIngredient {
  inciName: string;
  restrictionType: RestrictionType;
  notes: string | null;
}

export interface Product {
  barcode: string;
  productName: string | null;
  brands: string | null;
  ingredientsText: string | null;
  imageUrl: string | null;
  cleanScore: number | null;
  cleanRating: CleanRating | null;
  pregnancySafe: boolean | null;
  flaggedIngredients: FlaggedIngredient[];
}

export type LookupResult =
  | { found: true; product: Product }
  | { found: false; barcode: string; message: string };
