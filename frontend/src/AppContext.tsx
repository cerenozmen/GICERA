import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_SETTINGS, ProductSnapshot, Settings, storage, toSnapshot } from "./storage";
import { Product } from "./types";

const HISTORY_LIMIT = 20;

interface AppState {
  ready: boolean;
  welcomeSeen: boolean;
  favorites: ProductSnapshot[];
  history: ProductSnapshot[];
  settings: Settings;
  isFavorite: (barcode: string) => boolean;
  toggleFavorite: (product: Product) => void;
  recordScan: (product: Product) => void;
  clearHistory: () => void;
  updateSettings: (patch: Partial<Settings>) => void;
  markWelcomeSeen: () => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [welcomeSeen, setWelcomeSeen] = useState(false);
  const [favorites, setFavorites] = useState<ProductSnapshot[]>([]);
  const [history, setHistory] = useState<ProductSnapshot[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    Promise.all([storage.loadFavorites(), storage.loadHistory(), storage.loadSettings(), storage.loadWelcomeSeen()]).then(
      ([fav, hist, sett, seen]) => {
        setFavorites(fav);
        setHistory(hist);
        setSettings({ ...DEFAULT_SETTINGS, ...sett });
        setWelcomeSeen(seen);
        setReady(true);
      }
    );
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

  const value = useMemo<AppState>(
    () => ({
      ready,
      welcomeSeen,
      favorites,
      history,
      settings,
      isFavorite: (barcode) => favorites.some((f) => f.barcode === barcode),
      toggleFavorite,
      recordScan,
      clearHistory,
      updateSettings,
      markWelcomeSeen,
    }),
    [ready, welcomeSeen, favorites, history, settings, toggleFavorite, recordScan, clearHistory, updateSettings, markWelcomeSeen]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const value = useContext(Ctx);
  if (!value) throw new Error("useApp must be used inside AppProvider");
  return value;
}
