import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_SETTINGS, ProductSnapshot, Settings, SkinProfile, storage, toSnapshot } from "./storage";
import { RoutineProduct } from "./routine";
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
  isFavorite: (barcode: string) => boolean;
  toggleFavorite: (product: Product) => void;
  recordScan: (product: Product) => void;
  clearHistory: () => void;
  updateSettings: (patch: Partial<Settings>) => void;
  markWelcomeSeen: () => void;
  saveSkinProfile: (profile: SkinProfile) => void;
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
    ]).then(([fav, hist, sett, seen, profile, routine, savedNickname, products]) => {
      setFavorites(fav);
      setHistory(hist);
      setSettings({ ...DEFAULT_SETTINGS, ...sett });
      setWelcomeSeen(seen);
      setSkinProfile(profile);
      setRoutineDone(routine.date === today() ? routine.done : []);
      setNickname(savedNickname);
      setRoutineProducts(products);
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

  const saveSkinProfile = useCallback((profile: SkinProfile) => {
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
      ready, welcomeSeen, favorites, history, settings, skinProfile, routineDone, routineProducts, nickname, toggleFavorite, recordScan, clearHistory,
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
