import { Ionicons } from "@react-native-vector-icons/ionicons";
import type { IconName } from "../components/icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BackButton, PrimaryButton } from "../components/common";
import { RootStackParamList } from "../navigation/types";
import { colors, serif } from "../theme";

export function ProductNotFoundScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "ProductNotFound">) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.top}>
        <BackButton onPress={() => navigation.goBack()} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.art}>
          <View style={styles.circle}>
            <Tube />
          </View>
          <View style={[styles.corner, styles.bl]} />
          <View style={[styles.corner, styles.br]} />
        </View>

        <Text style={styles.title}>Bu ürünü henüz tanımıyoruz</Text>
        <Text style={styles.text}>Barkodu bulunamadı. Ürünü manuel olarak arama yapabilir veya içerik listesini tarayabilirsin.</Text>

        <Text style={styles.section}>Nasıl devam edersin?</Text>
        <View style={styles.options}>
          <Option icon="search-outline" label="Ürün adını yazarak ara" onPress={() => navigation.replace("ProductSearch")} />
          <Option icon="camera-outline" label="İçerik listesi tara" onPress={() => navigation.replace("IngredientScan")} />
          <Option icon="barcode-outline" label="Başka bir barkod tara" onPress={() => navigation.replace("Scan")} />
        </View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <PrimaryButton label="İçerik listesini tara" onPress={() => navigation.replace("IngredientScan")} />
        <Pressable onPress={() => navigation.replace("ProductSearch")} hitSlop={8}>
          <Text style={styles.link}>Manuel olarak ara</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** A plain cream tube, standing in for the product photo. */
function Tube() {
  return (
    <View style={styles.tube}>
      <View style={styles.tubeCrimp} />
      <View style={styles.tubeBody}>
        <View style={styles.tubeShine} />
      </View>
      <View style={styles.tubeCap} />
    </View>
  );
}

function Option({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.option} onPress={onPress}>
      <Ionicons name={icon} size={20} color={colors.text} />
      <Text style={styles.optionText}>{label}</Text>
    </Pressable>
  );
}

const C = 30;
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { paddingHorizontal: 20 },
  content: { paddingHorizontal: 24, paddingBottom: 16 },
  art: { alignSelf: "center", width: 200, height: 190, alignItems: "center", justifyContent: "center", marginBottom: 18 },
  circle: { width: 168, height: 168, borderRadius: 84, backgroundColor: "#F6E3D9", alignItems: "center", justifyContent: "center" },
  corner: { position: "absolute", width: C, height: C, borderColor: colors.accent },
  bl: { bottom: 0, left: 14, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 12 },
  br: { bottom: 0, right: 14, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 12 },
  tube: { alignItems: "center", transform: [{ rotate: "-12deg" }], marginTop: 6 },
  tubeCrimp: { width: 50, height: 8, borderRadius: 2, backgroundColor: "#E9E2D8" },
  tubeBody: { width: 52, height: 92, borderBottomLeftRadius: 10, borderBottomRightRadius: 10, backgroundColor: "#FBF8F3", borderWidth: 1, borderColor: "#EDE6DC" },
  tubeShine: { position: "absolute", left: 8, top: 10, width: 8, height: 64, borderRadius: 4, backgroundColor: "#FFFFFF" },
  tubeCap: { width: 30, height: 18, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, backgroundColor: "#F1EBE2", borderWidth: 1, borderColor: "#E4DCD1" },
  title: { fontFamily: serif, fontSize: 26, color: colors.text, textAlign: "center" },
  text: { fontSize: 14, color: colors.muted, textAlign: "center", lineHeight: 21, marginTop: 10 },
  section: { fontSize: 15, fontWeight: "500", color: colors.text, marginTop: 24, marginBottom: 10 },
  options: { gap: 10 },
  option: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14 },
  optionText: { flex: 1, fontSize: 14, color: colors.text },
  footer: { paddingHorizontal: 20, paddingTop: 8, gap: 14 },
  link: { textAlign: "center", fontSize: 14, color: colors.primary, textDecorationLine: "underline" },
});
