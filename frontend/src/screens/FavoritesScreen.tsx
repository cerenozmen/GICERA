import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../AppContext";
import { EmptyState, ProductRow } from "../components/common";
import { MainTabParamList, RootStackParamList } from "../navigation/types";
import { colors, serif } from "../theme";

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, "Favorites">,
  NativeStackScreenProps<RootStackParamList>
>;

export function FavoritesScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { favorites } = useApp();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 32, gap: 12 }}>
      <Text style={styles.title}>Favorilerim</Text>
      {favorites.length === 0 ? (
        <EmptyState icon="heart-outline" title="Henüz favorin yok" text="Bir ürünün sayfasında kalp simgesine dokunarak favorilerine ekleyebilirsin." />
      ) : (
        <View style={{ gap: 12 }}>
          {favorites.map((item) => (
            <ProductRow key={item.barcode} item={item} onPress={() => navigation.navigate("ProductDetail", { barcode: item.barcode })} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  title: { fontFamily: serif, fontSize: 30, fontWeight: "700", color: colors.text, marginBottom: 4 },
});
