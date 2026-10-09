import { Ionicons } from "@react-native-vector-icons/ionicons";
import { ReactNode, useState } from "react";
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";
import { colors } from "../theme";
import { ScreenHeader } from "./common";
import type { IconName } from "./icons";

interface FieldProps extends Omit<TextInputProps, "style" | "placeholderTextColor"> {
  label: string;
  /** A password box: hidden text with a show/hide eye. */
  secure?: boolean;
  /** Guidance shown under the box while it's focused. */
  hint?: string;
  /** Red line under the box (and a red underline); replaces the hint. */
  error?: string | null;
}

/** A labelled, underlined text box (the account forms' one input style). */
export function Field({ label, secure, hint, error, ...input }: FieldProps) {
  const [shown, setShown] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputRow, focused && styles.inputFocused, !!error && styles.inputError]}>
        <TextInput
          {...input}
          style={styles.input}
          placeholderTextColor={colors.muted}
          secureTextEntry={secure && !shown}
          autoCapitalize={input.autoCapitalize ?? "none"}
          autoCorrect={false}
          onFocus={(e) => {
            setFocused(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            input.onBlur?.(e);
          }}
        />
        {secure && (
          <Pressable onPress={() => setShown((s) => !s)} hitSlop={10} accessibilityLabel={shown ? "Şifreyi gizle" : "Şifreyi göster"}>
            <Ionicons name={shown ? "eye-off-outline" : "eye-outline"} size={20} color={colors.muted} />
          </Pressable>
        )}
      </View>
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint && focused ? (
        <View style={styles.hintRow}>
          <Ionicons name="information-circle-outline" size={15} color={colors.muted} />
          <Text style={styles.hint}>{hint}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** A read-only line in a form, e.g. the e-mail the account signs in with. */
export function StaticField({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.static}>{value}</Text>
    </View>
  );
}

/** The error (or, with `tone="info"`, the notice) line under a form. */
export function FormMessage({ text, tone = "error" }: { text: string | null; tone?: "error" | "info" }) {
  if (!text) return null;
  return (
    <View style={[styles.message, tone === "info" ? styles.messageInfo : styles.messageError]}>
      <Text style={[styles.messageText, { color: tone === "info" ? colors.primary : colors.danger }]}>{text}</Text>
    </View>
  );
}

/** A form page: header with back, keyboard-safe scrolling body. */
export function FormPage({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <KeyboardAvoidingView style={styles.page} behavior="padding">
      <ScreenHeader title={title} onBack={onBack} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** A tappable row of an info list: label on the left, current value and a chevron on the right. */
export function InfoRow({
  icon,
  label,
  value,
  onPress,
  divider,
}: {
  icon?: IconName;
  label: string;
  value?: string;
  onPress: () => void;
  divider?: boolean;
}) {
  return (
    <Pressable style={[styles.row, divider && styles.rowDivider]} onPress={onPress}>
      {icon && (
        <View style={styles.rowIcon}>
          <Ionicons name={icon} size={20} color={colors.primary} />
        </View>
      )}
      <Text style={styles.rowLabel}>{label}</Text>
      {value ? (
        <Text style={styles.rowValue} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      <Ionicons name="chevron-forward" size={20} color={colors.muted} />
    </Pressable>
  );
}

export const formStyles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 14 },
  gap: { gap: 18 },
});

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40, gap: 22 },
  field: { gap: 6 },
  label: { fontSize: 11, letterSpacing: 1.4, color: colors.muted, textTransform: "uppercase" },
  inputRow: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#CFC8BD" },
  inputFocused: { borderBottomColor: colors.primary },
  inputError: { borderBottomColor: colors.danger },
  error: { fontSize: 12.5, color: colors.danger, marginTop: 2 },
  static: { fontSize: 16, fontWeight: "600", color: colors.text, paddingVertical: 4 },
  input: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: 10 },
  hintRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  hint: { fontSize: 12.5, color: colors.muted, flex: 1 },
  message: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  messageError: { backgroundColor: colors.dangerLight },
  messageInfo: { backgroundColor: colors.primaryLight },
  messageText: { fontSize: 13.5, lineHeight: 19 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 16 },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  rowIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  rowLabel: { flex: 1, fontSize: 15, color: colors.text },
  rowValue: { flexShrink: 1, maxWidth: "50%", fontSize: 14, color: colors.muted },
});
