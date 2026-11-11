import { Ionicons } from "@react-native-vector-icons/ionicons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "../components/Text";
import { useApp } from "../AppContext";
import { ALLERGEN_PRESETS, customEntries, customKey, presetKey } from "../allergens";
import { NameDialog } from "../components/NameDialog";
import { ScreenHeader } from "../components/common";
import { RootStackParamList } from "../navigation/types";
import { colors, risk, shadow } from "../theme";

export function AllergenScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "Allergens">) {
  const { avoided, setAvoided } = useApp();
  const [adding, setAdding] = useState(false);
  const custom = customEntries(avoided);

  const toggle = (entry: string) => setAvoided(avoided.includes(entry) ? avoided.filter((a) => a !== entry) : [...avoided, entry]);

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Kaçındığım İçerikler" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.lead}>
          Alerjin ya da kullanmak istemediğin içerikleri işaretle. Taradığın her üründe bunlardan biri varsa kırmızı uyarı göreceksin.
        </Text>

        <View style={styles.card}>
          {ALLERGEN_PRESETS.map((p, i) => {
            const on = avoided.includes(presetKey(p.key));
            return (
              <Pressable key={p.key} style={[styles.row, i > 0 && styles.divider]} onPress={() => toggle(presetKey(p.key))}>
                <Text style={styles.rowText}>{p.label}</Text>
                <View style={[styles.check, on && styles.checkOn]}>{on && <Ionicons name="checkmark" size={15} color="#fff" />}</View>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.section}>Kendi eklediklerim</Text>
        <View style={styles.card}>
          {custom.map((word, i) => (
            <View key={word} style={[styles.row, i > 0 && styles.divider]}>
              <Text style={styles.rowText}>{word}</Text>
              <Pressable onPress={() => toggle(customKey(word))} hitSlop={10} accessibilityLabel={`${word} kaldır`}>
                <Ionicons name="close-circle-outline" size={22} color={colors.muted} />
              </Pressable>
            </View>
          ))}
          <Pressable style={[styles.row, custom.length > 0 && styles.divider]} onPress={() => setAdding(true)}>
            <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
            <Text style={styles.add}>İçerik ekle</Text>
          </Pressable>
        </View>
        <Text style={styles.note}>Eklediğin kelime, içerik adının herhangi bir yerinde geçiyorsa eşleşir (örn. "shea", "limonene", "aloe").</Text>
      </ScrollView>

      <NameDialog
        visible={adding}
        title="Kaçındığın içeriği yaz"
        placeholder="Örn. shea, aloe, retinol"
        confirmLabel="Ekle"
        onClose={() => setAdding(false)}
        onSubmit={(word) => {
          if (!avoided.includes(customKey(word))) setAvoided([...avoided, customKey(word)]);
          setAdding(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 14, paddingBottom: 40 },
  lead: { color: colors.muted, lineHeight: 20, fontSize: 14 },
  section: { fontSize: 15, fontWeight: "600", color: colors.text, marginTop: 8 },
  card: { backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 16, ...shadow },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  rowText: { flex: 1, fontSize: 15, color: colors.text },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: risk.bad, borderColor: risk.bad },
  add: { fontSize: 15, fontWeight: "500", color: colors.primary },
  note: { fontSize: 12, color: colors.muted, lineHeight: 17 },
});
