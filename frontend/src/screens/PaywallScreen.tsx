import { Ionicons } from "@react-native-vector-icons/ionicons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PrimaryButton } from "../components/common";
import { Text } from "../components/Text";
import { RootStackParamList } from "../navigation/types";
import { FREE_SCANS, formatPrice, PLANS, PlanId, yearlyPerMonth, yearlySavingsPercent } from "../subscription";
import { colors, serif } from "../theme";

const BENEFITS = [
  "Sınırsız barkod okuma",
  "Her ürün için içerik analizi ve cilt uyumu",
  "Hamilelik modu ve kısıtlı madde uyarıları",
];

/** Full-screen paywall, opened when the free barcode reads run out. */
export function PaywallScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "Paywall">) {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<PlanId>("yearly");

  function close() {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.reset({ index: 0, routes: [{ name: "Main" }] });
  }

  function subscribe() {
    // Billing isn't connected yet: say so instead of pretending a purchase happened.
    Alert.alert("Çok yakında", "Ödeme altyapısı henüz hazır değil. Planlar yakında açılacak.");
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 24, paddingBottom: 24, gap: 22 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.closeRow}>
          <Pressable style={styles.close} onPress={close} hitSlop={10} accessibilityLabel="Kapat">
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="sparkles" size={34} color="#fff" />
          </View>
          <Text style={styles.title}>Ücretsiz {FREE_SCANS} taramanı kullandın</Text>
          <Text style={styles.subtitle}>Okumaya devam etmek için bir plan seç.</Text>
        </View>

        <View style={styles.benefits}>
          {BENEFITS.map((text) => (
            <View key={text} style={styles.benefit}>
              <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
              <Text style={styles.benefitText}>{text}</Text>
            </View>
          ))}
        </View>

        <View style={styles.plans}>
          <PlanCard
            plan="yearly"
            selected={selected === "yearly"}
            onPress={() => setSelected("yearly")}
            badge={`%${yearlySavingsPercent()} tasarruf`}
            note={`Ayda yalnızca ${formatPrice(yearlyPerMonth())}`}
          />
          <PlanCard plan="monthly" selected={selected === "monthly"} onPress={() => setSelected("monthly")} note="İstediğin zaman iptal et" />
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        <View style={styles.cta}>
          <PrimaryButton label={`${PLANS[selected].label} planla devam et`} onPress={subscribe} />
        </View>
        <Pressable onPress={close} hitSlop={8}>
          <Text style={styles.later}>Şimdi değil</Text>
        </Pressable>
        <Text style={styles.legal}>
          Abonelik, mağaza hesabına yansıtılır ve dönem sonunda otomatik yenilenir. İstediğin zaman mağaza ayarlarından iptal edebilirsin.
        </Text>
      </View>
    </View>
  );
}

function PlanCard({ plan, selected, onPress, badge, note }: { plan: PlanId; selected: boolean; onPress: () => void; badge?: string; note: string }) {
  const { label, price, period } = PLANS[plan];
  return (
    <Pressable
      style={[styles.plan, selected && styles.planOn]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label} plan, ${formatPrice(price)} / ${period}`}
    >
      <View style={[styles.radio, selected && styles.radioOn]}>{selected && <View style={styles.radioDot} />}</View>
      <View style={styles.flex}>
        <View style={styles.planHead}>
          <Text style={styles.planName}>{label}</Text>
          {badge && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          )}
        </View>
        <Text style={styles.planNote}>{note}</Text>
      </View>
      <View style={styles.priceBox}>
        <Text style={styles.price}>{formatPrice(price)}</Text>
        <Text style={styles.period}>/ {period}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  closeRow: { alignItems: "flex-end" },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  hero: { alignItems: "center", gap: 10 },
  heroIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  title: { fontFamily: serif, fontSize: 28, lineHeight: 34, color: colors.text, textAlign: "center" },
  subtitle: { fontSize: 15, color: colors.muted, textAlign: "center" },
  benefits: { gap: 12, backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 16 },
  benefit: { flexDirection: "row", alignItems: "center", gap: 10 },
  benefitText: { flex: 1, fontSize: 14.5, color: colors.text },
  plans: { gap: 12 },
  plan: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderRadius: 18, borderWidth: 1.5, borderColor: colors.border, padding: 16 },
  planOn: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  radioOn: { borderColor: colors.primary },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },
  planHead: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  planName: { fontSize: 16, fontWeight: "700", color: colors.text },
  planNote: { fontSize: 12.5, color: colors.muted, marginTop: 2 },
  badge: { backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: "700", color: "#fff" },
  priceBox: { alignItems: "flex-end" },
  price: { fontSize: 17, fontWeight: "700", color: colors.text },
  period: { fontSize: 12, color: colors.muted },
  footer: { paddingHorizontal: 24, paddingTop: 12, gap: 12, alignItems: "center", backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border },
  cta: { alignSelf: "stretch" },
  later: { fontSize: 14, fontWeight: "600", color: colors.muted, paddingVertical: 2 },
  legal: { fontSize: 11, lineHeight: 15, color: colors.muted, textAlign: "center" },
});
