import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { lookupBarcode } from "../api";
import { useApp } from "../AppContext";
import { EmptyState, ScreenHeader, Thumb } from "../components/common";
import { freeFromChecks, parseIngredients, summaryText } from "../ingredients";
import { RootStackParamList } from "../navigation/types";
import { colors, ratingStyle, serif, shadow } from "../theme";
import { FlaggedIngredient, Product, RestrictionType } from "../types";

const TABS = ["Genel Bakış", "İçerik", "Analiz"] as const;
type Tab = (typeof TABS)[number];

export const TYPE_LABEL: Record<RestrictionType, string> = {
  banned: "Yasaklı madde",
  restricted: "Kısıtlı madde",
  pregnancy_unsafe: "Hamilelikte önerilmez",
  controversial: "Dikkat edilmeli",
};

export function ProductDetailScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, "ProductDetail">) {
  const { barcode } = route.params;
  const isCustom = barcode.startsWith("custom:");
  const { isFavorite, toggleFavorite, recordScan } = useApp();
  const [product, setProduct] = useState<Product | null>(route.params.product ?? null);
  const [status, setStatus] = useState<"loading" | "error" | "notfound" | "ready">(route.params.product ? "ready" : "loading");
  const [tab, setTab] = useState<Tab>("Genel Bakış");

  useEffect(() => {
    if (route.params.product) return;
    lookupBarcode(barcode)
      .then((result) => {
        if (result.found) {
          setProduct(result.product);
          recordScan(result.product);
          setStatus("ready");
        } else setStatus("notfound");
      })
      .catch(() => setStatus("error"));
  }, [barcode]);

  if (status !== "ready" || !product) {
    return (
      <View style={styles.screen}>
        <ScreenHeader onBack={() => navigation.goBack()} />
        {status === "loading" && <ActivityIndicator style={{ marginTop: 80 }} color={colors.primary} />}
        {status === "notfound" && (
          <EmptyState icon="search-outline" title="Ürün bulunamadı" text={`${barcode} barkodlu ürün henüz veritabanımızda yok.`}>
            <ScanIngredientsButton onPress={() => navigation.replace("IngredientScan")} />
          </EmptyState>
        )}
        {status === "error" && (
          <EmptyState icon="cloud-offline-outline" title="Bağlantı hatası" text="Sunucuya ulaşılamadı. Bağlantını kontrol edip tekrar dene." />
        )}
      </View>
    );
  }

  const favorite = isFavorite(product.barcode);
  const analysed = !!product.ingredientsText?.trim() && product.cleanRating !== null && product.cleanScore !== null;

  return (
    <View style={styles.screen}>
      <ScreenHeader
        onBack={() => navigation.goBack()}
        right={
          <View style={styles.headerActions}>
            <Pressable
              hitSlop={10}
              onPress={() => Share.share({ message: `${product.productName ?? "Ürün"} - Gicera temizlik skoru: ${product.cleanScore ?? "-"}` })}
            >
              <Ionicons name="share-outline" size={24} color={colors.text} />
            </Pressable>
            {!isCustom && (
              <Pressable hitSlop={10} onPress={() => toggleFavorite(product)}>
                <Ionicons name={favorite ? "heart" : "heart-outline"} size={24} color={favorite ? colors.danger : colors.text} />
              </Pressable>
            )}
          </View>
        }
      />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.top}>
          <Thumb uri={product.imageUrl} size={96} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.name}>{product.productName ?? "İsimsiz ürün"}</Text>
            {product.brands && <Text style={styles.brand}>{product.brands}</Text>}
            <ScoreBadge product={product} analysed={analysed} />
          </View>
        </View>

        <View style={styles.tabs}>
          {TABS.map((t) => (
            <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]}>
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
            </Pressable>
          ))}
        </View>

        {!analysed ? (
          <>
            <View style={styles.unavailable}>
              <Ionicons name="information-circle-outline" size={22} color={colors.muted} />
              <Text style={styles.unavailableText}>
                Bu ürünün içerik listesi henüz girilmemiş, bu yüzden temizlik skoru hesaplanamadı.
              </Text>
            </View>
            <ScanIngredientsButton onPress={() => navigation.navigate("IngredientScan", { productName: product.productName ?? undefined })} />
          </>
        ) : (
          <>
            {isCustom && <Text style={styles.customNote}>Bu analiz senin çektiğin içerik listesine göre yapıldı, kayıtlı bir ürün değil.</Text>}
            {tab === "Genel Bakış" && <Overview product={product} onDetail={() => navigation.navigate("IngredientAnalysis", { product })} />}
            {tab === "İçerik" && <IngredientList product={product} />}
            {tab === "Analiz" && <FlaggedList product={product} />}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function ScanIngredientsButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={styles.scanButton} onPress={onPress}>
      <Ionicons name="camera-outline" size={20} color="#fff" />
      <Text style={styles.scanButtonText}>İçerik listesini fotoğrafla</Text>
    </Pressable>
  );
}

function ScoreBadge({ product, analysed }: { product: Product; analysed: boolean }) {
  if (!analysed || !product.cleanRating) {
    return (
      <View style={[styles.badge, { backgroundColor: "#EEE" }]}>
        <Text style={[styles.badgeText, { color: colors.muted }]}>Analiz edilemedi</Text>
      </View>
    );
  }
  const style = ratingStyle[product.cleanRating];
  return (
    <View style={[styles.badge, { backgroundColor: style.bg }]}>
      <Ionicons name={product.cleanRating === "clean" ? "checkmark-circle" : "alert-circle"} size={24} color={style.color} />
      <View>
        <Text style={[styles.badgeText, { color: style.color }]}>{style.label}</Text>
        <Text style={[styles.badgeScore, { color: style.color }]}>{product.cleanScore}/100</Text>
      </View>
    </View>
  );
}

