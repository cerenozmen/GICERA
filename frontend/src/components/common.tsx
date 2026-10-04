import { Ionicons } from "@react-native-vector-icons/ionicons";
import type { IconName } from "./icons";
import { ReactNode } from "react";
import { Image, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ProductSnapshot } from "../storage";
import { colors, ratingStyle, serif, shadow } from "../theme";
import { resultState } from "../ingredients";
import { avatarTone } from "../discussion";
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

/** `listRead`: an own scan whose list was read whole but got no score (a finished scan, not a failed one). */
export function ScoreChip({ rating, score, listRead }: { rating: CleanRating | null; score: number | null; listRead?: boolean }) {
  if ((!rating || score === null) && listRead) {
    return (
      <View style={[styles.chip, { backgroundColor: "#E3F2E7" }]}>
        <Text style={[styles.chipText, { color: colors.primary }]}>Liste okundu · skor yok</Text>
      </View>
    );
  }
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
        {onBack && <BackButton onPress={onBack} />}
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
          <ScoreChip rating={item.cleanRating} score={item.cleanScore} listRead={!!item.product && resultState(item.product) === "SCAN_COMPLETE_ANALYSIS_BLOCKED"} />
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.muted} />
    </Pressable>
  );
}

export function EmptyState({ icon, title, text, children }: { icon: IconName; title: string; text: string; children?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={44} color={colors.primary} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
      {children}
    </View>
  );
}

export function BackButton({ onPress, dark }: { onPress: () => void; dark?: boolean }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} style={[styles.back, dark && styles.backDark]} accessibilityLabel="Geri">
      <Ionicons name="chevron-back" size={22} color={dark ? "#fff" : colors.text} />
    </Pressable>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  arrow,
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  arrow?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable style={[styles.primary, disabled && { opacity: 0.45 }, style]} onPress={onPress} disabled={disabled}>
      {icon && <Ionicons name={icon} size={20} color="#fff" />}
      <Text style={styles.primaryText}>{label}</Text>
      {arrow && <Ionicons name="arrow-forward" size={20} color="#fff" style={styles.primaryArrow} />}
    </Pressable>
  );
}

export function Chip({ label, active, onPress, check, small }: { label: string; active?: boolean; onPress?: () => void; check?: boolean; small?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={[styles.pill, small && styles.pillSmall, active && styles.pillActive]}>
      <Text style={[styles.pillText, small && { fontSize: 12 }, active && styles.pillTextActive]}>{label}</Text>
      {check && active && (
        <View style={styles.pillCheck}>
          <Ionicons name="checkmark" size={11} color={colors.primary} />
        </View>
      )}
    </Pressable>
  );
}

export function Tag({ label, tone = "green" }: { label: string; tone?: "green" | "orange" }) {
  const orange = tone === "orange";
  return (
    <View style={[styles.tag, { backgroundColor: orange ? colors.accentLight : colors.primaryLight }]}>
      <Text style={[styles.tagText, { color: orange ? colors.accent : colors.primary }]}>{label}</Text>
    </View>
  );
}

export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const tone = avatarTone(name);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tone.bg, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: tone.fg, fontSize: size * 0.42, fontWeight: "500" }}>{name.charAt(0).toLocaleUpperCase("tr")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#EFEAE3", alignItems: "center", justifyContent: "center" },
  backDark: { backgroundColor: "rgba(255,255,255,0.12)" },
  primary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 16, paddingHorizontal: 24 },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  primaryArrow: { position: "absolute", right: 22 },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 },
  pillSmall: { paddingHorizontal: 12, paddingVertical: 7 },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { fontSize: 14, color: colors.text },
  pillTextActive: { color: "#fff", fontWeight: "600" },
  pillCheck: { width: 16, height: 16, borderRadius: 8, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  tag: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" },
  tagText: { fontSize: 11, fontWeight: "500" },
  thumbPlaceholder: { borderRadius: 12, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 12, fontWeight: "700" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 8 },
  headerSide: { width: 64 },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "600", color: colors.text },
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderRadius: 18, padding: 12, ...shadow },
  rowTitle: { fontSize: 15, fontWeight: "600", color: colors.text },
  rowSub: { fontSize: 13, color: colors.muted },
  empty: { alignItems: "center", gap: 10, paddingVertical: 48, paddingHorizontal: 32 },
  emptyTitle: { fontFamily: serif, fontSize: 20, color: colors.text, textAlign: "center" },
  emptyText: { fontSize: 14, color: colors.muted, textAlign: "center", lineHeight: 20 },
});
