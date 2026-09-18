import { Ionicons } from "@expo/vector-icons";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../AppContext";
import { ScoreChip, Thumb } from "../components/common";
import { MainTabParamList, RootStackParamList } from "../navigation/types";
import { colors, serif, shadow } from "../theme";

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, "Home">,
  NativeStackScreenProps<RootStackParamList>
>;

export function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { history } = useApp();
  const [query, setQuery] = useState("");
  const [hint, setHint] = useState<string | null>(null);

  function search() {
    const code = query.trim();
    if (/^\d{8,14}$/.test(code)) {
      setHint(null);
      navigation.navigate("ProductDetail", { barcode: code });
    } else {
      setHint("Şimdilik yalnızca barkod numarasıyla arama yapılabiliyor (8-14 hane).");
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 32 }}>
      <View style={styles.pad}>
        <Text style={styles.greeting}>Merhaba</Text>
        <Text style={styles.sub}>Bugün kendin için ne keşfetmek istersin?</Text>

        <View style={styles.search}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Barkod numarası yaz veya tara..."
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={search}
            returnKeyType="search"
          />
          <Pressable onPress={() => navigation.navigate("Scan")} hitSlop={10}>
            <Ionicons name="barcode-outline" size={22} color={colors.primary} />
          </Pressable>
        </View>
        {hint && <Text style={styles.hint}>{hint}</Text>}
        <Pressable onPress={() => navigation.navigate("IngredientScan")} style={styles.photoLink}>
          <Ionicons name="camera-outline" size={16} color={colors.primary} />
          <Text style={styles.photoLinkText}>Barkodu olmayan ürün? İçerik listesini fotoğrafla</Text>
        </Pressable>

        <View style={styles.banner}>
          <Ionicons name="leaf" size={110} color={colors.primary} style={styles.bannerLeaf} />
          <Text style={styles.bannerTitle}>Daha temiz bir güzellik dünyası mümkün.</Text>
          <Text style={styles.bannerText}>İçerikleri analiz et, kendin ve sevdiklerin için daha güvenli seçimler yap.</Text>
        </View>

        <View style={styles.grid}>
          <ActionCard icon="barcode-outline" title="Barkod Tara" text="Ürünü anında analiz et" onPress={() => navigation.navigate("Scan")} />
          <ActionCard icon="search-outline" title="Ürün Ara" text="Yakında" disabled />
          <ActionCard icon="woman-outline" title="Hamilelik Modu" text="Sen ve bebeğin için" onPress={() => navigation.navigate("PregnancyMode")} />
          <ActionCard icon="heart-outline" title="Favorilerim" text="Kaydettiğin ürünler" onPress={() => navigation.navigate("Favorites")} />
        </View>

        <Text style={styles.section}>Son Taramalar</Text>
      </View>

      {history.length === 0 ? (
        <Text style={[styles.pad, styles.muted]}>Henüz ürün taramadın. İlk barkodunu okutarak başla.</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
          {history.slice(0, 8).map((item) => (
            <Pressable key={item.barcode} style={styles.miniCard} onPress={() => navigation.navigate("ProductDetail", { barcode: item.barcode })}>
              <Thumb uri={item.imageUrl} size={64} />
              <Text style={styles.miniTitle} numberOfLines={2}>
                {item.productName ?? "İsimsiz ürün"}
              </Text>
              <ScoreChip rating={item.cleanRating} score={item.cleanScore} />
            </Pressable>
          ))}
        </ScrollView>
      )}
    </ScrollView>
  );
}

function ActionCard({
  icon,
  title,
  text,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  text: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable style={[styles.card, disabled && { opacity: 0.55 }]} onPress={onPress} disabled={disabled}>
      <Ionicons name={icon} size={26} color={colors.danger} />
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardText}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { paddingHorizontal: 20 },
  greeting: { fontFamily: serif, fontSize: 32, fontWeight: "700", color: colors.text },
  sub: { color: colors.muted, marginTop: 4, marginBottom: 16 },
  search: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 4, ...shadow },
  searchInput: { flex: 1, paddingVertical: 12, color: colors.text },
  photoLink: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, paddingHorizontal: 4 },
  photoLinkText: { color: colors.primary, fontSize: 13, fontWeight: "600" },
  hint: { color: colors.danger, fontSize: 13, marginTop: 8 },
  banner: { backgroundColor: colors.blush, borderRadius: 24, padding: 20, marginTop: 18, overflow: "hidden" },
  bannerLeaf: { position: "absolute", right: -10, bottom: -20, opacity: 0.25 },
  bannerTitle: { fontFamily: serif, fontSize: 22, color: colors.text, fontWeight: "700", width: "80%" },
  bannerText: { color: colors.text, marginTop: 8, width: "75%", lineHeight: 20 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 18 },
  card: { width: "48%", backgroundColor: colors.card, borderRadius: 20, padding: 16, gap: 4, ...shadow },
  cardTitle: { fontWeight: "700", fontSize: 15, color: colors.text, marginTop: 6 },
  cardText: { fontSize: 12, color: colors.muted },
  section: { fontSize: 18, fontWeight: "700", color: colors.text, marginTop: 26, marginBottom: 12 },
  muted: { color: colors.muted },
  hList: { paddingHorizontal: 20, gap: 12 },
  miniCard: { width: 140, backgroundColor: colors.card, borderRadius: 18, padding: 12, gap: 8, alignItems: "flex-start", ...shadow },
  miniTitle: { fontSize: 13, fontWeight: "600", color: colors.text },
});
