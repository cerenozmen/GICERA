import { Ionicons } from "@react-native-vector-icons/ionicons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { EmptyState, ScreenHeader } from "../components/common";
import { parseIngredients } from "../ingredients";
import { RootStackParamList } from "../navigation/types";
import { colors, shadow } from "../theme";
import { FlaggedCard } from "./ProductDetailScreen";

export function IngredientAnalysisScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, "IngredientAnalysis">) {
  const { product } = route.params;
  const tokens = parseIngredients(product.ingredientsText);
  const flagged = product.flaggedIngredients;
  const [tab, setTab] = useState<"all" | "flagged">("all");

  function showSources() {
    Alert.alert(
      "Skorlama nasıl yapılıyor?",
      "İçerikler, AB Kozmetik Tüzüğü'nün resmi madde veritabanı CosIng ile karşılaştırılır: yasaklı maddeler (Ek II) skoru en çok düşürür, kısıtlı maddeler (Ek III) orta, düzenlemeye tabi renklendirici/koruyucu/UV filtreleri ve tartışmalı maddeler az düşürür. Hamilelik uyarıları ayrıca derlenmiş bir listeden gelir ve tıbbi tavsiye yerine geçmez.\n\nÜrün bilgileri Open Beauty Facts topluluğundan alınır."
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title="İçerik Analizi" onBack={() => navigation.goBack()} />
      <View style={styles.pills}>
        <Pill label={`Tüm İçerikler (${tokens.length})`} active={tab === "all"} onPress={() => setTab("all")} />
        <Pill label={`Dikkat Edilmesi Gerekenler (${flagged.length})`} active={tab === "flagged"} onPress={() => setTab("flagged")} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {tab === "all" ? (
          <View style={styles.listCard}>
            {tokens.map((t, i) => (
              <View key={i} style={[styles.row, i > 0 && styles.divider]}>
                <View style={styles.dot} />
                <Text style={styles.name}>{t}</Text>
              </View>
            ))}
          </View>
        ) : flagged.length === 0 ? (
          <EmptyState icon="checkmark-circle-outline" title="Dikkat gerektiren içerik yok" text="Bu üründe işaretlenmiş bir madde bulunmuyor." />
        ) : (
          <View style={{ gap: 10 }}>
            {flagged.map((item, i) => (
              <FlaggedCard key={i} item={item} />
            ))}
          </View>
        )}

        <Pressable style={styles.info} onPress={showSources}>
          <Ionicons name="document-text-outline" size={24} color={colors.danger} />
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>Bu içerikler ne anlama geliyor?</Text>
            <Text style={styles.infoText}>İçerik analizinde kullandığımız kaynakları ve skorlama kriterlerini incele</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Pill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, active && styles.pillActive]}>
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pills: { flexDirection: "row", gap: 8, paddingHorizontal: 20, paddingVertical: 8, flexWrap: "wrap" },
  pill: { backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  pillActive: { backgroundColor: colors.primary },
  pillText: { fontSize: 13, color: colors.text },
  pillTextActive: { color: "#fff", fontWeight: "600" },
  content: { padding: 20, gap: 16, paddingBottom: 40 },
  listCard: { backgroundColor: colors.card, borderRadius: 18, paddingHorizontal: 16, ...shadow },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.border },
  name: { flex: 1, fontSize: 15, color: colors.text },
  info: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.blushLight, borderRadius: 18, padding: 16 },
  infoTitle: { fontWeight: "700", color: colors.text },
  infoText: { color: colors.muted, fontSize: 13, marginTop: 2 },
});
