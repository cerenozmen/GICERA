import { Product } from "../types";

export type RootStackParamList = {
  Welcome: undefined;
  Main: undefined;
  Scan: undefined;
  ProductDetail: { barcode: string; product?: Product };
  IngredientAnalysis: { product: Product };
  PregnancyMode: undefined;
  /** The barcode-less product's ingredient scan: guided high-resolution photos (GuidedScanScreen). */
  IngredientScan: { productName?: string } | undefined;
  /** Development only: the former continuous live scanner, kept for regression comparisons. */
  IngredientLiveScan: { productName?: string } | undefined;
  /** Development only: local OCR preprocessing POC (photo capture with JPEGs kept, ML Kit bench). */
  OcrBench: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Explore: undefined;
  ScanTab: undefined;
  Favorites: undefined;
  Profile: undefined;
};
