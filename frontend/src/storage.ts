import AsyncStorage from "@react-native-async-storage/async-storage";
import { Product } from "./types";

export interface ProductSnapshot {
  barcode: string;
  productName: string | null;
  brands: string | null;
  imageUrl: string | null;
  cleanScore: number | null;
  cleanRating: Product["cleanRating"];
  /** Full product, kept only for own-list analyses ("custom:" barcodes) because the server can't return them again. */
  product?: Product;
}

export interface Settings {
  pregnancyMode: boolean;
  highlightRisky: boolean;
  showNotes: boolean;
}

export const DEFAULT_SETTINGS: Settings = { pregnancyMode: true, highlightRisky: true, showNotes: true };

const KEYS = {
  favorites: "gicera.favorites",
  history: "gicera.history",
  settings: "gicera.settings",
  welcomeSeen: "gicera.welcomeSeen",
};

async function read<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function write(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // a failed write only means state isn't persisted across launches
  }
}

export const storage = {
  loadFavorites: () => read<ProductSnapshot[]>(KEYS.favorites, []),
  saveFavorites: (value: ProductSnapshot[]) => write(KEYS.favorites, value),
  loadHistory: () => read<ProductSnapshot[]>(KEYS.history, []),
  saveHistory: (value: ProductSnapshot[]) => write(KEYS.history, value),
  loadSettings: () => read<Settings>(KEYS.settings, DEFAULT_SETTINGS),
  saveSettings: (value: Settings) => write(KEYS.settings, value),
  loadWelcomeSeen: () => read<boolean>(KEYS.welcomeSeen, false),
  saveWelcomeSeen: () => write(KEYS.welcomeSeen, true),
};

export function toSnapshot(product: Product): ProductSnapshot {
  return {
    barcode: product.barcode,
    productName: product.productName,
    brands: product.brands,
    imageUrl: product.imageUrl,
    cleanScore: product.cleanScore,
    cleanRating: product.cleanRating,
    ...(product.barcode.startsWith("custom:") ? { product } : {}),
  };
}
