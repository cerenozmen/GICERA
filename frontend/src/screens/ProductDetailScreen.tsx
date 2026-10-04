import { Ionicons } from "@react-native-vector-icons/ionicons";
import type { IconName } from "../components/icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { lookupBarcode } from "../api";
import { useApp } from "../AppContext";
import { BackButton, EmptyState, PrimaryButton, Thumb } from "../components/common";
import { FixIngredients } from "../components/FixIngredients";
import { ProgressRing } from "../components/ProgressRing";
import { isBeneficial } from "../ingredientInfo";
import { freeFromChecks, parseIngredients, resultState, summaryText } from "../ingredients";
import { RootStackParamList } from "../navigation/types";
import { Period, ROUTINES } from "../routine";
import { colors, serif } from "../theme";
import { CleanRating, FlaggedIngredient, Product, RestrictionType } from "../types";

export const TYPE_LABEL: Record<RestrictionType, string> = {
  banned: "Yasaklı madde",
  restricted: "Kısıtlı madde",
  pregnancy_unsafe: "Hamilelikte önerilmez",
  controversial: "Dikkat edilmeli",
};

const VERDICT: Record<CleanRating, { title: string; why: string; icon: IconName; color: string }> = {
  clean: { title: "Cildine uygun", why: "Neden uygun?", icon: "checkmark-circle", color: "#3E8E5E" },
  moderate: { title: "Dikkatli kullan", why: "Neden dikkat?", icon: "alert-circle", color: colors.accent },
  riskli: { title: "Önerilmez", why: "Neden önerilmez?", icon: "close-circle", color: colors.danger },
};

/** The score card, in the home screen's green-card style; the ring takes the rating's tone. */
const SCORE_TONE: Record<CleanRating, { ring: string; title: string; text: string }> = {
  clean: { ring: "#8CC79A", title: "Temiz", text: "İçeriği genel olarak güvenli görünüyor." },
  moderate: { ring: "#F5A26B", title: "Orta", text: "Dikkat edilmesi gereken içerikler var." },
  riskli: { ring: "#E8806F", title: "Riskli", text: "Riskli veya kısıtlı içerikler bulundu." },
};

/** Only banned substances are "avoid"; restricted ones are allowed within limits, so they count as "caution". */
const isAvoid = (f: FlaggedIngredient) => f.restrictionType === "banned";

function showSources() {
  Alert.alert(
    "Skorlama nasıl yapılıyor?",
    "İçerikler, AB Kozmetik Tüzüğü'nün resmi madde veritabanı CosIng ile karşılaştırılır: yasaklı maddeler (Ek II) skoru en çok düşürür, kısıtlı maddeler (Ek III) orta, düzenlemeye tabi renklendirici/koruyucu/UV filtreleri ve tartışmalı maddeler az düşürür. Hamilelik uyarıları ayrıca derlenmiş bir listeden gelir ve tıbbi tavsiye yerine geçmez.\n\nİçerik rolleri (Nemlendirici, Yatıştırıcı vb.) bilgilendirme amaçlıdır ve skoru etkilemez.\n\nÜrün bilgileri Open Beauty Facts topluluğundan alınır."
  );
}

