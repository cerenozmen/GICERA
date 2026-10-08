import AsyncStorage from "@react-native-async-storage/async-storage";
import { AuthSession, AuthUser } from "./authApi";
import { RoutineProduct } from "./routine";
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

export interface SkinProfile {
  skinType: string | null;
  concerns: string[];
  reactionFrequency: string | null;
  sunBurns: string | null;
  ageRange: string | null;
  routineLevel: string | null;
  pregnant: string | null;
  skinCondition: string | null;
}

export const EMPTY_PROFILE: SkinProfile = {
  skinType: null,
  concerns: [],
  reactionFrequency: null,
  sunBurns: null,
  ageRange: null,
  routineLevel: null,
  pregnant: null,
  skinCondition: null,
};

/** Today's ticked routine steps: the date they belong to, so they reset each day. */
export interface RoutineChecks {
  date: string;
  done: string[];
}

/** The signed-in account kept on the phone. */
export interface StoredAuth {
  user: AuthUser;
  session: AuthSession;
}

export const DEFAULT_SETTINGS: Settings = { pregnancyMode: true, highlightRisky: true, showNotes: true };

const KEYS = {
  favorites: "gicera.favorites",
  history: "gicera.history",
  settings: "gicera.settings",
  welcomeSeen: "gicera.welcomeSeen",
  skinProfile: "gicera.skinProfile",
  routine: "gicera.routine",
  nickname: "gicera.nickname",
  notificationsSeen: "gicera.notificationsSeen",
  routineProducts: "gicera.routineProducts",
  forumDevice: "gicera.forumDevice",
  auth: "gicera.auth",
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
  loadSkinProfile: () => read<SkinProfile | null>(KEYS.skinProfile, null),
  saveSkinProfile: (value: SkinProfile) => write(KEYS.skinProfile, value),
  loadRoutine: () => read<RoutineChecks>(KEYS.routine, { date: "", done: [] }),
  saveRoutine: (value: RoutineChecks) => write(KEYS.routine, value),
  loadRoutineProducts: () => read<Record<string, RoutineProduct>>(KEYS.routineProducts, {}),
  saveRoutineProducts: (value: Record<string, RoutineProduct>) => write(KEYS.routineProducts, value),
  loadNotificationsSeen: () => read<string>(KEYS.notificationsSeen, ""),
  saveNotificationsSeen: (value: string) => write(KEYS.notificationsSeen, value),
  loadNickname: () => read<string | null>(KEYS.nickname, null),
  saveNickname: (value: string) => write(KEYS.nickname, value),
  loadForumDevice: () => read<string | null>(KEYS.forumDevice, null),
  saveForumDevice: (value: string) => write(KEYS.forumDevice, value),
  loadAuth: () => read<StoredAuth | null>(KEYS.auth, null),
  saveAuth: (value: StoredAuth | null) => write(KEYS.auth, value),
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
