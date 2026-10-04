import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../AppContext";
import { EmptyState, PrimaryButton, ProductRow } from "../components/common";
import { MainTabParamList, RootStackParamList } from "../navigation/types";
import { colors, serif } from "../theme";

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, "History">,
  NativeStackScreenProps<RootStackParamList>
>;

export function HistoryScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { history } = useApp();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 32, gap: 12 }}>
      <Text style={styles.title}>Geçmiş</Text>
      <Text style={styles.sub}>Taradığın ürünler burada. Son 20 tarama saklanır.</Text>
      {history.length === 0 ? (
        <EmptyState icon="time-outline" title="Henüz tarama yok" text="Bir ürünün barkodunu ya da içerik listesini tarattığında burada görünecek.">
          <PrimaryButton label="Ürün tara" icon="scan-outline" onPress={() => navigation.navigate("Scan")} style={{ marginTop: 8 }} />
        </EmptyState>
      ) : (
        <View style={{ gap: 12 }}>
          {history.map((item) => (
            <ProductRow key={item.barcode} item={item} onPress={() => navigation.navigate("ProductDetail", { barcode: item.barcode, product: item.product })} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  title: { fontFamily: serif, fontSize: 36, color: colors.text },
  sub: { color: colors.muted, fontSize: 14, marginBottom: 6 },
});
