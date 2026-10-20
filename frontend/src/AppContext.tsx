import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_SETTINGS, ProductSnapshot, Settings, SkinProfile, storage, toSnapshot } from "./storage";
import { RoutineProduct } from "./routine";
import { canScan as canScanWith, freeScansLeft as freeScansLeftOf, PlanId } from "./subscription";
import { Product } from "./types";

const HISTORY_LIMIT = 20;

const today = () => new Date().toISOString().slice(0, 10);

interface AppState {
  ready: boolean;
  welcomeSeen: boolean;
  favorites: ProductSnapshot[];
  history: ProductSnapshot[];
  settings: Settings;
  skinProfile: SkinProfile | null;
  routineDone: string[];
  /** Products placed on routine steps, by step key. */
  routineProducts: Record<string, RoutineProduct>;
  /** The name shown on forum posts and replies (null until the user picks one). */
  nickname: string | null;
  /** Free barcode reads used so far on this phone. */
  scansUsed: number;
  /** Free barcode reads left (3 for a new install); the paywall opens at 0. */
  freeScansLeft: number;
  /** The active plan, or null while on the free reads. */
  premium: PlanId | null;
  /** True while a barcode read is allowed: free reads remain or a plan is active. */
  canScan: boolean;
  /** Counts one successful barcode read against the free ones. */
  consumeFreeScan: () => void;
  /** Raises the used count to the account's (never lowers it). */
  syncScansUsed: (used: number) => void;
  isFavorite: (barcode: string) => boolean;
  toggleFavorite: (product: Product) => void;
  recordScan: (product: Product) => void;
  clearHistory: () => void;
  updateSettings: (patch: Partial<Settings>) => void;
  markWelcomeSeen: () => void;
  /** Saves the profile on this phone (null clears it); SkinProfileSync keeps it with the signed-in account. */
  saveSkinProfile: (profile: SkinProfile | null) => void;
  toggleRoutineStep: (step: string) => void;
  setRoutineProduct: (step: string, product: Product) => void;
  saveNickname: (name: string) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [welcomeSeen, setWelcomeSeen] = useState(false);
  const [favorites, setFavorites] = useState<ProductSnapshot[]>([]);
  const [history, setHistory] = useState<ProductSnapshot[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [skinProfile, setSkinProfile] = useState<SkinProfile | null>(null);
  const [routineDone, setRoutineDone] = useState<string[]>([]);
  const [routineProducts, setRoutineProducts] = useState<Record<string, RoutineProduct>>({});
  const [nickname, setNickname] = useState<string | null>(null);
  const [scansUsed, setScansUsed] = useState(0);
  const [premium, setPremium] = useState<PlanId | null>(null);

  useEffect(() => {
    Promise.all([
      storage.loadFavorites(),
      storage.loadHistory(),
      storage.loadSettings(),
      storage.loadWelcomeSeen(),
      storage.loadSkinProfile(),
      storage.loadRoutine(),
      storage.loadNickname(),
      storage.loadRoutineProducts(),
      storage.loadScansUsed(),
      storage.loadPremium(),
    ]).then(([fav, hist, sett, seen, profile, routine, savedNickname, products, used, plan]) => {
      setFavorites(fav);
      setHistory(hist);
      setSettings({ ...DEFAULT_SETTINGS, ...sett });
      setWelcomeSeen(seen);
      setSkinProfile(profile);
      setRoutineDone(routine.date === today() ? routine.done : []);
      setNickname(savedNickname);
      setRoutineProducts(products);
      setScansUsed(used);
      setPremium(plan);
      setReady(true);
    });
  }, []);

  const toggleFavorite = useCallback((product: Product) => {
    setFavorites((current) => {
      const next = current.some((f) => f.barcode === product.barcode)
        ? current.filter((f) => f.barcode !== product.barcode)
        : [toSnapshot(product), ...current];
      storage.saveFavorites(next);
      return next;
    });
  }, []);

  const recordScan = useCallback((product: Product) => {
    setHistory((current) => {
      const next = [toSnapshot(product), ...current.filter((h) => h.barcode !== product.barcode)].slice(0, HISTORY_LIMIT);
      storage.saveHistory(next);
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    storage.saveHistory([]);
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      storage.saveSettings(next);
      return next;
    });
  }, []);

  const markWelcomeSeen = useCallback(() => {
    setWelcomeSeen(true);
    storage.saveWelcomeSeen();
  }, []);

  const saveSkinProfile = useCallback((profile: SkinProfile | null) => {
    setSkinProfile(profile);
    storage.saveSkinProfile(profile);
  }, []);

  const toggleRoutineStep = useCallback((step: string) => {
    setRoutineDone((current) => {
      const next = current.includes(step) ? current.filter((s) => s !== step) : [...current, step];
      storage.saveRoutine({ date: today(), done: next });
      return next;
    });
  }, []);

  const setRoutineProduct = useCallback((step: string, product: Product) => {
    setRoutineProducts((current) => {
      const next = { ...current, [step]: { barcode: product.barcode, productName: product.productName } };
      storage.saveRoutineProducts(next);
      return next;
    });
  }, []);

  const consumeFreeScan = useCallback(() => {
    setScansUsed((current) => {
      const next = current + 1;
      storage.saveScansUsed(next);
      return next;
    });
  }, []);

  const syncScansUsed = useCallback((used: number) => {
    setScansUsed((current) => {
      if (used <= current) return current;
      storage.saveScansUsed(used);
      return used;
    });
  }, []);

  const saveNickname = useCallback((name: string) => {
    setNickname(name);
    storage.saveNickname(name);
  }, []);

  const value = useMemo<AppState>(
    () => ({
      ready,
      welcomeSeen,
      favorites,
      history,
      settings,
      skinProfile,
      routineDone,
      routineProducts,
      nickname,
      scansUsed,
      freeScansLeft: freeScansLeftOf(scansUsed),
      premium,
      canScan: canScanWith(scansUsed, premium),
      consumeFreeScan,
      syncScansUsed,
      isFavorite: (barcode) => favorites.some((f) => f.barcode === barcode),
      toggleFavorite,
      recordScan,
      clearHistory,
      updateSettings,
      markWelcomeSeen,
      saveSkinProfile,
      toggleRoutineStep,
      setRoutineProduct,
      saveNickname,
    }),
    [
      ready, welcomeSeen, favorites, history, settings, skinProfile, routineDone, routineProducts, nickname, scansUsed, premium, consumeFreeScan, syncScansUsed, toggleFavorite, recordScan, clearHistory,
      updateSettings, markWelcomeSeen, saveSkinProfile, toggleRoutineStep, setRoutineProduct, saveNickname,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const value = useContext(Ctx);
  if (!value) throw new Error("useApp must be used inside AppProvider");
  return value;
}
