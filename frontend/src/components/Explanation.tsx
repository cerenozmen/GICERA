import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { explainIngredient } from "../api";
import { colors } from "../theme";

type Explanation = { state: "loading" } | { state: "done"; text: string } | { state: "error"; text: string };

/** Which ingredient's explanation is open (one at a time) and what each fetched explanation says. */
export function useExplanations() {
  const [open, setOpen] = useState<string | null>(null);
  const [byName, setByName] = useState<Record<string, Explanation>>({});

  function toggle(key: string, name: string) {
    if (open === key) {
      setOpen(null);
      return;
    }
    setOpen(key);
    const known = byName[name];
    if (known?.state === "loading" || known?.state === "done") return;
    setByName((prev) => ({ ...prev, [name]: { state: "loading" } }));
    explainIngredient(name).then(
      (r) => setByName((prev) => ({ ...prev, [name]: { state: "done", text: r.explanation } })),
      (e: Error) => setByName((prev) => ({ ...prev, [name]: { state: "error", text: e.message } }))
    );
  }

  return { open, toggle, explanation: (name: string) => byName[name] };
}

/** The small "Ne işe yarar?" pill that opens an ingredient's explanation. */
export function ExplainButton({ open, onPress }: { open: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.button, open && styles.buttonOpen]} onPress={onPress} hitSlop={6}>
      <Text style={[styles.buttonText, open && styles.buttonTextOpen]}>{open ? "Kapat" : "Ne işe yarar?"}</Text>
    </Pressable>
  );
}

/** The explanation under a row: a spinner while it loads, then the text (or why it couldn't be fetched). */
export function ExplanationText({ value }: { value: Explanation | undefined }) {
  if (!value) return null;
  return (
    <View style={styles.body}>
      {value.state === "loading" ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Text style={value.state === "error" ? styles.error : styles.text}>{value.text}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  button: { borderWidth: 1, borderColor: colors.primary, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  buttonOpen: { backgroundColor: colors.primary },
  buttonText: { fontSize: 12, color: colors.primary, fontWeight: "600" },
  buttonTextOpen: { color: "#fff" },
  body: { width: "100%", paddingTop: 6 },
  text: { fontSize: 14, color: colors.text, lineHeight: 21 },
  error: { fontSize: 14, color: colors.muted, lineHeight: 21 },
});
