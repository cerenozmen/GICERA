import { API_BASE_URL } from "./config";

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  /** Unix seconds. */
  expiresAt: number;
}

export interface AuthResult {
  user: AuthUser;
  /** null when the account still has to confirm its e-mail. */
  session: AuthSession | null;
  needsConfirmation?: boolean;
}

/** A failed account call: `status` tells an expired session (401) from a wrong password (403) or a dead connection (0). */
export class AuthApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/auth${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new AuthApiError(0, "Sunucuya ulaşılamadı. İnternet bağlantını kontrol edip tekrar dene.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new AuthApiError(response.status, (data as { error?: string }).error ?? `Sunucu hatası (${response.status})`);
  return data as T;
}

export const authApi = {
  signUp: (email: string, password: string) => request<AuthResult>("POST", "/signup", { email, password }),
  signIn: (email: string, password: string) => request<AuthResult>("POST", "/login", { email, password }),
  google: (idToken: string) => request<AuthResult>("POST", "/google", { idToken }),
  refresh: (refreshToken: string) => request<AuthResult>("POST", "/refresh", { refreshToken }),
  forgot: (email: string) => request<{ ok: true }>("POST", "/forgot", { email }),
  recovery: (accessToken: string, refreshToken: string, password: string) =>
    request<AuthResult>("POST", "/recovery", { accessToken, refreshToken, password }),
  me: (token: string) => request<{ user: AuthUser }>("GET", "/me", undefined, token),
  updateName: (token: string, firstName: string, lastName: string) =>
    request<{ user: AuthUser }>("PATCH", "/profile", { firstName, lastName }, token),
  changeEmail: (token: string, currentPassword: string, newEmail: string) =>
    request<{ ok: true }>("POST", "/email", { currentPassword, newEmail }, token),
  changePassword: (token: string, currentPassword: string, newPassword: string) =>
    request<{ ok: true }>("POST", "/password", { currentPassword, newPassword }, token),
};
