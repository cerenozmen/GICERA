import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar, BackButton, EmptyState, PrimaryButton } from "../components/common";
import { timeAgo } from "../discussion";
import { forumApi } from "../forumApi";
import { RootStackParamList } from "../navigation/types";
import { storage } from "../storage";
import { colors, serif } from "../theme";
import { ForumNotification } from "../types";

export function NotificationsScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "Notifications">) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<ForumNotification[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await forumApi.notifications();
      setItems(list);
      if (list[0]) storage.saveNotificationsSeen(list[0].createdAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bildirimler yüklenemedi.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}>
      <BackButton onPress={() => navigation.goBack()} />
      <Text style={styles.title}>Bildirimler</Text>
      <Text style={styles.sub}>Konularına gelen yanıtlar burada görünür.</Text>
      {error ? (
        <EmptyState icon="cloud-offline-outline" title="Bildirimler yüklenemedi" text={error}>
          <PrimaryButton label="Tekrar dene" icon="refresh-outline" onPress={load} style={styles.retry} />
        </EmptyState>
      ) : items === null ? (
        <ActivityIndicator style={styles.loading} color={colors.primary} />
      ) : items.length === 0 ? (
        <EmptyState icon="notifications-outline" title="Yeni bildirim yok" text="Açtığın konulara biri yanıt verdiğinde burada göreceksin." />
      ) : (
        <View style={styles.list}>
          {items.map((n, i) => (
            <Pressable key={n.replyId} style={[styles.row, i > 0 && styles.divider]} onPress={() => navigation.navigate("PostDetail", { postId: n.postId })}>
              <Avatar name={n.authorName} size={42} />
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>
                  <Text style={styles.bold}>{n.authorName}</Text>
                  {` "${n.postTitle}" konuna yanıt verdi`}
                </Text>
                <Text style={styles.rowText} numberOfLines={2}>
                  {n.text}
                </Text>
                <Text style={styles.time}>{timeAgo(n.createdAt)}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingBottom: 32 },
  title: { fontFamily: serif, fontSize: 32, color: colors.text, marginTop: 16 },
  sub: { fontSize: 14, color: colors.muted, marginTop: 6, marginBottom: 16 },
  loading: { marginTop: 40 },
  retry: { marginTop: 8 },
  list: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 18, paddingHorizontal: 14 },
  row: { flexDirection: "row", gap: 12, paddingVertical: 14 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  rowBody: { flex: 1, gap: 4 },
  rowTitle: { fontSize: 14, color: colors.text, lineHeight: 20 },
  bold: { fontWeight: "600" },
  rowText: { fontSize: 13, color: colors.muted, lineHeight: 19 },
  time: { fontSize: 12, color: colors.muted },
});
