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
  /** Photo analyses only: names that couldn't be verified; left out of the score, never counted as safe. */
  unverifiedIngredients?: string[];
  /** Scanned lists without a score: the names that withheld it (see scoreBlockers). */
  scoreBlockers?: { misread: string[]; notInDictionary: string[] };
  /** Scanned lists: the scanner that read it, to scan again with ("Tekrar tara"). */
  rescanRoute?: "IngredientScan" | "IngredientLiveScan";
}

export type LookupResult =
  | { found: true; product: Product }
  | { found: false; barcode: string; message: string };
