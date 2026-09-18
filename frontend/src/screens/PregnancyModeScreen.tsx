import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useApp } from "../AppContext";
import { ScreenHeader } from "../components/common";
import { RootStackParamList } from "../navigation/types";
import { Settings } from "../storage";
import { colors, serif, shadow } from "../theme";

const OPTIONS: { key: keyof Settings; icon: keyof typeof Ionicons.glyphMap; title: string; text: string }[] = [
  { key: "pregnancyMode", icon: "woman-outline", title: "Hamilelik Modu Aktif", text: "Ürün sayfalarında hamilelik değerlendirmesini göster." },
  { key: "highlightRisky", icon: "heart-outline", title: "Riskli içerikleri göster", text: "Hamilelikte önerilmeyen içerikleri kırmızı ile işaretle." },
  { key: "showNotes", icon: "information-circle-outline", title: "Bilgilendirici notlar", text: "İşaretlenen içeriklerin açıklamalarını göster." },
];

export function PregnancyModeScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "PregnancyMode">) {
  const { settings, updateSettings } = useApp();

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Hamilelik Modu" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Ionicons name="heart" size={56} color={colors.danger} />
          <Text style={styles.title}>Senin ve bebeğinin{"\n"}güvenliği bizim için önemli.</Text>
          <Text style={styles.text}>
            Hamilelik döneminde kullanılması önerilmeyen içerikleri senin için işaretliyoruz. Unutma, bu bilgiler tıbbi tavsiyenin yerine geçmez.
          </Text>
        </View>

        <View style={styles.card}>
          {OPTIONS.map((o, i) => (
            <View key={o.key} style={[styles.row, i > 0 && styles.divider]}>
              <Ionicons name={o.icon} size={24} color={colors.danger} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{o.title}</Text>
                <Text style={styles.rowText}>{o.text}</Text>
              </View>
              <Switch
                value={settings[o.key]}
                onValueChange={(value) => updateSettings({ [o.key]: value })}
                trackColor={{ true: colors.primary, false: "#DDD" }}
                thumbColor="#fff"
              />
            </View>
          ))}
        </View>

        <View style={styles.notice}>
          <Ionicons name="alert-circle" size={20} color={colors.warning} />
          <Text style={styles.noticeText}>
            <Text style={{ fontWeight: "700" }}>Her zaman doktoruna danış. </Text>
            Uygulamada yer alan bilgiler bilgilendirme amaçlıdır, tıbbi tavsiyenin yerine geçmez.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 20, paddingBottom: 40 },
  hero: { alignItems: "center", gap: 10 },
  title: { fontFamily: serif, fontSize: 22, fontWeight: "700", color: colors.text, textAlign: "center", lineHeight: 30 },
  text: { color: colors.muted, textAlign: "center", lineHeight: 20 },
  card: { backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 16, ...shadow },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  rowTitle: { fontWeight: "600", color: colors.text, fontSize: 15 },
  rowText: { color: colors.muted, fontSize: 12, marginTop: 2 },
  notice: { flexDirection: "row", gap: 10, backgroundColor: colors.warningLight, borderRadius: 16, padding: 14, alignItems: "flex-start" },
  noticeText: { flex: 1, color: colors.text, lineHeight: 19, fontSize: 13 },
});
