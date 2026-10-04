import { Ionicons } from "@react-native-vector-icons/ionicons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BackButton, PrimaryButton, Tag } from "../components/common";
import { ingredientRoles } from "../ingredientInfo";
import { lowerTr, parseIngredients } from "../ingredients";
import { RootStackParamList } from "../navigation/types";
import { colors, serif } from "../theme";

const PREVIEW = 5;

export function IngredientAnalysisScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, "IngredientAnalysis">) {
  const insets = useSafeAreaInsets();
  const { product, fromScan } = route.params;
  const tokens = parseIngredients(product.ingredientsText);
  const flaggedNames = new Set(product.flaggedIngredients.map((f) => lowerTr(f.inciName)));
  const [expanded, setExpanded] = useState(tokens.length <= PREVIEW + 1);
  const shown = expanded ? tokens : tokens.slice(0, PREVIEW);

  function showResults() {
    if (fromScan) navigation.replace("ProductDetail", { barcode: product.barcode, product });
    else navigation.goBack();
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <BackButton onPress={() => navigation.goBack()} />
        <View style={styles.basket}>
          <Ionicons name="basket-outline" size={34} color="#C9C2B8" />
          <Ionicons name="leaf" size={14} color="#8FB59A" style={styles.basketLeaf} />
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 110 + insets.bottom }]}>
        <Text style={styles.title}>{fromScan ? "Ürün içeriği okundu" : "Ürün içeriği"}</Text>
        <Text style={styles.sub}>İçerikler analiz edildi. Sana en doğru sonuçları sunmak için değerlendirdik.</Text>

        <View style={styles.list}>
          {shown.map((t, i) => {
            const roles = ingredientRoles(t);
            const flagged = flaggedNames.has(lowerTr(t));
            return (
              <View key={i} style={styles.row}>
                <Text style={styles.name}>{t}</Text>
                <View style={styles.tags}>
                  {flagged && <Tag label="Dikkat" tone="orange" />}
                  {roles.slice(0, 2).map((r) => (
                    <Tag key={r} label={r} />
                  ))}
                </View>
              </View>
            );
          })}
          {!expanded && (
            <Pressable style={[styles.row, styles.more]} onPress={() => setExpanded(true)}>
              <Text style={styles.moreText}>{`Tüm içerikleri göster (${tokens.length})`}</Text>
              <Ionicons name="chevron-down" size={18} color={colors.text} />
            </Pressable>
          )}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <PrimaryButton label={fromScan ? "Analiz Sonuçlarını Göster" : "Analiz Sonuçlarına Dön"} onPress={showResults} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20 },
  basket: { width: 56, height: 56, alignItems: "center", justifyContent: "center" },
  basketLeaf: { position: "absolute", top: 8, right: 8 },
  content: { paddingHorizontal: 20, paddingTop: 12 },
  title: { fontFamily: serif, fontSize: 30, color: colors.text },
  sub: { fontSize: 14, color: colors.muted, lineHeight: 21, marginTop: 8, marginBottom: 18 },
  list: { gap: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 12, rowGap: 6, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  name: { fontSize: 15, fontWeight: "500", color: colors.text, minWidth: 110 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, flexShrink: 1 },
  more: { justifyContent: "space-between" },
  moreText: { fontSize: 14, color: colors.text },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 10, backgroundColor: colors.bg },
});
