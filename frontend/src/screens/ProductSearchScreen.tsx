import { Ionicons } from "@react-native-vector-icons/ionicons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { searchProducts } from "../api";
import { useApp } from "../AppContext";
import { BackButton, EmptyState, ScoreChip, Thumb } from "../components/common";
import { RootStackParamList } from "../navigation/types";
import { colors, serif } from "../theme";
import { Product } from "../types";

const BARCODE = /^\d{8,14}$/;

export function ProductSearchScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "ProductSearch">) {
  const insets = useSafeAreaInsets();
  const { recordScan } = useApp();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  // Searches once typing settles; a barcode is opened directly instead (on submit).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || BARCODE.test(q)) {
      setResults(null);
      return;
    }
    const call = ++latest.current;
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const found = await searchProducts(q);
        if (call === latest.current) {
          setResults(found);
          setError(null);
        }
      } catch (err) {
        if (call === latest.current) setError(err instanceof Error ? err.message : "Arama yapılamadı.");
      } finally {
        if (call === latest.current) setBusy(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  function open(product: Product) {
    recordScan(product);
    navigation.navigate("ProductDetail", { barcode: product.barcode, product });
  }

  function submit() {
    const q = query.trim();
    if (BARCODE.test(q)) navigation.navigate("ProductDetail", { barcode: q });
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.pad}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Ürün ara</Text>
        <View style={styles.search}>
          <Ionicons name="search-outline" size={20} color={colors.muted} />
          <TextInput
            style={styles.input}
            placeholder="Ürün adı, marka veya barkod"
            placeholderTextColor={colors.muted}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={submit}
            returnKeyType="search"
            autoFocus
          />
          {busy && <ActivityIndicator color={colors.primary} />}
        </View>
        {BARCODE.test(query.trim()) && (
          <Pressable style={styles.barcodeRow} onPress={submit}>
            <Ionicons name="barcode-outline" size={20} color={colors.primary} />
            <Text style={styles.barcodeText}>{`${query.trim()} barkodlu ürünü aç`}</Text>
          </Pressable>
        )}
      </View>
      <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
        {error ? (
          <EmptyState icon="cloud-offline-outline" title="Arama yapılamadı" text={error} />
        ) : results?.length === 0 ? (
          <EmptyState icon="search-outline" title="Sonuç bulunamadı" text="Farklı bir yazım dene ya da ürünün içerik listesini tara." />
        ) : (
          results?.map((p) => (
            <Pressable key={p.barcode} style={styles.row} onPress={() => open(p)}>
              <Thumb uri={p.imageUrl} />
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {p.productName ?? "İsimsiz ürün"}
                </Text>
                {!!p.brands && (
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {p.brands}
                  </Text>
                )}
                <View style={styles.chipRow}>
                  <ScoreChip rating={p.cleanRating} score={p.cleanScore} />
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { paddingHorizontal: 20 },
  title: { fontFamily: serif, fontSize: 30, color: colors.text, marginTop: 16 },
  search: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 14, marginTop: 14 },
  input: { flex: 1, paddingVertical: 12, color: colors.text, fontSize: 15 },
  barcodeRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  barcodeText: { color: colors.primary, fontSize: 14, fontWeight: "500" },
  list: { padding: 20, gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 12 },
  rowBody: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 15, fontWeight: "600", color: colors.text },
  rowSub: { fontSize: 13, color: colors.muted },
  chipRow: { flexDirection: "row", marginTop: 2 },
});