export function ProductDetailScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, "ProductDetail">) {
  const insets = useSafeAreaInsets();
  const { barcode } = route.params;
  const isCustom = barcode.startsWith("custom:");
  const { isFavorite, toggleFavorite, recordScan, settings, setRoutineProduct } = useApp();
  const [product, setProduct] = useState<Product | null>(route.params.product ?? null);
  const [status, setStatus] = useState<"loading" | "error" | "ready">(route.params.product ? "ready" : "loading");
  const [routineOpen, setRoutineOpen] = useState(false);

  useEffect(() => {
    if (route.params.product) return;
    lookupBarcode(barcode)
      .then((result) => {
        if (result.found) {
          setProduct(result.product);
          recordScan(result.product);
          setStatus("ready");
        } else navigation.replace("ProductNotFound", { barcode });
      })
      .catch(() => setStatus("error"));
  }, [barcode]);

  if (status !== "ready" || !product) {
    return (
      <View style={[styles.screen, styles.pad, { paddingTop: insets.top + 8 }]}>
        <BackButton onPress={() => navigation.goBack()} />
        {status === "loading" && <ActivityIndicator style={styles.loading} color={colors.primary} />}
        {status === "error" && (
          <EmptyState icon="cloud-offline-outline" title="Bağlantı hatası" text="Sunucuya ulaşılamadı. Bağlantını kontrol edip tekrar dene." />
        )}
      </View>
    );
  }

  /** A list re-analysed with names the user typed: shown here and kept in the history. */
  function applyFix(fixed: Product) {
    setProduct(fixed);
    recordScan(fixed);
  }

  const favorite = isFavorite(product.barcode);
  const state = resultState(product);
  const tokens = parseIngredients(product.ingredientsText);
  const nameLine = [product.productName, product.brands].filter(Boolean).join(" · ");

  const top = (
    <View style={[styles.topRow, { paddingTop: insets.top + 8 }]}>
      <BackButton onPress={() => navigation.goBack()} />
      <View style={styles.photo}>
        <Thumb uri={product.imageUrl} size={96} />
      </View>
    </View>
  );

  if (state !== "SCORE_AVAILABLE" || !product.cleanRating) {
    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          {top}
          {state === "SCAN_COMPLETE_ANALYSIS_BLOCKED" ? (
            <>
              {/* A list scanned whole whose analysis couldn't vouch for a score: the list, no score. */}
              <View style={styles.verdictRow}>
                <Ionicons name="list-circle" size={30} color={colors.primary} />
                <Text style={styles.verdict}>Ürün içeriği okundu</Text>
              </View>
              <Text style={styles.verdictText}>Skor hesaplanamadı.</Text>
              <View style={styles.notice}>
                <Ionicons name="information-circle-outline" size={22} color={colors.accent} />
                <Text style={styles.noticeText}>{blockedMessage(product)}</Text>
              </View>
              {!!product.rescanRoute && (
                <PrimaryButton
                  label="Tekrar tara"
                  icon="refresh-outline"
                  onPress={() => navigation.replace("IngredientScan", { productName: product.productName ?? undefined })}
                />
              )}
              {isCustom && <FixIngredients product={product} onFixed={applyFix} />}
              {!!product.unverifiedIngredients?.length && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Doğrulanamayan içerikler</Text>
                  {product.unverifiedIngredients.map((name, i) => (
                    <Text key={i} style={styles.bullet}>{`• ${name}`}</Text>
                  ))}
                </View>
              )}
              <LinkRow label={`Tüm içerikleri gör (${tokens.length})`} onPress={() => navigation.navigate("IngredientAnalysis", { product })} />
            </>
          ) : (
            <>
              <Text style={styles.verdict}>{product.productName ?? "İsimsiz ürün"}</Text>
              <View style={styles.notice}>
                <Ionicons name="information-circle-outline" size={22} color={colors.accent} />
                <Text style={styles.noticeText}>Bu ürünün içerik listesi henüz girilmemiş, bu yüzden temizlik skoru hesaplanamadı.</Text>
              </View>
              <PrimaryButton
                label="İçerik listesini tara"
                icon="camera-outline"
                onPress={() => navigation.navigate("IngredientScan", { productName: product.productName ?? undefined })}
              />
            </>
          )}
        </ScrollView>
      </View>
    );
  }

  const verdict = VERDICT[product.cleanRating];
  const beneficial = tokens.filter(isBeneficial);
  const avoid = product.flaggedIngredients.filter(isAvoid);
  const caution = product.flaggedIngredients.filter((f) => !isAvoid(f));
  const reasons: { ok: boolean; text: string }[] = [
    ...(beneficial.length ? [{ ok: true, text: `Faydalı içerikler barındırıyor (${beneficial.slice(0, 3).join(", ")}${beneficial.length > 3 ? "..." : ""}).` }] : []),
    ...freeFromChecks(product).map((c) => ({ ok: c.free, text: c.free ? `${c.label} içermez.` : `${c.label} içerir.` })),
    ...(settings.pregnancyMode
      ? [{ ok: product.pregnancySafe !== false, text: product.pregnancySafe === false ? "Hamilelikte dikkat gerektiriyor." : "Hamilelikte genellikle güvenli." }]
      : []),
  ];

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 110 + insets.bottom }]}>
        {top}
        <View style={styles.verdictRow}>
          <Ionicons name={verdict.icon} size={30} color={verdict.color} />
          <Text style={styles.verdict}>{verdict.title}</Text>
        </View>
        <Text style={styles.verdictText}>{summaryText(product)}</Text>
        {!!nameLine && (
          <Text style={styles.nameLine} numberOfLines={2}>
            {nameLine}
          </Text>
        )}

        <View style={styles.scoreCard}>
          <ProgressRing size={88} stroke={7} progress={(product.cleanScore ?? 0) / 100} color={SCORE_TONE[product.cleanRating].ring} track="rgba(255,255,255,0.18)">
            <Text style={styles.scoreValue}>{product.cleanScore}</Text>
            <Text style={styles.scoreMax}>/100</Text>
          </ProgressRing>
          <View style={styles.flex}>
            <Text style={styles.scoreLabel}>Temizlik skoru</Text>
            <Text style={styles.scoreTitle}>{SCORE_TONE[product.cleanRating].title}</Text>
            <Text style={styles.scoreText}>{SCORE_TONE[product.cleanRating].text}</Text>
          </View>
        </View>

        <View style={styles.stats}>
          <Stat value={beneficial.length} label="Faydalı içerik" color="#3E8E5E" />
          <Stat value={caution.length} label="Dikkat edilen içerik" color={colors.accent} />
          <Stat value={avoid.length} label="Kaçınılması gereken" color={avoid.length ? colors.danger : colors.text} />
        </View>

        {isCustom && <Text style={styles.customNote}>Bu analiz senin çektiğin içerik listesine göre yapıldı, kayıtlı bir ürün değil.</Text>}
        {isCustom && !!product.unverifiedIngredients?.length && (
          <Text style={styles.customNote}>
            {`Fotoğraftan okunan ${product.unverifiedIngredients.length} içerik doğrulanamadı (${product.unverifiedIngredients.join(", ")}). Bunlar skora dahil edilmedi; hiçbiri skoru etkileyebilecek bir maddeye benzemediği için skor gösteriliyor.`}
          </Text>
        )}

        {isCustom && !!product.manualFixes?.length && (
          <Text style={styles.customNote}>{`Elle düzeltilen: ${product.manualFixes.map((f) => `"${f.from}" → ${f.to}`).join(", ")}`}</Text>
        )}
        {isCustom && !!product.unverifiedIngredients?.length && <FixIngredients product={product} onFixed={applyFix} />}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{verdict.why}</Text>
          {reasons.map((r, i) => (
            <View key={i} style={styles.reason}>
              <Ionicons name={r.ok ? "checkmark-circle-outline" : "alert-circle-outline"} size={17} color={r.ok ? "#3E8E5E" : colors.accent} />
              <Text style={styles.reasonText}>{r.text}</Text>
            </View>
          ))}
        </View>

        {product.flaggedIngredients.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Dikkat edilmesi gerekenler</Text>
            {product.flaggedIngredients.map((item, i) => (
              <FlaggedRow key={i} item={item} divider={i > 0} />
            ))}
          </View>
        )}

        <LinkRow label="Ürün hakkında daha fazla bilgi" onPress={() => navigation.navigate("IngredientAnalysis", { product })} />
        <Pressable onPress={showSources} hitSlop={8}>
          <Text style={styles.sources}>Skorlama nasıl yapılıyor?</Text>
        </Pressable>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        <PrimaryButton label="Ürünü Rutine Ekle" style={styles.flex} onPress={() => setRoutineOpen(true)} />
        {!isCustom && (
          <Pressable style={styles.roundButton} onPress={() => toggleFavorite(product)} accessibilityLabel={favorite ? "Favorilerden çıkar" : "Favorilere ekle"}>
            <Ionicons name={favorite ? "bookmark" : "bookmark-outline"} size={22} color={colors.text} />
          </Pressable>
        )}
      </View>

      <RoutineSheet
        visible={routineOpen}
        onClose={() => setRoutineOpen(false)}
        onPick={(step, title) => {
          setRoutineProduct(step, product);
          setRoutineOpen(false);
          Alert.alert("Rutine eklendi", `${product.productName ?? "Ürün"} "${title}" adımına eklendi.`);
        }}
      />
    </View>
  );
}

