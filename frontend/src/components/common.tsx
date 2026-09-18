import { Ionicons } from "@expo/vector-icons";
import { ReactNode } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ProductSnapshot } from "../storage";
import { colors, ratingStyle, serif, shadow } from "../theme";
import { CleanRating } from "../types";

export function Thumb({ uri, size = 56 }: { uri: string | null; size?: number }) {
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: 12 }} resizeMode="contain" />;
  }
  return (
    <View style={[styles.thumbPlaceholder, { width: size, height: size }]}>
      <Ionicons name="leaf-outline" size={size * 0.45} color={colors.primary} />
    </View>
  );
}

export function ScoreChip({ rating, score }: { rating: CleanRating | null; score: number | null }) {
  if (!rating || score === null) {
    return (
      <View style={[styles.chip, { backgroundColor: "#EEE" }]}>
        <Text style={[styles.chipText, { color: colors.muted }]}>Analiz yok</Text>
      </View>
    );
  }
  const style = ratingStyle[rating];
  return (
    <View style={[styles.chip, { backgroundColor: style.bg }]}>
      <Ionicons name={rating === "clean" ? "checkmark-circle" : "alert-circle"} size={14} color={style.color} />
      <Text style={[styles.chipText, { color: style.color }]}>
        {style.label} {score}
      </Text>
    </View>
  );
}

export function ScreenHeader({ title, onBack, right }: { title?: string; onBack?: () => void; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <View style={styles.headerSide}>
        {onBack && (
          <Pressable onPress={onBack} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </Pressable>
        )}
      </View>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={[styles.headerSide, { alignItems: "flex-end" }]}>{right}</View>
    </View>
  );
}

export function ProductRow({ item, onPress }: { item: ProductSnapshot; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Thumb uri={item.imageUrl} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {item.productName ?? "İsimsiz ürün"}
        </Text>
        {item.brands && (
          <Text style={styles.rowSub} numberOfLines={1}>
            {item.brands}
          </Text>
        )}
        <View style={{ flexDirection: "row" }}>
          <ScoreChip rating={item.cleanRating} score={item.cleanScore} />
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.muted} />
    </Pressable>
  );
}

export function EmptyState({ icon, title, text, children }: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string; children?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={44} color={colors.primary} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  thumbPlaceholder: { borderRadius: 12, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 12, fontWeight: "700" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 8 },
  headerSide: { width: 60 },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "600", color: colors.text },
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderRadius: 18, padding: 12, ...shadow },
  rowTitle: { fontSize: 15, fontWeight: "600", color: colors.text },
  rowSub: { fontSize: 13, color: colors.muted },
  empty: { alignItems: "center", gap: 10, paddingVertical: 48, paddingHorizontal: 32 },
  emptyTitle: { fontFamily: serif, fontSize: 20, color: colors.text, textAlign: "center" },
  emptyText: { fontSize: 14, color: colors.muted, textAlign: "center", lineHeight: 20 },
});
