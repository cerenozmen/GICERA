import AsyncStorage from "@react-native-async-storage/async-storage";
import { AuthSession, AuthUser } from "./authApi";
import { RoutineProduct, RoutineStep } from "./routine";
import type { PlanId } from "./subscription";
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
  /** What the product is, named by the server for scans whose own name is unreadable or missing. */
  autoName?: string;
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

/** What follows the signed-in account from phone to phone (DataSync keeps it on the server). */
export interface AccountData {
  routineSteps: RoutineStep[];
  routineProducts: Record<string, RoutineProduct>;
  avoided: string[];
  history: ProductSnapshot[];
  favorites: ProductSnapshot[];
}

export const EMPTY_ACCOUNT_DATA: AccountData = { routineSteps: [], routineProducts: {}, avoided: [], history: [], favorites: [] };

/** The same data in a fixed key order, with anything missing filled in (the server may hand it back reordered or partial). */
export function normalizeAccountData(data: Partial<AccountData> | null | undefined): AccountData {
  return {
    routineSteps: data?.routineSteps ?? [],
    routineProducts: data?.routineProducts ?? {},
    avoided: data?.avoided ?? [],
    history: data?.history ?? [],
    favorites: data?.favorites ?? [],
  };
}

export const isEmptyAccountData = (data: AccountData) =>
  !data.routineSteps.length && !Object.keys(data.routineProducts).length && !data.avoided.length && !data.history.length && !data.favorites.length;

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
  routineSteps: "gicera.routineSteps",
  oldCustomSteps: "gicera.customRoutineSteps",
  avoided: "gicera.avoidedIngredients",
  dataChangedAt: "gicera.dataChangedAt",
  forumDevice: "gicera.forumDevice",
  auth: "gicera.auth",
  scansUsed: "gicera.scansUsed",
  premium: "gicera.premium",
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
  saveSkinProfile: (value: SkinProfile | null) => write(KEYS.skinProfile, value),
  loadRoutine: () => read<RoutineChecks>(KEYS.routine, { date: "", done: [] }),
  saveRoutine: (value: RoutineChecks) => write(KEYS.routine, value),
  loadRoutineProducts: () => read<Record<string, RoutineProduct>>(KEYS.routineProducts, {}),
  /** The routine's steps; a routine kept as separate Sabah / Akşam lists is merged into one. */
  loadRoutineSteps: async (): Promise<RoutineStep[]> => {
    const steps = await read<RoutineStep[] | null>(KEYS.routineSteps, null);
    if (steps) return steps;
    const old = await read<Partial<Record<"Sabah" | "Akşam", RoutineStep[]>>>(KEYS.oldCustomSteps, {});
    return [...(old.Sabah ?? []), ...(old["Akşam"] ?? [])];
  },
  saveRoutineSteps: (value: RoutineStep[]) => write(KEYS.routineSteps, value),
  loadAvoided: () => read<string[]>(KEYS.avoided, []),
  loadDataChangedAt: () => read<number>(KEYS.dataChangedAt, 0),
  saveDataChangedAt: (value: number) => write(KEYS.dataChangedAt, value),
  saveAvoided: (value: string[]) => write(KEYS.avoided, value),
  saveRoutineProducts: (value: Record<string, RoutineProduct>) => write(KEYS.routineProducts, value),
  loadNotificationsSeen: () => read<string>(KEYS.notificationsSeen, ""),
  saveNotificationsSeen: (value: string) => write(KEYS.notificationsSeen, value),
  loadNickname: () => read<string | null>(KEYS.nickname, null),
  saveNickname: (value: string) => write(KEYS.nickname, value),
  loadForumDevice: () => read<string | null>(KEYS.forumDevice, null),
  saveForumDevice: (value: string) => write(KEYS.forumDevice, value),
  loadAuth: () => read<StoredAuth | null>(KEYS.auth, null),
  saveAuth: (value: StoredAuth | null) => write(KEYS.auth, value),
  loadScansUsed: () => read<number>(KEYS.scansUsed, 0),
  saveScansUsed: (value: number) => write(KEYS.scansUsed, value),
  /** The active plan, once purchases exist (nothing sets it yet). */
  loadPremium: () => read<PlanId | null>(KEYS.premium, null),
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
