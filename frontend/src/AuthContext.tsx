import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AuthApiError, authApi, AuthResult, AuthUser } from "./authApi";
import { getGoogleIdToken, googleSignOut } from "./google";
import { StoredAuth, storage } from "./storage";

/** Refresh a little before the access token runs out. */
const EXPIRY_MARGIN_S = 60;

const SESSION_ENDED = "Oturumun sona ermiş. Tekrar giriş yap.";

interface AuthState {
  ready: boolean;
  user: AuthUser | null;
  /** `needsConfirmation`: the account exists but must confirm its e-mail before signing in. */
  signUp: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  signIn: (email: string, password: string) => Promise<void>;
  /** false when the user closed Google's picker. */
  signInWithGoogle: () => Promise<boolean>;
  /** Sets a new password with the tokens from the e-mailed link, and signs in. */
  resetPassword: (accessToken: string, refreshToken: string, password: string) => Promise<void>;
  signOut: () => void;
  refreshUser: () => Promise<void>;
  updateName: (firstName: string, lastName: string) => Promise<void>;
  changeEmail: (currentPassword: string, newEmail: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [stored, setStored] = useState<StoredAuth | null>(null);
  // Mirrors `stored` so async calls always see the newest tokens, and a refresh in flight is shared.
  const current = useRef<StoredAuth | null>(null);
  const refreshing = useRef<Promise<string> | null>(null);

  const keep = useCallback((next: StoredAuth | null) => {
    current.current = next;
    setStored(next);
    storage.saveAuth(next);
  }, []);

  useEffect(() => {
    storage.loadAuth().then((saved) => {
      current.current = saved;
      setStored(saved);
      setReady(true);
    });
  }, []);

  const accept = useCallback(
    (result: AuthResult) => {
      if (!result.session) throw new AuthApiError(0, "Oturum açılamadı. Tekrar dene.");
      keep({ user: result.user, session: result.session });
    },
    [keep]
  );

  /** Swaps the refresh token for a new session. A rejected token ends the sign-in; a dead connection doesn't. */
  const refreshNow = useCallback((): Promise<string> => {
    refreshing.current ??= (async () => {
      const saved = current.current;
      if (!saved) throw new AuthApiError(401, SESSION_ENDED);
      try {
        const result = await authApi.refresh(saved.session.refreshToken);
        accept(result);
        return result.session!.accessToken;
      } catch (err) {
        if (err instanceof AuthApiError && err.status !== 0 && err.status < 500) keep(null);
        throw err;
      }
    })().finally(() => {
      refreshing.current = null;
    });
    return refreshing.current;
  }, [accept, keep]);

  const freshToken = useCallback(async (): Promise<string> => {
    const saved = current.current;
    if (!saved) throw new AuthApiError(401, SESSION_ENDED);
    if (saved.session.expiresAt - EXPIRY_MARGIN_S > Date.now() / 1000) return saved.session.accessToken;
    return refreshNow();
  }, [refreshNow]);

  /** Runs a call with a valid token; one expired-token answer is retried after a refresh. */
  const authed = useCallback(
    async <T,>(call: (token: string) => Promise<T>): Promise<T> => {
      try {
        return await call(await freshToken());
      } catch (err) {
        if (err instanceof AuthApiError && err.status === 401 && current.current) return call(await refreshNow());
        throw err;
      }
    },
    [freshToken, refreshNow]
  );

  const signUp = useCallback<AuthState["signUp"]>(
    async (email, password) => {
      const result = await authApi.signUp(email, password);
      if (result.session) {
        accept(result);
        return { needsConfirmation: false };
      }
      return { needsConfirmation: true };
    },
    [accept]
  );

  const signIn = useCallback<AuthState["signIn"]>(async (email, password) => accept(await authApi.signIn(email, password)), [accept]);

  const signInWithGoogle = useCallback<AuthState["signInWithGoogle"]>(async () => {
    const idToken = await getGoogleIdToken();
    if (!idToken) return false;
    accept(await authApi.google(idToken));
    return true;
  }, [accept]);

  const resetPassword = useCallback<AuthState["resetPassword"]>(
    async (accessToken, refreshToken, password) => accept(await authApi.recovery(accessToken, refreshToken, password)),
    [accept]
  );

  const signOut = useCallback(() => {
    googleSignOut();
    keep(null);
  }, [keep]);

  const setUser = useCallback(
    (user: AuthUser) => {
      if (current.current) keep({ ...current.current, user });
    },
    [keep]
  );

  const refreshUser = useCallback(async () => {
    try {
      setUser((await authed((token) => authApi.me(token))).user);
    } catch {
      // keeping the saved details is fine when the check can't run
    }
  }, [authed, setUser]);

  const updateName = useCallback<AuthState["updateName"]>(
    async (firstName, lastName) => setUser((await authed((token) => authApi.updateName(token, firstName, lastName))).user),
    [authed, setUser]
  );

  const changeEmail = useCallback<AuthState["changeEmail"]>(
    async (currentPassword, newEmail) => {
      await authed((token) => authApi.changeEmail(token, currentPassword, newEmail));
    },
    [authed]
  );

  const changePassword = useCallback<AuthState["changePassword"]>(
    async (currentPassword, newPassword) => {
      await authed((token) => authApi.changePassword(token, currentPassword, newPassword));
    },
    [authed]
  );

  const value = useMemo<AuthState>(
    () => ({
      ready,
      user: stored?.user ?? null,
      signUp,
      signIn,
      signInWithGoogle,
      resetPassword,
      signOut,
      refreshUser,
      updateName,
      changeEmail,
      changePassword,
    }),
    [ready, stored, signUp, signIn, signInWithGoogle, resetPassword, signOut, refreshUser, updateName, changeEmail, changePassword]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(Ctx);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
