import { supabase as admin } from "../db/supabaseClient";
import { AuthFailure } from "./authRules";
import { userFromToken } from "./authService";

const TABLE = "kullanici_verileri";

/** What follows the account: the phone's routine, avoided ingredients, scan history and favorites. */
export interface UserData {
  routineSteps: unknown[];
  routineProducts: Record<string, unknown>;
  avoided: string[];
  history: unknown[];
  favorites: unknown[];
}

export interface StoredUserData {
  data: UserData;
  /** When the data last changed on a phone (ms since 1970). */
  updatedAt: number;
}

/** The account's saved data, or null when none was saved yet. */
export async function loadUserData(accessToken: string): Promise<StoredUserData | null> {
  const user = await userFromToken(accessToken);
  const { data, error } = await admin.from(TABLE).select("veri, guncelleme_zamani").eq("kullanici_id", user.id).maybeSingle();
  if (error) throw new AuthFailure(502, "Hesap verileri okunamadı.");
  return data ? { data: data.veri as UserData, updatedAt: Number(data.guncelleme_zamani) } : null;
}

/**
 * Saves the account's data. A copy older than the saved one is refused (409), so a phone that was
 * offline for a while can't overwrite what another phone changed since.
 */
export async function saveUserData(accessToken: string, data: UserData, updatedAt: number): Promise<StoredUserData> {
  const user = await userFromToken(accessToken);
  const { data: existing, error: readError } = await admin.from(TABLE).select("guncelleme_zamani").eq("kullanici_id", user.id).maybeSingle();
  if (readError) throw new AuthFailure(502, "Hesap verileri kaydedilemedi.");
  if (existing && Number(existing.guncelleme_zamani) > updatedAt) {
    throw new AuthFailure(409, "Hesaptaki veri daha yeni.");
  }
  const { error } = await admin.from(TABLE).upsert({ kullanici_id: user.id, veri: data, guncelleme_zamani: updatedAt }, { onConflict: "kullanici_id" });
  if (error) throw new AuthFailure(502, "Hesap verileri kaydedilemedi.");
  return { data, updatedAt };
}
