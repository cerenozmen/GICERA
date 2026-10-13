import { useEffect, useRef, useState } from "react";
import { useApp } from "./AppContext";
import { useAuth } from "./AuthContext";
import type { SkinProfile } from "./storage";

/** Field order doesn't count: the server hands the profile back with its keys sorted. */
const canonical = (p: SkinProfile | null | undefined) =>
  p ? JSON.stringify(Object.keys(p).sort().map((k) => [k, p[k as keyof SkinProfile]])) : "null";
export const sameProfile = (a: SkinProfile | null | undefined, b: SkinProfile | null | undefined) => canonical(a) === canonical(b);

export type SyncAction = "none" | "load" | "upload" | "clear";

/**
 * What to do with the phone's copy of the skin profile, given whose it was (`previous`: an account id,
 * null for no account, undefined on the first check after start-up), who is signed in now (`current`),
 * the phone's copy and the account's.
 */
export function syncAction(
  previous: string | null | undefined,
  current: string | null,
  local: SkinProfile | null,
  remote: SkinProfile | null | undefined
): SyncAction {
  if (!current) return previous ? "clear" : "none"; // signed out: the profile was that account's
  if (previous !== undefined && previous !== current) {
    // Another account signed in: its own profile, else the answers given here before signing in (never
    // another account's).
    if (remote) return sameProfile(remote, local) ? "none" : "load";
    if (!local) return "none";
    return previous === null ? "upload" : "clear";
  }
  // The same account: the account's copy when the phone has none (the quiz was taken on another phone),
  // otherwise a profile changed here is saved to the account.
  if (!local) return remote ? "load" : "none";
  return sameProfile(local, remote) ? "none" : "upload";
}

/**
 * Keeps the skin profile with the signed-in account (renders nothing). The app reads the profile from this
 * phone (AppContext); this makes that copy the account's, and clears it on signing out so the next
 * person's results aren't based on it. Without an account the profile simply stays on the phone.
 */
export function SkinProfileSync() {
  const { ready: appReady, skinProfile, saveSkinProfile: saveLocal } = useApp();
  const { ready: authReady, user, saveSkinProfile: saveRemote, refreshUser } = useAuth();
  const owner = useRef<string | null | undefined>(undefined);
  // The signed-in user saved on the phone may predate a profile saved from another phone: fetch the
  // account once before comparing (offline, the saved copy is used).
  const [fresh, setFresh] = useState(false);
  const refreshing = useRef(false);

  useEffect(() => {
    if (!authReady || refreshing.current) return;
    refreshing.current = true;
    if (user) refreshUser().finally(() => setFresh(true));
    else setFresh(true);
  }, [authReady, user, refreshUser]);

  useEffect(() => {
    if (!appReady || !authReady || !fresh) return;
    const current = user?.id ?? null;
    const action = syncAction(owner.current, current, skinProfile, user?.skinProfile);
    owner.current = current;
    if (action === "load") saveLocal(user!.skinProfile!);
    else if (action === "clear") saveLocal(null);
    else if (action === "upload") saveRemote(skinProfile!).catch(() => {});
  }, [appReady, authReady, fresh, user, skinProfile, saveLocal, saveRemote]);

  return null;
}
