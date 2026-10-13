import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { Alert, Image, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuthApiError } from "../authApi";
import { useAuth } from "../AuthContext";
import { PrimaryButton } from "../components/common";
import { Field, FormMessage } from "../components/Field";
import { GoogleLogo } from "../components/GoogleLogo";
import { googleConfigured } from "../google";
import { isEmail, PASSWORD_RULE, passwordProblem } from "../formRules";
import { RootStackParamList } from "../navigation/types";
import { colors, LOGO_BG, serif } from "../theme";
import { useSubmit } from "../useSubmit";

const LOGO = require("../../assets/logo-mark.jpg");

type Mode = "login" | "signup";

/**
 * "Oturum açın veya kaydolun": e-mail + password (sign in / sign up) and Google. A new account (or a
 * sign-in to one not yet confirmed) waits for the link mailed to the address (it opens the app, signed in).
 */
export function AuthScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "Auth">) {
  const insets = useSafeAreaInsets();
  const { signIn, signUp, resendConfirmation, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  /** The address waiting for its confirmation link, while that step is shown. */
  const [verifying, setVerifying] = useState<string | null>(null);
  const form = useSubmit();
  const google = useSubmit();

  /** Back to wherever the user came from (the profile), or into the app when this was the flow's end. */
  function finish() {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.reset({ index: 0, routes: [{ name: "Main" }] });
  }

  function switchMode(next: Mode) {
    setMode(next);
    setNotice(null);
    form.setError(null);
  }

  function submit() {
    setNotice(null);
    form.run(async () => {
      if (!isEmail(email)) throw new Error("Geçerli bir e-posta adresi gir.");
      if (mode === "signup") {
        const problem = passwordProblem(password);
        if (problem) throw new Error(problem);
        const { needsConfirmation } = await signUp(email.trim(), password);
        if (!needsConfirmation) return finish();
        awaitLink(email.trim(), "Hesabın oluşturuldu.");
        return;
      }
      if (!password) throw new Error("Şifreni gir.");
      try {
        await signIn(email.trim(), password);
      } catch (err) {
        // An account not confirmed yet (403): a fresh link is sent, and the step waits for it.
        if (err instanceof AuthApiError && err.status === 403) {
          await resendConfirmation(email.trim()).catch(() => {});
          awaitLink(email.trim(), "E-postanı henüz doğrulamadın. Yeni bir bağlantı gönderdik.");
          return;
        }
        throw err;
      }
      finish();
    });
  }

  function awaitLink(address: string, message: string) {
    setPassword("");
    setVerifying(address);
    setNotice(message);
  }

  function resend() {
    setNotice(null);
    form.run(async () => {
      await resendConfirmation(verifying!);
      setNotice("Yeni bir bağlantı gönderdik. Gelen kutunu (ve spam klasörünü) kontrol et.");
    });
  }

  function backToSignIn() {
    setVerifying(null);
    setNotice(null);
    setMode("login");
    form.setError(null);
  }

  function continueWithGoogle() {
    if (!googleConfigured) {
      Alert.alert("Google ile giriş hazır değil", "Bu özellik henüz yapılandırılmadı. Şimdilik e-posta ve şifreyle devam edebilirsin.");
      return;
    }
    google.run(async () => {
      if (await signInWithGoogle()) finish();
    });
  }

  const busy = form.busy || google.busy;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 28, paddingHorizontal: 24, paddingBottom: insets.bottom + 28, gap: 22 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brandBlock}>
          <Image source={LOGO} style={styles.logo} resizeMode="contain" />
          <Text style={styles.brand}>Gicera</Text>
          <Text style={styles.motto}>İÇERİĞİNİ BİL, KENDİNE İYİ BAK.</Text>
        </View>

        <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>
          OTURUM AÇIN VEYA KAYDOLUN
        </Text>

        {verifying ? (
          <>
            <Text style={styles.codeInfo}>
              <Text style={styles.codeEmail}>{verifying}</Text> adresine bir doğrulama bağlantısı gönderdik. E-postayı bu telefonda açıp bağlantıya
              dokun; uygulama açılıp giriş yapacak.
            </Text>
            <FormMessage text={notice} tone="info" />
            <FormMessage text={form.error} />
            <PrimaryButton label={form.busy ? "Lütfen bekle…" : "Bağlantıyı tekrar gönder"} onPress={resend} disabled={form.busy} />
            <View style={styles.codeLinks}>
              <Pressable onPress={backToSignIn} hitSlop={8}>
                <Text style={styles.forgotText}>Girişe dön</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <View style={styles.tabs}>
              <Tab label="Giriş yap" active={mode === "login"} onPress={() => switchMode("login")} />
              <Tab label="Kaydol" active={mode === "signup"} onPress={() => switchMode("signup")} />
            </View>

            <View style={styles.form}>
              <Field
                label="E-posta"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="next"
              />
              <Field
                label="Şifre"
                value={password}
                onChangeText={setPassword}
                secure
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                textContentType={mode === "login" ? "password" : "newPassword"}
                hint={mode === "signup" ? PASSWORD_RULE.replace("Yeni parolanız", "Parolanız") : undefined}
                returnKeyType="go"
                onSubmitEditing={submit}
              />
              {/* The row keeps its height on "Kaydol" too, so the button sits at the same distance from the password on both tabs. */}
              <View style={styles.forgotRow}>
                {mode === "login" && (
                  <Pressable onPress={() => navigation.navigate("ForgotPassword", { email: email.trim() })} hitSlop={8}>
                    <Text style={styles.forgotText}>Şifremi unuttum</Text>
                  </Pressable>
                )}
              </View>
            </View>

            <FormMessage text={notice} tone="info" />
            <FormMessage text={form.error ?? google.error} />

            <PrimaryButton label={form.busy ? "Lütfen bekle…" : mode === "login" ? "Giriş yap" : "Hesap oluştur"} onPress={submit} disabled={busy} />

            <View style={styles.or}>
              <View style={styles.rule} />
              <Text style={styles.orText}>veya</Text>
              <View style={styles.rule} />
            </View>

            <Pressable style={[styles.google, busy && { opacity: 0.5 }]} onPress={continueWithGoogle} disabled={busy}>
              <GoogleLogo size={20} />
              <Text style={styles.googleText}>{google.busy ? "Lütfen bekle…" : "Google ile devam et"}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.tab, active && styles.tabOn]} onPress={onPress}>
      <Text style={[styles.tabText, active && styles.tabTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: LOGO_BG },
  brandBlock: { alignItems: "center" },
  logo: { width: 150, height: 150 * (775 / 820) },
  brand: { fontFamily: serif, fontSize: 44, color: colors.primary, marginTop: -4 },
  motto: { fontSize: 11, letterSpacing: 3.5, color: colors.text, textAlign: "center", marginTop: 6 },
  title: { fontSize: 10, fontWeight: "800", letterSpacing: 2, color: "#111A15", textAlign: "center" },
  tabs: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, alignItems: "center", paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: "transparent", marginBottom: -1 },
  tabOn: { borderBottomColor: colors.primary },
  tabText: { fontSize: 15, color: colors.muted },
  tabTextOn: { color: colors.primary, fontWeight: "600" },
  form: { gap: 20 },
  forgotRow: { alignItems: "flex-end", justifyContent: "center", minHeight: 20 },
  forgotText: { fontSize: 13.5, color: colors.primary },
  codeInfo: { fontSize: 14, color: colors.text, lineHeight: 21 },
  codeEmail: { fontWeight: "600" },
  codeLinks: { flexDirection: "row", justifyContent: "space-between" },
  or: { flexDirection: "row", alignItems: "center", gap: 12 },
  rule: { flex: 1, height: 1, backgroundColor: colors.border },
  orText: { fontSize: 12, color: colors.muted, letterSpacing: 1 },
  google: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#CFC8BD",
    backgroundColor: colors.card,
    borderRadius: 999,
    paddingVertical: 15,
  },
  googleText: { fontSize: 15, color: colors.text, fontWeight: "500" },
});
