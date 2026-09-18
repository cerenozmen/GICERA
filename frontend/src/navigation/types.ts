import { Product } from "../types";

export type RootStackParamList = {
  Welcome: undefined;
  Main: undefined;
  Scan: undefined;
  ProductDetail: { barcode: string; product?: Product };
  IngredientAnalysis: { product: Product };
  PregnancyMode: undefined;
  IngredientScan: { productName?: string } | undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Explore: undefined;
  ScanTab: undefined;
  Favorites: undefined;
  Profile: undefined;
};
