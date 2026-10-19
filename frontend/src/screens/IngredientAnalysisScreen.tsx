import { Ionicons } from "@react-native-vector-icons/ionicons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "../components/Text";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getIngredientDetails, IngredientRowDetails } from "../api";
import { useApp } from "../AppContext";
import { BackButton, PrimaryButton, Tag } from "../components/common";
import { ExplainButton, ExplanationText, useExplanations } from "../components/Explanation";
import { ingredientRoles } from "../ingredientInfo";
import { lowerTr, parseIngredients } from "../ingredients";
import { RootStackParamList } from "../navigation/types";
import { colors, serif } from "../theme";

const PREVIEW = 5;

interface Row {
  text: string;
  /** Up to two tags saying what it does. */
  roles: string[];
  /** "Kaçın" / "Dikkat", as the product screen marks the substance; null when not flagged. */
  flag: "Kaçın" | "Dikkat" | null;
  /** The name its explanation is asked for (the INCI name when known, so spellings share one). */
  explainAs: string;
}

export function IngredientAnalysisScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, "IngredientAnalysis">) {
  const insets = useSafeAreaInsets();
  const { settings } = useApp();
  const { product, fromScan } = route.params;
  const tokens = parseIngredients(product.ingredientsText);
  const [details, setDetails] = useState<{ rows: IngredientRowDetails[]; unplaced: string[] } | null>(null);
  const [expanded, setExpanded] = useState(tokens.length <= PREVIEW + 1);
  const explanations = useExplanations();

  // What each row does and which are flagged, read by the server the way the score was (by name only, the
  // flagged rows could miss a substance the product screen lists under another spelling).
  useEffect(() => {
    let live = true;
    getIngredientDetails(
      tokens.map((t) => t.slice(0, 300)).slice(0, 300),
      product.flaggedIngredients.map((f) => f.inciName)
    ).then(
      (result) => live && setDetails(result),
      () => {} // without it, the list falls back to name matching and the app's own role tags
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.ingredientsText]);

  /** How the product screen marks a flagged substance (FlaggedRow there). */
  const flagOf = (names: string[]): Row["flag"] => {
    const entries = product.flaggedIngredients.filter((f) => names.some((n) => lowerTr(n) === lowerTr(f.inciName)));
    if (!entries.length) return null;
    const avoid = entries.some((f) => f.restrictionType === "banned" || (f.restrictionType === "pregnancy_unsafe" && settings.highlightRisky));
    return avoid ? "Kaçın" : "Dikkat";
  };

  const rows: Row[] = tokens.map((text, i) => {
    const server = details?.rows[i];
    const roles = [...new Set([...ingredientRoles(text), ...(server?.functions ?? [])])].slice(0, 2);
    const flag = server ? flagOf(server.flagged) : flagOf([text]);
    return { text, roles, flag, explainAs: server?.inciName ?? text };
  });
  // Flagged substances the list doesn't name in a way the server could tie to a row: listed on their own.
  for (const name of details?.unplaced ?? []) rows.push({ text: name, roles: [], flag: flagOf([name]), explainAs: name });

  const shown = expanded ? rows : rows.slice(0, PREVIEW);

  function showResults() {
    if (fromScan) navigation.replace("ProductDetail", { barcode: product.barcode, product });
    else navigation.goBack();
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <BackButton onPress={() => navigation.goBack()} />
        <View style={styles.basket}>
          <Ionicons name="basket-outline" size={34} color={colors.line} />
          <Ionicons name="leaf" size={14} color={colors.primaryMint} style={styles.basketLeaf} />
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 110 + insets.bottom }]}>
        <Text style={styles.title}>{fromScan ? "Ürün içeriği okundu" : "Ürün içeriği"}</Text>
        <Text style={styles.sub}>İçerikler analiz edildi. Bir maddenin ne işe yaradığını görmek için "Ne işe yarar?" düğmesine dokun.</Text>

        <View style={styles.list}>
          {shown.map((row, i) => {
            const key = `${i}`;
            const open = explanations.open === key;
            return (
              <View key={key} style={styles.row}>
                <View style={styles.rowTop}>
                  <View style={styles.rowMain}>
                    <Text style={styles.name}>{row.text}</Text>
                    <View style={styles.tags}>
                      {row.flag && <Tag label={row.flag} tone="clay" />}
                      {row.roles.map((r) => (
                        <Tag key={r} label={r} tone="solid" />
                      ))}
                      {/* Every row says something: one the server read but couldn't describe, or still loading. */}
                      {!row.roles.length && !row.flag && <Tag label={details ? "Tanınmadı" : "…"} tone="gray" />}
                    </View>
                  </View>
                  <ExplainButton open={open} onPress={() => explanations.toggle(key, row.explainAs)} />
                </View>
                {open && <ExplanationText value={explanations.explanation(row.explainAs)} />}
              </View>
            );
          })}
          {!expanded && (
            <Pressable style={[styles.row, styles.more]} onPress={() => setExpanded(true)}>
              <Text style={styles.moreText}>{`Tüm içerikleri göster (${rows.length})`}</Text>
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
  row: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowMain: { flex: 1, gap: 6 },
  name: { fontSize: 15, fontWeight: "500", color: colors.text },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  more: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  moreText: { fontSize: 14, color: colors.text },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 10, backgroundColor: colors.bg },
});
