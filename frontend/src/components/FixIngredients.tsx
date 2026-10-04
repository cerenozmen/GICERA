import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { analyzeText, scoreBlockers } from "../api";
import { parseIngredients } from "../ingredients";
import { colors } from "../theme";
import { Product } from "../types";

const norm = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** The names of a scanned list that couldn't be verified: what withheld the score, then the rest. */
export function namesToFix(product: Product): string[] {
  const names = [...(product.scoreBlockers?.misread ?? []), ...(product.scoreBlockers?.notInDictionary ?? []), ...(product.unverifiedIngredients ?? [])];
  return names.filter((name, i) => names.findIndex((other) => norm(other) === norm(name)) === i);
}

/**
 * Lets the user type, from the label, the names the scanner couldn't verify. The corrected list is
 * analysed again by the server with the same rules as a scan: a typed name is only accepted when the
 * dictionary knows it, and one that might be a flagged substance still withholds the score.
 */
export function FixIngredients({ product, onFixed }: { product: Product; onFixed: (product: Product) => void }) {
  const names = namesToFix(product);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!names.length) return null;
  const changes = names.flatMap((name) => {
    const to = typed[name]?.trim();
    return to && norm(to) !== norm(name) ? [{ from: name, to }] : [];
  });

  async function analyse() {
    setBusy(true);
    setMessage(null);
    try {
      const tokens = parseIngredients(product.ingredientsText);
      const missing = changes.filter((c) => !tokens.some((t) => norm(t) === norm(c.from)));
      let text = tokens.map((t) => changes.find((c) => norm(c.from) === norm(t))?.to ?? t).join(", ");
      // A name the server split differently from the list's items: replaced in the text itself.
      for (const c of missing) text = text.replace(c.from, c.to);
      const result = await analyzeText(text);
      const unknown = result.ingredients.filter((item) => item.status === "unknown");
      const fixes = [...(product.manualFixes ?? []), ...changes];
      const next: Product = {
        ...product,
        ingredientsText: result.ingredientsText,
        cleanScore: result.reliable ? result.cleanScore : null,
        cleanRating: result.reliable ? result.cleanRating : null,
        pregnancySafe: result.reliable ? result.pregnancySafe : null,
        flaggedIngredients: result.reliable ? result.flaggedIngredients : [],
        unverifiedIngredients: unknown.map((item) => item.text),
        scoreBlockers: result.reliable ? undefined : scoreBlockers(result.ingredients),
        manualFixes: fixes,
      };
      const stillUnknown = changes.filter((c) => unknown.some((item) => norm(item.text) === norm(c.to))).map((c) => c.to);
      if (stillUnknown.length) {
        setMessage(`${stillUnknown.map((n) => `"${n}"`).join(", ")} içerik sözlüğümüzde bulunamadı. Etikette yazdığı gibi, tam adıyla yazmayı dene.`);
      }
      onFixed(next);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Analiz yapılamadı.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Ionicons name="create-outline" size={20} color={colors.accent} />
        <Text style={styles.title}>Okunamayan içerikleri düzelt</Text>
      </View>
      <Text style={styles.text}>Etikete bakıp doğru adı yaz. Yazdığın ad da içerik sözlüğünde kontrol edilir; doğrulanamayan bir ad skora katılmaz.</Text>
      {names.map((name) => (
        <View key={name} style={styles.row}>
          <Text style={styles.read} numberOfLines={1}>{`Okunan: ${name}`}</Text>
          <TextInput
            style={styles.input}
            placeholder="Etiketteki doğru ad"
            placeholderTextColor={colors.muted}
            value={typed[name] ?? ""}
            onChangeText={(value) => setTyped((current) => ({ ...current, [name]: value }))}
            autoCapitalize="words"
            autoCorrect={false}
          />
        </View>
      ))}
      {!!message && <Text style={styles.message}>{message}</Text>}
      <Pressable style={[styles.button, (!changes.length || busy) && styles.buttonOff]} onPress={analyse} disabled={!changes.length || busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Yeniden analiz et</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 16, gap: 10 },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 15, fontWeight: "600", color: colors.text },
  text: { fontSize: 13, color: colors.muted, lineHeight: 19 },
  row: { gap: 6 },
  read: { fontSize: 12, color: colors.muted },
  input: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.text },
  message: { fontSize: 13, color: colors.danger, lineHeight: 19 },
  button: { backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 13, alignItems: "center" },
  buttonOff: { opacity: 0.45 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