function Overview({ product, onDetail }: { product: Product; onDetail: () => void }) {
  const { settings } = useApp();
  const checks = freeFromChecks(product);
  return (
    <View style={{ gap: 14 }}>
      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>Bu ürün senin için ne ifade ediyor?</Text>
        <Text style={styles.summaryText}>{summaryText(product)}</Text>
      </View>

      <View style={{ gap: 10 }}>
        {checks.map((c) => (
          <CheckRow key={c.label} ok={c.free} text={c.free ? `${c.label} içermez` : `${c.label} içerir`} />
        ))}
        {settings.pregnancyMode && (
          <CheckRow
            ok={product.pregnancySafe !== false}
            text={product.pregnancySafe === false ? "Hamilelikte dikkat gerektiriyor" : "Hamilelikte genellikle güvenli"}
          />
        )}
      </View>

      <Pressable style={styles.detailButton} onPress={onDetail}>
        <Text style={styles.detailButtonText}>Detaylı içerik analizi</Text>
        <Ionicons name="arrow-forward" size={16} color={colors.danger} />
      </Pressable>
    </View>
  );
}

function CheckRow({ ok, text }: { ok: boolean; text: string }) {
  return (
    <View style={styles.checkRow}>
      <Ionicons name={ok ? "checkmark-circle" : "close-circle"} size={22} color={ok ? colors.primary : colors.danger} />
      <Text style={styles.checkText}>{text}</Text>
    </View>
  );
}

function IngredientList({ product }: { product: Product }) {
  const tokens = parseIngredients(product.ingredientsText);
  return (
    <View style={styles.listCard}>
      {tokens.map((t, i) => (
        <View key={i} style={[styles.ingredientRow, i > 0 && styles.divider]}>
          <Text style={styles.ingredientName}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

export function FlaggedCard({ item }: { item: FlaggedIngredient }) {
  const { settings } = useApp();
  const risky = item.restrictionType === "banned" || item.restrictionType === "restricted";
  const pregnancy = item.restrictionType === "pregnancy_unsafe";
  const tone = risky || (pregnancy && settings.highlightRisky) ? colors.danger : colors.warning;
  const bg = tone === colors.danger ? colors.dangerLight : colors.warningLight;
  return (
    <View style={[styles.flagCard, { backgroundColor: bg }]}>
      <Text style={[styles.flagType, { color: tone }]}>{TYPE_LABEL[item.restrictionType]}</Text>
      <Text style={styles.flagName}>{item.inciName}</Text>
      {settings.showNotes && item.notes && <Text style={styles.flagNote}>{item.notes}</Text>}
    </View>
  );
}

function FlaggedList({ product }: { product: Product }) {
  if (product.flaggedIngredients.length === 0) {
    return <EmptyState icon="checkmark-circle-outline" title="Dikkat gerektiren içerik yok" text="Bu üründe işaretlenmiş bir madde bulunmuyor." />;
  }
  return (
    <View style={{ gap: 10 }}>
      {product.flaggedIngredients.map((item, i) => (
        <FlaggedCard key={i} item={item} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerActions: { flexDirection: "row", gap: 16 },
  content: { padding: 20, gap: 18, paddingBottom: 40 },
  top: { flexDirection: "row", gap: 16, alignItems: "center" },
  name: { fontFamily: serif, fontSize: 21, fontWeight: "700", color: colors.text },
  brand: { color: colors.muted, fontSize: 14 },
  badge: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8, marginTop: 6 },
  badgeText: { fontWeight: "700", fontSize: 15 },
  badgeScore: { fontSize: 13, fontWeight: "600" },
  tabs: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { paddingVertical: 10, paddingHorizontal: 12, marginBottom: -1, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { color: colors.muted, fontSize: 14 },
  tabTextActive: { color: colors.primary, fontWeight: "700" },
  summary: { backgroundColor: colors.blushLight, borderRadius: 18, padding: 16, gap: 6 },
  summaryTitle: { fontWeight: "700", fontSize: 15, color: colors.text },
  summaryText: { color: colors.text, lineHeight: 20, fontSize: 14 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  checkText: { fontSize: 15, color: colors.text },
  detailButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.blushLight, borderRadius: 999, paddingVertical: 12 },
  detailButtonText: { color: colors.danger, fontWeight: "600" },
  unavailable: { flexDirection: "row", gap: 10, backgroundColor: "#EFEFEF", borderRadius: 16, padding: 16, alignItems: "flex-start" },
  customNote: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  scanButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 13, paddingHorizontal: 22 },
  scanButtonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  unavailableText: { flex: 1, color: colors.muted, lineHeight: 20 },
  listCard: { backgroundColor: colors.card, borderRadius: 18, paddingHorizontal: 16, ...shadow },
  ingredientRow: { paddingVertical: 13 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  ingredientName: { fontSize: 15, color: colors.text },
  flagCard: { borderRadius: 16, padding: 14, gap: 4 },
  flagType: { fontWeight: "700", fontSize: 12, textTransform: "uppercase" },
  flagName: { fontWeight: "600", fontSize: 15, color: colors.text },
  flagNote: { color: colors.muted, fontSize: 13, lineHeight: 18 },
});
