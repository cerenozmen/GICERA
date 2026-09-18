import { Ionicons } from "@expo/vector-icons";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../AppContext";
import { MainTabParamList, RootStackParamList } from "../navigation/types";
import { colors, serif, shadow } from "../theme";

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, "Profile">,
  NativeStackScreenProps<RootStackParamList>
>;

export function ProfileScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { history, favorites, settings, clearHistory } = useApp();

  function confirmClearHistory() {
    Alert.alert("Tarama geçmişi silinsin mi?", "Bu işlem geri alınamaz. Favorilerin silinmez.", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Sil",
        style: "destructive",
        onPress: clearHistory,
      },
    ]);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 32, gap: 18 }}>
      <Text style={styles.title}>Profil</Text>

      <View style={styles.stats}>
        <Stat value={history.length} label="Taranan Ürün" />
        <Stat value={favorites.length} label="Favori" />
      </View>

      <View style={styles.card}>
        <MenuRow
          icon="woman-outline"
          label={`Hamilelik Modu${settings.pregnancyMode ? " (aktif)" : ""}`}
          onPress={() => navigation.navigate("PregnancyMode")}
        />
        <MenuRow icon="trash-outline" label="Tarama geçmişini sil" onPress={confirmClearHistory} divider />
      </View>

      <View style={styles.tip}>
        <Ionicons name="leaf" size={36} color={colors.primary} />
        <Text style={styles.tipText}>Daha temiz bir güzellik dünyası için Gicera'yı kullandığın için teşekkürler.</Text>
      </View>
    </ScrollView>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MenuRow({ icon, label, onPress, divider }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; divider?: boolean }) {
  return (
    <Pressable style={[styles.menuRow, divider && styles.divider]} onPress={onPress}>
      <Ionicons name={icon} size={22} color={colors.danger} />
      <Text style={styles.menuLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={20} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  title: { fontFamily: serif, fontSize: 30, fontWeight: "700", color: colors.text },
  stats: { flexDirection: "row", gap: 12 },
  stat: { flex: 1, backgroundColor: colors.card, borderRadius: 18, paddingVertical: 16, alignItems: "center", ...shadow },
  statValue: { fontSize: 26, fontWeight: "700", color: colors.text },
  statLabel: { color: colors.muted, fontSize: 12, marginTop: 2 },
  card: { backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 16, ...shadow },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 16 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  menuLabel: { flex: 1, fontSize: 15, color: colors.text },
  tip: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.blushLight, borderRadius: 20, padding: 18 },
  tipText: { flex: 1, color: colors.text, lineHeight: 20 },
});
