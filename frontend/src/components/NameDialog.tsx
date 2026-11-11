import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import { Text, TextInput } from "./Text";
import { colors } from "../theme";

interface Props {
  visible: boolean;
  title: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel: string;
  /** Tappable quick picks that fill the box. */
  suggestions?: string[];
  onClose: () => void;
  onSubmit: (value: string) => void;
}

/** A small centred box asking for one line of text (Alert.prompt only exists on iOS). */
export function NameDialog({ visible, title, placeholder, initialValue = "", confirmLabel, suggestions, onClose, onSubmit }: Props) {
  const [value, setValue] = useState(initialValue);
  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);
  const trimmed = value.trim();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.box}>
          <Text style={styles.title}>{title}</Text>
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={colors.muted}
            maxLength={60}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => trimmed && onSubmit(trimmed)}
          />
          {suggestions && (
            <View style={styles.chips}>
              {suggestions.map((s) => (
                <Pressable key={s} style={styles.chip} onPress={() => setValue(s)}>
                  <Text style={styles.chipText}>{s}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <View style={styles.actions}>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.cancel}>Vazgeç</Text>
            </Pressable>
            <Pressable onPress={() => trimmed && onSubmit(trimmed)} disabled={!trimmed} hitSlop={8}>
              <Text style={[styles.confirm, !trimmed && styles.disabled]}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.35)", paddingHorizontal: 24 },
  box: { width: "100%", maxWidth: 420, backgroundColor: colors.bg, borderRadius: 20, padding: 20 },
  title: { fontSize: 17, fontWeight: "600", color: colors.text, marginBottom: 14 },
  input: { borderBottomWidth: 1, borderBottomColor: colors.primary, fontSize: 16, color: colors.text, paddingVertical: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  chip: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 13, color: colors.text },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 24, marginTop: 20 },
  cancel: { fontSize: 15, color: colors.muted },
  confirm: { fontSize: 15, fontWeight: "600", color: colors.primary },
  disabled: { opacity: 0.4 },
});
