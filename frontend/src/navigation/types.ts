import { Product } from "../types";

export type RootStackParamList = {
  Welcome: undefined;
  /** The skin profile questions; `edit` when reopened from the profile (returns there instead of home). */
  SkinQuiz: { edit?: boolean } | undefined;
  Main: undefined;
  Scan: undefined;
  /** A barcode the database doesn't know: ways to go on (scan the list instead). */
  ProductNotFound: { barcode: string };
  Favorites: undefined;
  PostDetail: { postId: string };
  Notifications: undefined;
  /** Find a product by name or brand (the not-found screen's "Ürün adını yazarak ara"). */
  ProductSearch: undefined;
  NewPost: undefined;
  ProductDetail: { barcode: string; product?: Product };
  /** `fromScan`: just read by the scanner ("Ürün içeriği okundu"), going on to the result. */
  IngredientAnalysis: { product: Product; fromScan?: boolean };
  PregnancyMode: undefined;
  /** The ingredient list scan (the live scanner, IngredientScanScreen). */
  IngredientScan: { productName?: string } | undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Discussion: undefined;
  ScanTab: undefined;
  History: undefined;
  Profile: undefined;
};
