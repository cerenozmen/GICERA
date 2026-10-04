import { Ionicons } from "@react-native-vector-icons/ionicons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../AppContext";
import { Avatar, BackButton, EmptyState, PrimaryButton, Tag } from "../components/common";
import { timeAgo } from "../discussion";
import { forumApi } from "../forumApi";
import { RootStackParamList } from "../navigation/types";
import { colors, serif } from "../theme";
import { ForumPost, ForumReply } from "../types";

const SORTS = ["En yeni", "En eski", "En beğenilen"] as const;

export function PostDetailScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, "PostDetail">) {
  const insets = useSafeAreaInsets();
  const { postId } = route.params;
  const { nickname, saveNickname } = useApp();
  const [post, setPost] = useState<ForumPost | null>(null);
  const [replies, setReplies] = useState<ForumReply[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [name, setName] = useState(nickname ?? "");
  const [sending, setSending] = useState(false);
  const [sort, setSort] = useState<(typeof SORTS)[number]>("En yeni");
  const input = useRef<TextInput>(null);

  const load = useCallback(async () => {
    try {
      const result = await forumApi.getPost(postId);
      setPost(result.post);
      setReplies(result.replies);
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Konu yüklenemedi.");
      setStatus("error");
    }
  }, [postId]);

  useEffect(() => {
    load();
  }, [load]);

  if (status !== "ready" || !post) {
    return (
      <View style={[styles.screen, styles.top, { paddingTop: insets.top + 8 }]}>
        <BackButton onPress={() => navigation.goBack()} />
        {status === "loading" ? (
          <ActivityIndicator style={styles.loading} color={colors.primary} />
        ) : (
          <EmptyState icon="chatbubbles-outline" title="Konu açılamadı" text={error ?? "Bu konu kaldırılmış olabilir."}>
            <PrimaryButton label="Tekrar dene" icon="refresh-outline" onPress={load} style={styles.retry} />
          </EmptyState>
        )}
      </View>
    );
  }

  const sorted = [...replies].sort((a, b) =>
    sort === "En yeni" ? b.createdAt.localeCompare(a.createdAt) : sort === "En eski" ? a.createdAt.localeCompare(b.createdAt) : b.likeCount - a.likeCount
  );
  const authorName = (nickname ?? name).trim();
  const canSend = !!text.trim() && authorName.length >= 2 && !sending;

  async function send() {
    if (!canSend) return;
    setSending(true);
    try {
      const reply = await forumApi.createReply(postId, { authorName, text: text.trim() });
      if (!nickname) saveNickname(authorName);
      setReplies((current) => [reply, ...current]);
      setPost((current) => current && { ...current, replyCount: current.replyCount + 1 });
      setText("");
      setSort("En yeni");
    } catch (err) {
      Alert.alert("Yanıt gönderilemedi", err instanceof Error ? err.message : "Tekrar dene.");
    } finally {
      setSending(false);
    }
  }

  async function togglePostMark(kind: "like" | "save") {
    if (!post) return;
    const before = post;
    if (kind === "like") {
      const on = !before.liked;
      setPost({ ...before, liked: on, likeCount: before.likeCount + (on ? 1 : -1) });
      try {
        const { count } = await forumApi.setPostLike(postId, on);
        setPost((current) => current && { ...current, likeCount: count });
      } catch {
        setPost(before);
      }
    } else {
      setPost({ ...before, saved: !before.saved });
      try {
        await forumApi.setPostSaved(postId, !before.saved);
      } catch {
        setPost(before);
      }
    }
  }

  async function toggleReplyLike(reply: ForumReply) {
    const on = !reply.liked;
    const patch = (liked: boolean, likeCount: number) =>
      setReplies((current) => current.map((r) => (r.id === reply.id ? { ...r, liked, likeCount } : r)));
    patch(on, reply.likeCount + (on ? 1 : -1));
    try {
      const { count } = await forumApi.setReplyLike(reply.id, on);
      patch(on, count);
    } catch {
      patch(reply.liked, reply.likeCount);
    }
  }

  function confirmDeletePost() {
    Alert.alert("Konu silinsin mi?", "Konu ve tüm yanıtları kalıcı olarak silinir.", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Sil",
        style: "destructive",
        onPress: async () => {
          try {
            await forumApi.deletePost(postId);
            navigation.goBack();
          } catch (err) {
            Alert.alert("Silinemedi", err instanceof Error ? err.message : "Tekrar dene.");
          }
        },
      },
    ]);
  }

  function confirmDeleteReply(reply: ForumReply) {
    Alert.alert("Yanıt silinsin mi?", undefined, [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Sil",
        style: "destructive",
        onPress: async () => {
          try {
            await forumApi.deleteReply(reply.id);
            setReplies((current) => current.filter((r) => r.id !== reply.id));
            setPost((current) => current && { ...current, replyCount: Math.max(0, current.replyCount - 1) });
          } catch (err) {
            Alert.alert("Silinemedi", err instanceof Error ? err.message : "Tekrar dene.");
          }
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.top, styles.topRow, { paddingTop: insets.top + 8 }]}>
        <BackButton onPress={() => navigation.goBack()} />
        <Pressable
          onPress={() =>
            Alert.alert(post.title, undefined, [
              { text: post.saved ? "Kaydedilenlerden çıkar" : "Kaydet", onPress: () => togglePostMark("save") },
              ...(post.mine ? [{ text: "Konuyu sil", style: "destructive" as const, onPress: confirmDeletePost }] : []),
              { text: "Vazgeç", style: "cancel" },
            ])
          }
          hitSlop={10}
          accessibilityLabel="Seçenekler"
        >
          <Ionicons name="ellipsis-vertical" size={22} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{post.title}</Text>
        <View style={styles.authorRow}>
          <Avatar name={post.authorName} size={48} />
          <View>
            <Text style={styles.author}>{post.authorName}</Text>
            <Text style={styles.time}>{timeAgo(post.createdAt)}</Text>
          </View>
          <View style={styles.tagGap}>
            <Tag label={post.category} />
          </View>
        </View>
        <Text style={styles.body}>{post.body}</Text>

        <View style={styles.actions}>
          <View style={styles.stat}>
            <Ionicons name="chatbubble-outline" size={22} color={colors.text} />
            <Text style={styles.statText}>{post.replyCount}</Text>
          </View>
          <Pressable style={styles.stat} onPress={() => togglePostMark("like")} hitSlop={8}>
            <Ionicons name={post.liked ? "heart" : "heart-outline"} size={23} color={post.liked ? colors.danger : colors.text} />
            <Text style={styles.statText}>{post.likeCount}</Text>
          </Pressable>
          <View style={styles.spacer} />
          <Pressable onPress={() => togglePostMark("save")} hitSlop={8} accessibilityLabel="Kaydet">
            <Ionicons name={post.saved ? "bookmark" : "bookmark-outline"} size={22} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.repliesHead}>
          <Text style={styles.repliesTitle}>{`Yanıtlar (${post.replyCount})`}</Text>
          <Pressable style={styles.sort} onPress={() => setSort(SORTS[(SORTS.indexOf(sort) + 1) % SORTS.length])} hitSlop={8}>
            <Text style={styles.sortText}>{sort}</Text>
            <Ionicons name="chevron-down" size={16} color={colors.muted} />
          </Pressable>
        </View>

        {sorted.length === 0 && <Text style={styles.noReplies}>Henüz yanıt yok. İlk yanıtı sen yaz.</Text>}
        {sorted.map((r, i) => (
          <View key={r.id} style={[styles.reply, i > 0 && styles.divider]}>
            <Avatar name={r.authorName} size={44} />
            <View style={styles.replyBody}>
              <View style={styles.replyMeta}>
                <Text style={styles.replyAuthor}>{r.authorName}</Text>
                <Text style={styles.time}>{timeAgo(r.createdAt)}</Text>
                <View style={styles.spacer} />
                <Pressable
                  onPress={() =>
                    Alert.alert(r.authorName, undefined, [
                      {
                        text: "Yanıtla",
                        onPress: () => {
                          setText(`@${r.authorName} `);
                          input.current?.focus();
                        },
                      },
                      ...(r.mine ? [{ text: "Sil", style: "destructive" as const, onPress: () => confirmDeleteReply(r) }] : []),
                      { text: "Vazgeç", style: "cancel" },
                    ])
                  }
                  hitSlop={10}
                  accessibilityLabel="Seçenekler"
                >
                  <Ionicons name="ellipsis-horizontal" size={18} color={colors.text} />
                </Pressable>
              </View>
              <Text style={styles.replyText}>{r.text}</Text>
              <View style={styles.replyActions}>
                <Pressable style={styles.stat} onPress={() => toggleReplyLike(r)} hitSlop={8}>
                  <Ionicons name={r.liked ? "heart" : "heart-outline"} size={19} color={r.liked ? colors.danger : colors.text} />
                  <Text style={styles.statText}>{r.likeCount}</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setText(`@${r.authorName} `);
                    input.current?.focus();
                  }}
                  hitSlop={8}
                >
                  <Text style={styles.replyLink}>Yanıtla</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={[styles.composer, { paddingBottom: insets.bottom + 10 }]}>
        {!nickname && (
          <TextInput
            style={styles.nameInput}
            placeholder="Takma adın (herkese görünür)"
            placeholderTextColor={colors.muted}
            value={name}
            onChangeText={setName}
            maxLength={30}
          />
        )}
        <View style={styles.composerRow}>
          <Avatar name={authorName || "?"} size={36} />
          <View style={styles.inputWrap}>
            <TextInput
              ref={input}
              style={styles.input}
              placeholder="Yanıt yaz..."
              placeholderTextColor={colors.muted}
              value={text}
              onChangeText={setText}
              maxLength={2000}
              multiline
            />
            <Pressable style={[styles.send, !canSend && styles.sendOff]} onPress={send} disabled={!canSend} accessibilityLabel="Gönder">
              {sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="paper-plane-outline" size={18} color="#fff" />}
            </Pressable>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { paddingHorizontal: 20, paddingBottom: 4 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  loading: { marginTop: 60 },
  retry: { marginTop: 8 },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },
  title: { fontFamily: serif, fontSize: 26, color: colors.text, lineHeight: 33 },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16 },
  tagGap: { marginLeft: 8 },
  author: { fontSize: 15, fontWeight: "500", color: colors.text },
  time: { fontSize: 12, color: colors.muted },
  body: { fontSize: 16, color: colors.text, lineHeight: 24, marginTop: 16 },
  actions: { flexDirection: "row", alignItems: "center", gap: 22, marginTop: 18, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: colors.border },
  spacer: { flex: 1 },
  stat: { flexDirection: "row", alignItems: "center", gap: 6 },
  statText: { fontSize: 14, color: colors.text },
  repliesHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  repliesTitle: { fontSize: 17, fontWeight: "600", color: colors.text },
  sort: { flexDirection: "row", alignItems: "center", gap: 4 },
  sortText: { fontSize: 14, color: colors.muted },
  noReplies: { color: colors.muted, paddingVertical: 20, textAlign: "center" },
  reply: { flexDirection: "row", gap: 12, paddingVertical: 14 },
  replyBody: { flex: 1, gap: 4 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  replyMeta: { flexDirection: "row", alignItems: "center", gap: 10 },
  replyAuthor: { fontSize: 14, fontWeight: "600", color: colors.text },
  replyText: { fontSize: 14, color: colors.text, lineHeight: 20 },
  replyActions: { flexDirection: "row", alignItems: "center", gap: 28, marginTop: 6 },
  replyLink: { fontSize: 14, color: colors.text },
  composer: { gap: 8, paddingHorizontal: 16, paddingTop: 10, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border },
  composerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  nameInput: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14, color: colors.text },
  inputWrap: { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingLeft: 16, paddingRight: 5, paddingVertical: 4 },
  input: { flex: 1, maxHeight: 100, color: colors.text, fontSize: 14, paddingVertical: 8 },
  send: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  sendOff: { opacity: 0.4 },
});
