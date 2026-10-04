import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../AppContext";
import { BackButton, EmptyState, ProductRow } from "../components/common";
import { RootStackParamList } from "../navigation/types";
import { colors, serif } from "../theme";

export function FavoritesScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "Favorites">) {
  const insets = useSafeAreaInsets();
  const { favorites } = useApp();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 32, gap: 12 }}>
      <BackButton onPress={() => navigation.goBack()} />
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
  title: { fontFamily: serif, fontSize: 32, color: colors.text, marginTop: 8, marginBottom: 4 },
});
