import { createNavigationContainerRef, DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { useEffect, useRef } from "react";
import { Linking, StatusBar, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider, useApp } from "./src/AppContext";
import { AuthProvider, useAuth } from "./src/AuthContext";
import { RootStackParamList } from "./src/navigation/types";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { parseRecoveryLink, RecoveryLink } from "./src/recoveryLink";
import { colors } from "./src/theme";

const navTheme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.bg } };

const navigationRef = createNavigationContainerRef<RootStackParamList>();

function openRecovery(link: RecoveryLink) {
  navigationRef.navigate("ResetPassword", "failed" in link ? { failed: true } : link);
}

function Root() {
  const { ready: appReady } = useApp();
  const { ready: authReady } = useAuth();
  // A link that opened the app before the navigator existed waits here.
  const pending = useRef<RecoveryLink | null>(null);

  // The e-mailed password-reset link (gicera://reset-password#…): cold start and while the app is open.
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
      <AppProvider>
        <AuthProvider>
          <Root />
          <StatusBar barStyle="dark-content" />
        </AuthProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}
