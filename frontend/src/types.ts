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
  /** Scanned lists: names the user corrected by hand (as read → as typed), shown with the result. */
  manualFixes?: { from: string; to: string }[];
  /** Scanned lists: the scanner that read it, to scan again with ("Tekrar tara"). */
  rescanRoute?: "IngredientScan" | "IngredientLiveScan";
}

export type LookupResult =
  | { found: true; product: Product }
  | { found: false; barcode: string; message: string };

/** Community forum (Tartışma), as the server returns it. */
export interface ForumPost {
  id: string;
  authorName: string;
  title: string;
  body: string;
  category: string;
  createdAt: string;
  replyCount: number;
  likeCount: number;
  liked: boolean;
  saved: boolean;
  /** Written from this phone: it may delete it. */
  mine: boolean;
}

export interface ForumReply {
  id: string;
  postId: string;
  authorName: string;
  text: string;
  createdAt: string;
  likeCount: number;
  liked: boolean;
  mine: boolean;
}

/** A reply someone else wrote under one of this phone's posts. */
export interface ForumNotification {
  replyId: string;
  postId: string;
  postTitle: string;
  authorName: string;
  text: string;
  createdAt: string;
}
