import { Button, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { CleanRating, LookupResult, RestrictionType } from "../types";

const RATING_COLOR: Record<CleanRating, string> = { clean: "#2e7d32", moderate: "#f9a825", riskli: "#c62828" };
const RATING_LABEL: Record<CleanRating, string> = { clean: "Temiz", moderate: "Orta", riskli: "Riskli" };
const TYPE_LABEL: Record<RestrictionType, string> = {
  banned: "Yasaklı",
  restricted: "Kısıtlı",
  pregnancy_unsafe: "Hamilelikte önerilmez",
  controversial: "Dikkat",
};

interface Props {
  result: LookupResult;
  onBack: () => void;
}

export function ResultScreen({ result, onBack }: Props) {
  if (!result.found) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Ürün bulunamadı</Text>
        <Text style={styles.muted}>{result.barcode}</Text>
        <Text style={styles.muted}>{result.message}</Text>
        <Button title="Yeni tarama" onPress={onBack} />
      </View>
    );
  }

  const { product } = result;
  const rating = product.cleanRating ?? "clean";

  if (!product.ingredientsText?.trim()) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>{product.productName ?? "İsimsiz ürün"}</Text>
        {product.brands && <Text style={styles.muted}>{product.brands}</Text>}
        <View style={[styles.scoreBox, { backgroundColor: "#757575" }]}>
          <Text style={styles.scoreLabel}>Analiz edilemedi</Text>
        </View>
        <Text style={styles.muted}>Bu ürünün içerik listesi henüz girilmemiş, bu yüzden temizlik skoru hesaplanamadı.</Text>
        <Button title="Yeni tarama" onPress={onBack} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {product.imageUrl && <Image source={{ uri: product.imageUrl }} style={styles.image} resizeMode="contain" />}
      <Text style={styles.title}>{product.productName ?? "İsimsiz ürün"}</Text>
      {product.brands && <Text style={styles.muted}>{product.brands}</Text>}

      <View style={[styles.scoreBox, { backgroundColor: RATING_COLOR[rating] }]}>
        <Text style={styles.score}>{product.cleanScore ?? "-"}</Text>
        <Text style={styles.scoreLabel}>{RATING_LABEL[rating]}</Text>
      </View>

      <Text style={[styles.badge, { color: product.pregnancySafe === false ? "#c62828" : "#2e7d32" }]}>
        {product.pregnancySafe === false ? "Hamilelikte dikkat gerektiriyor" : "Hamilelik için uygun görünüyor"}
      </Text>

      <Text style={styles.section}>İşaretlenen içerikler</Text>
      {product.flaggedIngredients.length === 0 && <Text style={styles.muted}>İşaretlenen içerik yok.</Text>}
      {product.flaggedIngredients.map((item, index) => (
        <View key={index} style={styles.flag}>
          <Text style={styles.flagTitle}>{TYPE_LABEL[item.restrictionType]}: {item.inciName}</Text>
          {item.notes && <Text style={styles.muted}>{item.notes}</Text>}
        </View>
      ))}

      {!product.ingredientsText && <Text style={styles.muted}>Bu ürün için içerik listesi bulunmuyor.</Text>}

      <Button title="Yeni tarama" onPress={onBack} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 56, gap: 10 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 10 },
  image: { width: "100%", height: 180 },
  title: { fontSize: 22, fontWeight: "700" },
  muted: { color: "#666" },
  scoreBox: { borderRadius: 16, padding: 20, alignItems: "center", marginVertical: 8 },
  score: { color: "#fff", fontSize: 48, fontWeight: "800" },
  scoreLabel: { color: "#fff", fontSize: 18 },
  badge: { fontSize: 16, fontWeight: "600" },
  section: { fontSize: 18, fontWeight: "700", marginTop: 12 },
  flag: { backgroundColor: "#f5f5f5", borderRadius: 10, padding: 12, gap: 4 },
  flagTitle: { fontWeight: "600" },
});
