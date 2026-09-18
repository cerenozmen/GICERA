import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState } from "../components/common";
import { colors } from "../theme";

export function ExploreScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingTop: insets.top + 40 }]}>
      <EmptyState
        icon="people-outline"
        title="Topluluk yakında"
        text="Ürün yorumları ve topluluk paylaşımları çok yakında burada olacak."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
});
