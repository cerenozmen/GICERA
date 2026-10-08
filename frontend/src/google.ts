import { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } from "@react-native-google-signin/google-signin";
import { GOOGLE_WEB_CLIENT_ID } from "./config";

export const googleConfigured = GOOGLE_WEB_CLIENT_ID !== null;

/** Opens Google's account picker and returns its ID token; null when the user backed out. */
export async function getGoogleIdToken(): Promise<string | null> {
  if (!GOOGLE_WEB_CLIENT_ID) throw new Error("Google ile giriş henüz ayarlanmadı.");
  GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
  try {
    await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return null;
    if (!response.data.idToken) throw new Error("Google hesabı doğrulanamadı. Tekrar dene.");
    return response.data.idToken;
  } catch (err) {
    if (isErrorWithCode(err)) {
      if (err.code === statusCodes.SIGN_IN_CANCELLED) return null;
      if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) throw new Error("Google Play Hizmetleri bu cihazda kullanılamıyor.");
      throw new Error("Google ile giriş yapılamadı. Tekrar dene.");
    }
    throw err;
  }
}

/** Forgets the chosen Google account so the next sign-in shows the picker again. */
export function googleSignOut(): void {
  if (!googleConfigured) return;
  GoogleSignin.signOut().catch(() => undefined);
}
