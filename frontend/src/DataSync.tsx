import { useEffect, useRef } from "react";
import { useApp } from "./AppContext";
import { AuthApiError } from "./authApi";
import { useAuth } from "./AuthContext";
import { isEmptyAccountData, normalizeAccountData } from "./storage";

export type DataSyncAction = "none" | "load" | "upload" | "clear";

/**
 * What to do with the phone's routine, avoided ingredients, history and favorites, given whose they were
 * (`previous`: an account id, null for no account, undefined on the first check after start-up), who is
 * signed in now (`current`), the phone's copy (`local`: empty or not, when it last changed) and the
 * account's (`remote`: when it was saved; null when nothing is saved yet).
 */
export function dataSyncAction(
  previous: string | null | undefined,
  current: string | null,
  local: { empty: boolean; at: number },
  remote: { at: number } | null
): DataSyncAction {
  if (!current) return previous ? "clear" : "none"; // signed out: the data was that account's
  const switched = previous !== undefined && previous !== current;
  if (remote) {
    if (switched) return "load"; // signing in: the account's own copy, whatever was on the phone before
    if (local.at > remote.at) return "upload";
    return local.at < remote.at ? "load" : "none";
  }
  // Signing in on a phone: its data was another account's, or was made without an account and could be anyone's.
  // Either way it never becomes this account's: everyone sees only their own scans.
  if (switched) return "clear";
  return local.empty ? "none" : "upload";
}

const UPLOAD_DELAY_MS = 2000;

/**
 * Keeps the routine, avoided ingredients, scan history and favorites with the signed-in account (renders
 * nothing). The phone's copy is the one the app reads (AppContext); this loads the account's copy after
 * signing in, saves changes made here shortly after they happen, and clears the phone's copy on signing out
 * so the next person doesn't see it. Without an account the data simply stays on the phone.
 */
export function DataSync() {
  const { ready: appReady, accountData, dataChangedAt, applyAccountData } = useApp();
  const { ready: authReady, user, loadAccountData, saveAccountData } = useAuth();
  const owner = useRef<string | null | undefined>(undefined);
  /** The signed-in account whose copy this phone has compared with the server (uploads wait for it). */
  const synced = useRef<string | null>(null);
  const uploadedAt = useRef(0);
  const latest = useRef({ accountData, dataChangedAt });
  latest.current = { accountData, dataChangedAt };
  const userId = user?.id ?? null;

  // Sign-in / sign-out / start-up: compare the phone's copy with the account's.
  useEffect(() => {
    if (!appReady || !authReady) return;
    let cancelled = false;
    (async () => {
      if (!userId) {
        if (dataSyncAction(owner.current, null, { empty: true, at: 0 }, null) === "clear") applyAccountData(null, 0);
        owner.current = null;
        synced.current = null;
        return;
      }
      let stored;
      try {
        stored = await loadAccountData();
      } catch {
        return; // offline or the table isn't there yet: leave the phone's copy alone
      }
      if (cancelled) return;
      const { accountData: local, dataChangedAt: at } = latest.current;
      const action = dataSyncAction(owner.current, userId, { empty: isEmptyAccountData(local), at }, stored && { at: stored.updatedAt });
      owner.current = userId;
      if (action === "load" && stored) {
        applyAccountData(normalizeAccountData(stored.data), stored.updatedAt);
        uploadedAt.current = stored.updatedAt;
      } else if (action === "clear") {
        applyAccountData(null, 0);
        uploadedAt.current = 0;
      } else {
        uploadedAt.current = stored?.updatedAt ?? 0;
      }
      synced.current = userId;
    })();
    return () => {
      cancelled = true;
    };
  }, [appReady, authReady, userId, loadAccountData, applyAccountData]);

  // A change made here is saved to the account a moment after the last one.
  useEffect(() => {
    if (!userId || synced.current !== userId || dataChangedAt <= uploadedAt.current) return;
    const timer = setTimeout(() => {
      const { accountData: data, dataChangedAt: at } = latest.current;
      saveAccountData(data, at)
        .then(() => {
          uploadedAt.current = at;
        })
        .catch(async (err) => {
          // Another phone saved something newer meanwhile: take it.
          if (err instanceof AuthApiError && err.status === 409) {
            const stored = await loadAccountData().catch(() => null);
            if (stored) {
              applyAccountData(normalizeAccountData(stored.data), stored.updatedAt);
              uploadedAt.current = stored.updatedAt;
            }
          }
        });
    }, UPLOAD_DELAY_MS);
    return () => clearTimeout(timer);
  }, [userId, dataChangedAt, accountData, saveAccountData, loadAccountData, applyAccountData]);

  return null;
}
