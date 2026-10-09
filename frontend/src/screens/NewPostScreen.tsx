import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../AppContext";
import { BackButton, Chip, PrimaryButton } from "../components/common";
import { CATEGORIES } from "../discussion";
import { forumApi } from "../forumApi";
import { RootStackParamList } from "../navigation/types";
import { colors, serif } from "../theme";

export function NewPostScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "NewPost">) {
  const insets = useSafeAreaInsets();
  const { nickname, saveNickname } = useApp();
  const [name, setName] = useState(nickname ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [sending, setSending] = useState(false);
  const ready = name.trim().length >= 2 && title.trim().length >= 3 && body.trim().length >= 3 && !sending;

  async function share() {
    setSending(true);
    try {
      const authorName = name.trim();
      const post = await forumApi.createPost({ authorName, title: title.trim(), body: body.trim(), category });
      if (authorName !== nickname) saveNickname(authorName);
      navigation.replace("PostDetail", { postId: post.id });
    } catch (err) {
      Alert.alert("Paylaşılamadı", err instanceof Error ? err.message : "Tekrar dene.");
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]} keyboardShouldPersistTaps="handled">
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Yeni konu aç</Text>
        <Text style={styles.sub}>Sorunu ya da deneyimini toplulukla paylaş.</Text>

        <Text style={styles.label}>Takma adın</Text>
        <TextInput style={styles.input} placeholder="Herkese bu adla görünürsün" placeholderTextColor={colors.muted} value={name} onChangeText={setName} maxLength={30} />

        <Text style={styles.label}>Kategori</Text>
        <View style={styles.wrap}>
          {CATEGORIES.map((c) => (
            <Chip key={c} label={c} active={category === c} onPress={() => setCategory(c)} />
          ))}
        </View>

        <Text style={styles.label}>Başlık</Text>
        <TextInput style={styles.input} placeholder="Örn. Karma ciltler için nemlendirici önerisi" placeholderTextColor={colors.muted} value={title} onChangeText={setTitle} maxLength={120} />

        <Text style={styles.label}>Açıklama</Text>
        <TextInput
          style={[styles.input, styles.area]}
          placeholder="Cilt tipin, denediğin ürünler, aradığın şey..."
          placeholderTextColor={colors.muted}
          value={body}
          onChangeText={setBody}
          maxLength={4000}
          multiline
          textAlignVertical="top"
        />
        <Text style={styles.note}>Paylaşımın topluluktaki herkese görünür. Kişisel bilgilerini paylaşma.</Text>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <PrimaryButton label={sending ? "Paylaşılıyor..." : "Paylaş"} icon="paper-plane-outline" disabled={!ready} onPress={share} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingBottom: 24 },
  title: { fontFamily: serif, fontSize: 28, color: colors.text, marginTop: 18 },
  sub: { fontSize: 14, color: colors.muted, marginTop: 6 },
  label: { fontSize: 14, fontWeight: "600", color: colors.text, marginTop: 22, marginBottom: 10 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text },
  area: { minHeight: 140 },
  note: { fontSize: 12, color: colors.muted, marginTop: 10 },
  footer: { paddingHorizontal: 20, paddingTop: 8 },
});
