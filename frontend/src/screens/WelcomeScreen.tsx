import { Ionicons } from "@react-native-vector-icons/ionicons";
import type { IconName } from "../components/icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../AppContext";
import { RootStackParamList } from "../navigation/types";
import { colors, serif } from "../theme";

const FEATURES: { icon: IconName; label: string }[] = [
  { icon: "barcode-outline", label: "Tara" },
  { icon: "analytics-outline", label: "Analiz Et" },
  { icon: "heart-outline", label: "Bilinçli Seç" },
  { icon: "happy-outline", label: "Daha İyi Ben Sen" },
];

export function WelcomeScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "Welcome">) {
  const insets = useSafeAreaInsets();
  const { markWelcomeSeen } = useApp();

  function start() {
    markWelcomeSeen();
    navigation.replace("Main");
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}>
      <View style={[styles.blob, { backgroundColor: colors.blush, top: 160, right: -90, width: 260, height: 260 }]} />
      <View style={[styles.blob, { backgroundColor: "#DCE8D9", bottom: 200, left: -110, width: 280, height: 280 }]} />

      <View style={styles.hero}>
        <Ionicons name="leaf" size={64} color={colors.primary} />
        <Text style={styles.logo}>Gicera</Text>
        <Text style={styles.tagline}>İçeriğini bil,{"\n"}kendine iyi bak.</Text>
      </View>

      <View style={styles.features}>
        {FEATURES.map((f) => (
          <View key={f.label} style={styles.feature}>
            <View style={styles.featureIcon}>
              <Ionicons name={f.icon} size={22} color={colors.primary} />
            </View>
            <Text style={styles.featureLabel}>{f.label}</Text>
          </View>
        ))}
      </View>

      <Pressable style={styles.button} onPress={start}>
        <Text style={styles.buttonText}>Hemen Başla</Text>
      </Pressable>
      <Text style={styles.footer}>Daha temiz bir güzellik dünyası için</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24, overflow: "hidden" },
  blob: { position: "absolute", borderRadius: 200, opacity: 0.7 },
  hero: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  logo: { fontFamily: serif, fontSize: 56, color: colors.primary },
  tagline: { fontFamily: serif, fontSize: 22, color: colors.text, textAlign: "center", lineHeight: 30, marginTop: 8 },
  features: { flexDirection: "row", justifyContent: "space-between", marginBottom: 28, paddingHorizontal: 4 },
  feature: { alignItems: "center", gap: 6, width: 72 },
  featureIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  featureLabel: { fontSize: 12, color: colors.text, textAlign: "center" },
  button: { backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 16, alignItems: "center" },
  buttonText: { color: "#fff", fontSize: 17, fontWeight: "600" },
  footer: { textAlign: "center", color: colors.muted, fontSize: 13, marginTop: 14 },
});
