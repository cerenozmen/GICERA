import { createNavigationContainerRef, DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { useEffect, useRef } from "react";
import { Alert, Linking, StatusBar, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider, useApp } from "./src/AppContext";
import { AuthProvider, useAuth } from "./src/AuthContext";
import { RootStackParamList } from "./src/navigation/types";
import { MAX_CONTENT_WIDTH } from "./src/responsive";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { parseRecoveryLink, RecoveryLink } from "./src/recoveryLink";
import { ScanQuotaSync } from "./src/ScanQuotaSync";
import { SkinProfileSync } from "./src/SkinProfileSync";
import { colors } from "./src/theme";

const navTheme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.bg } };

const navigationRef = createNavigationContainerRef<RootStackParamList>();

function Root() {
  const { ready: appReady } = useApp();
  const { ready: authReady, signInWithLink } = useAuth();
  // A link that opened the app before the navigator existed waits here.
  const pending = useRef<RecoveryLink | null>(null);

  /** The password-reset link opens its screen; the sign-up confirmation link signs in and goes home. */
  const openLink = useRef<(link: RecoveryLink) => void>(() => {});
  openLink.current = (link) => {
    if ("signup" in link) {
      signInWithLink(link.refreshToken).then(
        () => navigationRef.reset({ index: 0, routes: [{ name: "Main" }] }),
        (err: Error) => Alert.alert("Giriş yapılamadı", `${err.message} E-postan doğrulandı; e-posta ve şifrenle giriş yapabilirsin.`)
      );
      return;
    }
    navigationRef.navigate("ResetPassword", "failed" in link ? { failed: true } : link);
  };
  const openRecovery = (link: RecoveryLink) => openLink.current(link);

  // The e-mailed links (gicera://reset-password#…): cold start and while the app is open.
  useEffect(() => {
    const handle = (url: string | null) => {
      const link = parseRecoveryLink(url);
      if (!link) return;
      if (navigationRef.isReady()) openRecovery(link);
      else pending.current = link;
    };
    Linking.getInitialURL().then(handle);
    const subscription = Linking.addEventListener("url", ({ url }) => handle(url));
    return () => subscription.remove();
  }, []);

  if (!appReady || !authReady) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  return (
    <NavigationContainer
      ref={navigationRef}
      theme={navTheme}
      onReady={() => {
        if (pending.current) openRecovery(pending.current);
        pending.current = null;
      }}
    >
      <RootNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      {/* On tablets and in landscape the app stays one centered column instead of stretching edge to edge. */}
      <View style={styles.backdrop}>
        <View style={styles.column}>
          <AppProvider>
            <AuthProvider>
              <Root />
              <SkinProfileSync />
              <ScanQuotaSync />
              <StatusBar barStyle="dark-content" />
            </AuthProvider>
          </AppProvider>
        </View>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.surface },
  column: { flex: 1, width: "100%", maxWidth: MAX_CONTENT_WIDTH, alignSelf: "center", backgroundColor: colors.bg, overflow: "hidden" },
});