function RoutineSheet({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (step: string, title: string) => void }) {
  const insets = useSafeAreaInsets();
  const { routineProducts } = useApp();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.grabber} />
        <Text style={styles.sheetTitle}>Hangi adıma eklensin?</Text>
        {(Object.keys(ROUTINES) as Period[]).map((period) => (
          <View key={period} style={styles.sheetGroup}>
            <Text style={styles.sheetPeriod}>{period}</Text>
            {ROUTINES[period].map((s) => (
              <Pressable key={s.key} style={styles.sheetRow} onPress={() => onPick(s.key, `${period} · ${s.title}`)}>
                <Text style={styles.sheetStep}>{s.title}</Text>
                <Text style={styles.sheetCurrent} numberOfLines={1}>
                  {routineProducts[s.key]?.productName ?? ""}
                </Text>
                <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
              </Pressable>
            ))}
          </View>
        ))}
      </View>
    </Modal>
  );
}

/**
 * Why a list read whole has no score, naming the names that withheld it: a name read unclearly could
 * be a substance that lowers the score, so it is never guessed.
 */
function blockedMessage(product: Product): string {
  const blockers = product.scoreBlockers;
  const quote = (names: string[]) => names.map((name) => `"${name}"`).join(", ");
  const parts: string[] = [];
  if (blockers?.misread.length) parts.push(`${quote(blockers.misread)} net okunamadı.`);
  if (blockers?.notInDictionary.length) parts.push(`${quote(blockers.notInDictionary)} içerik veritabanımızda bulunmuyor.`);
  if (!blockers || !parts.length) {
    return "İçerik listesi okundu ancak bazı içerikler güvenilir şekilde analiz edilemedi. Doğrulanamayan içerikler güvenli sayılmaz; yanlış bir skor göstermemek için skor hesaplanmadı.";
  }
  const many = blockers.misread.length + blockers.notInDictionary.length > 1;
  return (
    `${parts.join(" ")} ${many ? "Bu içerikler" : "Bu içerik"} puan düşüren bir madde olabileceği için tahmin edilmedi; yanlış bir skor göstermemek için skor hesaplanmadı.` +
    (blockers.misread.length ? " Yazıyı ortaya getirip tekrar tarayabilirsin." : "")
  );
}

