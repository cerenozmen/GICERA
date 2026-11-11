import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AccountData, DEFAULT_SETTINGS, normalizeAccountData, ProductSnapshot, Settings, SkinProfile, storage, toSnapshot } from "./storage";
import { RoutineProduct, RoutineStep } from "./routine";
import { suggestProductName } from "./api";
import { needsAutoName, realName, usableAutoName } from "./displayName";
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
  /** The routine steps the user added themselves. */
  routineSteps: RoutineStep[];
  addRoutineStep: (title: string) => void;
  removeRoutineStep: (key: string) => void;
  /** Ingredients the user avoids (allergens.ts keys), flagged red on every product. */
  avoided: string[];
  setAvoided: (value: string[]) => void;
  /** Everything that follows the account (DataSync) and when it last changed on this phone (ms; 0: never). */
  accountData: AccountData;
  dataChangedAt: number;
  /** Replaces the phone's copy with the account's (`at`: when that copy was saved) without counting as a local change. */
  applyAccountData: (data: AccountData | null, at: number) => void;
  /** Gives a scan in the history a name of the user's choosing. */
  renameHistoryItem: (barcode: string, name: string) => void;
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
  const [routineSteps, setRoutineSteps] = useState<RoutineStep[]>([]);
  const [avoided, setAvoidedState] = useState<string[]>([]);
  const [dataChangedAt, setDataChangedAt] = useState(0);
  const appliedSig = useRef<string | null>(null);
  const historyRef = useRef<ProductSnapshot[]>([]);
  const [scansUsed, setScansUsed] = useState(0);
  const [premium, setPremium] = useState<PlanId | null>(null);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

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
      storage.loadRoutineSteps(),
      storage.loadAvoided(),
      storage.loadDataChangedAt(),
    ]).then(([fav, hist, sett, seen, profile, routine, savedNickname, products, used, plan, steps, avoidedList, changedAt]) => {
      setFavorites(fav);
      setHistory(hist);
      setSettings({ ...DEFAULT_SETTINGS, ...sett });
      setWelcomeSeen(seen);
      setSkinProfile(profile);
      setRoutineDone(routine.date === today() ? routine.done : []);
      setNickname(savedNickname);
      setRoutineProducts(products);
      setRoutineSteps(steps);
      setAvoidedState(avoidedList);
      setDataChangedAt(changedAt);
      setScansUsed(used);
      setPremium(plan);
      setReady(true);
    });
  }, []);

  // Scans saved before the server named them (or while it was unreachable) get their name once per launch.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      for (const item of historyRef.current.filter((h) => !usableAutoName(h.autoName) && needsAutoName(h))) {
        if (cancelled) return;
        const autoName = await suggestProductName({
          productName: realName(item.productName),
          brands: item.product ? null : item.brands,
          ingredientsText: item.product?.ingredientsText ?? null,
        });
        if (!autoName) continue;
        setHistory((current) => {
          const next = current.map((h) => (h.barcode === item.barcode ? { ...h, autoName } : h));
          storage.saveHistory(next);
          return next;
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready]);

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
    // Opening a scan again keeps the name already given to it, and doesn't ask for another.
    const known = usableAutoName(historyRef.current.find((h) => h.barcode === product.barcode)?.autoName);
    setHistory((current) => {
      const snapshot = { ...toSnapshot(product), ...(known ? { autoName: known } : {}) };
      const next = [snapshot, ...current.filter((h) => h.barcode !== product.barcode)].slice(0, HISTORY_LIMIT);
      storage.saveHistory(next);
      return next;
    });
    if (!known && needsAutoName(toSnapshot(product))) {
      suggestProductName({ productName: realName(product.productName), brands: product.barcode.startsWith("custom:") ? null : product.brands, ingredientsText: product.ingredientsText }).then((autoName) => {
        if (!autoName) return;
        setHistory((current) => {
          const next = current.map((h) => (h.barcode === product.barcode ? { ...h, autoName } : h));
          storage.saveHistory(next);
          return next;
        });
      });
    }
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

  const addRoutineStep = useCallback((title: string) => {
    setRoutineSteps((current) => {
      const next = [...current, { key: `step-${Date.now()}`, title, text: "Bu adım için bir ürün ekleyebilirsin." }];
      storage.saveRoutineSteps(next);
      return next;
    });
  }, []);

  const accountData = useMemo<AccountData>(
    () => ({ routineSteps, routineProducts, avoided, history, favorites }),
    [routineSteps, routineProducts, avoided, history, favorites]
  );

  // A change to anything the account keeps stamps the time, so DataSync knows which copy is newer.
  useEffect(() => {
    if (!ready) return;
    const sig = JSON.stringify(accountData);
    if (appliedSig.current === null) {
      appliedSig.current = sig;
      return;
    }
    if (sig === appliedSig.current) return;
    appliedSig.current = sig;
    const now = Date.now();
    setDataChangedAt(now);
    storage.saveDataChangedAt(now);
  }, [ready, accountData]);

  const applyAccountData = useCallback((incoming: AccountData | null, at: number) => {
    const data = normalizeAccountData(incoming);
    appliedSig.current = JSON.stringify(data);
    setRoutineSteps(data.routineSteps);
    setRoutineProducts(data.routineProducts);
    setAvoidedState(data.avoided);
    setHistory(data.history);
    setFavorites(data.favorites);
    setDataChangedAt(at);
    storage.saveRoutineSteps(data.routineSteps);
    storage.saveRoutineProducts(data.routineProducts);
    storage.saveAvoided(data.avoided);
    storage.saveHistory(data.history);
    storage.saveFavorites(data.favorites);
    storage.saveDataChangedAt(at);
  }, []);

  const setAvoided = useCallback((value: string[]) => {
    setAvoidedState(value);
    storage.saveAvoided(value);
  }, []);

  const removeRoutineStep = useCallback((key: string) => {
    setRoutineSteps((current) => {
      const next = current.filter((s) => s.key !== key);
      storage.saveRoutineSteps(next);
      return next;
    });
    setRoutineDone((current) => {
      const next = current.filter((s) => s !== key);
      storage.saveRoutine({ date: today(), done: next });
      return next;
    });
    setRoutineProducts((current) => {
      const { [key]: _removed, ...rest } = current;
      storage.saveRoutineProducts(rest);
      return rest;
    });
  }, []);

  const renameHistoryItem = useCallback((barcode: string, name: string) => {
    setHistory((current) => {
      const next = current.map((h) =>
        h.barcode === barcode ? { ...h, productName: name, ...(h.product ? { product: { ...h.product, productName: name } } : {}) } : h
      );
      storage.saveHistory(next);
      return next;
    });
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
      routineSteps,
      addRoutineStep,
      avoided,
      setAvoided,
      accountData,
      dataChangedAt,
      applyAccountData,
      removeRoutineStep,
      renameHistoryItem,
      toggleRoutineStep,
      setRoutineProduct,
      saveNickname,
    }),
    [
      ready, welcomeSeen, favorites, history, settings, skinProfile, routineDone, routineProducts, routineSteps, avoided, accountData, dataChangedAt, applyAccountData, nickname, scansUsed, premium, consumeFreeScan, syncScansUsed, toggleFavorite, recordScan, clearHistory,
      updateSettings, markWelcomeSeen, saveSkinProfile, setAvoided, addRoutineStep, removeRoutineStep, renameHistoryItem, toggleRoutineStep, setRoutineProduct, saveNickname,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const value = useContext(Ctx);
  if (!value) throw new Error("useApp must be used inside AppProvider");
  return value;
}
