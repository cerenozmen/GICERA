import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { forumApi } from "../forumApi";
import { storage } from "../storage";
import { colors } from "../theme";

/** The header bell: a dot when someone replied under your posts since you last opened the list. */
export function Bell({ onPress }: { onPress: () => void }) {
  const [unread, setUnread] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      Promise.all([forumApi.notifications(), storage.loadNotificationsSeen()])
        .then(([list, seen]) => live && setUnread(!!list[0] && list[0].createdAt > seen))
        .catch(() => {});
      return () => {
        live = false;
      };
    }, [])
  );

  return (
    <Pressable onPress={onPress} hitSlop={10} style={styles.bell} accessibilityLabel="Bildirimler">
      <Ionicons name="notifications-outline" size={26} color={colors.text} />
      {unread && <View style={styles.dot} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bell: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  dot: { position: "absolute", top: 7, right: 9, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accent, borderWidth: 1.5, borderColor: colors.bg },
});