function Stat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function LinkRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.linkRow} onPress={onPress}>
      <Ionicons name="information-circle-outline" size={22} color={colors.text} />
      <Text style={styles.linkText}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.text} />
    </Pressable>
  );
}

function FlaggedRow({ item, divider }: { item: FlaggedIngredient; divider?: boolean }) {
  const { settings } = useApp();
  const avoid = isAvoid(item) || (item.restrictionType === "pregnancy_unsafe" && settings.highlightRisky);
  const tone = avoid ? colors.danger : colors.accent;
  return (
    <View style={[styles.flagRow, divider && styles.divider]}>
      <Ionicons name="flask-outline" size={20} color={tone} />
      <View style={styles.flagBody}>
        <Text style={styles.flagName}>{item.inciName}</Text>
        <Text style={styles.flagNote}>{settings.showNotes && item.notes ? item.notes : TYPE_LABEL[item.restrictionType]}</Text>
      </View>
      <View style={[styles.badge, { backgroundColor: avoid ? colors.dangerLight : colors.accentLight }]}>
        <Ionicons name={avoid ? "close-circle" : "alert-circle"} size={11} color={tone} />
        <Text style={[styles.badgeText, { color: tone }]}>{avoid ? "Kaçın" : "Dikkat"}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { paddingHorizontal: 20 },
  flex: { flex: 1 },
  loading: { marginTop: 80 },
  content: { paddingHorizontal: 20, gap: 14, paddingBottom: 40 },
  topRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: -8 },
  photo: { width: 110, height: 110, borderRadius: 55, backgroundColor: "#F1ECE5", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  verdictRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  verdict: { fontFamily: serif, fontSize: 30, color: colors.text, flexShrink: 1 },
  verdictText: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: -6 },
  nameLine: { color: colors.muted, fontSize: 12, marginTop: -6 },
  scoreCard: { flexDirection: "row", alignItems: "center", gap: 18, backgroundColor: colors.primary, borderRadius: 20, padding: 18 },
  scoreValue: { color: "#fff", fontSize: 28, fontWeight: "700", lineHeight: 32 },
  scoreMax: { color: "rgba(255,255,255,0.75)", fontSize: 11, marginTop: -2 },
  scoreLabel: { fontSize: 12, color: "rgba(255,255,255,0.8)" },
  scoreTitle: { fontSize: 24, fontWeight: "600", color: "#fff", marginTop: 2 },
  scoreText: { fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 4, lineHeight: 17 },
  stats: { flexDirection: "row", gap: 8, marginTop: 4 },
  stat: { flex: 1 },
  statValue: { fontSize: 26, fontWeight: "600" },
  statLabel: { fontSize: 12, color: colors.muted, marginTop: 2 },
  customNote: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 16, gap: 10 },
  cardTitle: { fontSize: 15, fontWeight: "600", color: colors.text },
  bullet: { fontSize: 14, color: colors.text },
  reason: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  reasonText: { flex: 1, fontSize: 13, color: colors.muted, lineHeight: 19 },
  flagRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  flagBody: { flex: 1, gap: 2 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  badge: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: "600" },
  flagName: { fontWeight: "600", fontSize: 14, color: colors.text },
  flagNote: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 16 },
  linkText: { flex: 1, fontSize: 14, color: colors.text },
  sources: { textAlign: "center", fontSize: 13, color: colors.muted, textDecorationLine: "underline" },
  notice: { flexDirection: "row", gap: 10, backgroundColor: colors.accentLight, borderRadius: 16, padding: 14, alignItems: "flex-start" },
  noticeText: { flex: 1, color: colors.text, lineHeight: 20, fontSize: 14 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.bg },
  roundButton: { width: 54, height: 54, borderRadius: 27, borderWidth: 1, borderColor: "#D9D2C8", backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10 },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "#D8D2C8", marginBottom: 14 },
  sheetTitle: { fontFamily: serif, fontSize: 22, color: colors.text, marginBottom: 6 },
  sheetGroup: { marginTop: 10 },
  sheetPeriod: { fontSize: 13, color: colors.muted, marginBottom: 6 },
  sheetRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 },
  sheetStep: { fontSize: 15, fontWeight: "500", color: colors.text },
  sheetCurrent: { flex: 1, fontSize: 12, color: colors.muted, textAlign: "right" },
});
