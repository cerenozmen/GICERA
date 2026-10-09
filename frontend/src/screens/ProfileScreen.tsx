import { Ionicons } from "@react-native-vector-icons/ionicons";
import type { IconName } from "../components/icons";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../AppContext";
import { useAuth } from "../AuthContext";
import { Avatar, PrimaryButton, Tag } from "../components/common";
import { displayName } from "../formRules";
import { MainTabParamList, RootStackParamList } from "../navigation/types";
import { colors, serif } from "../theme";

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, "Profile">,
  NativeStackScreenProps<RootStackParamList>
>;

export function ProfileScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { history, favorites, settings, skinProfile, clearHistory } = useApp();
  const { user, signOut } = useAuth();

  function confirmSignOut() {
    Alert.alert("Çıkış yapılsın mı?", "Cilt profilin ve favorilerin bu telefonda kalır.", [
      { text: "Vazgeç", style: "cancel" },
      { text: "Çıkış yap", style: "destructive", onPress: signOut },
    ]);
  }

  function confirmClearHistory() {
    Alert.alert("Tarama geçmişi silinsin mi?", "Bu işlem geri alınamaz. Favorilerin silinmez.", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Sil",
        style: "destructive",
        onPress: clearHistory,
      },
    ]);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 32, gap: 16 }}>
      <Text style={styles.title}>Profilim</Text>

      {user ? (
        <Pressable style={styles.account} onPress={() => navigation.navigate("MyInfo")}>
          <Avatar name={displayName(user)} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={styles.accountName} numberOfLines={1}>
              {displayName(user)}
            </Text>
            <Text style={styles.accountMail} numberOfLines={1}>
              {user.email}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>
      ) : (
        <View style={styles.guest}>
          <Text style={styles.emptyTitle}>Hesabına giriş yap</Text>
          <Text style={styles.emptyText}>Giriş yap veya kaydol; bilgilerini yönet ve hesabınla devam et.</Text>
          <PrimaryButton label="Giriş yap veya kaydol" arrow onPress={() => navigation.navigate("Auth")} />
        </View>
      )}

      {skinProfile ? (
        <View style={styles.profile}>
          <View style={styles.profileHead}>
            <View style={styles.drop}>
              <Ionicons name="water" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.profileLabel}>Cilt tipin</Text>
              <Text style={styles.profileType}>{skinProfile.skinType ?? "-"}</Text>
            </View>
            <Pressable onPress={() => navigation.navigate("SkinQuiz", { edit: true })} hitSlop={8}>
              <Text style={styles.edit}>Düzenle</Text>
            </Pressable>
          </View>
          {skinProfile.concerns.length > 0 && (
            <View style={styles.tags}>
              {skinProfile.concerns.map((c) => (
                <Tag key={c} label={c} />
              ))}
            </View>
          )}
          <View style={styles.facts}>
            <Fact label="Hassasiyet" value={skinProfile.reactionFrequency} />
            <Fact label="Yaş" value={skinProfile.ageRange} />
            <Fact label="Rutin" value={skinProfile.routineLevel} />
          </View>
        </View>
      ) : (
        <View style={styles.profileEmpty}>
          <Text style={styles.emptyTitle}>Cilt profilini oluştur</Text>
          <Text style={styles.emptyText}>Cilt tipini ve odak konularını öğrenip ürünleri sana göre değerlendirelim.</Text>
          <PrimaryButton label="Cilt Profili Oluştur" arrow onPress={() => navigation.navigate("SkinQuiz", { edit: true })} />
        </View>
      )}

      <View style={styles.stats}>
        <Stat value={history.length} label="Taranan Ürün" />
        <Stat value={favorites.length} label="Favori" />
      </View>

      <View style={styles.card}>
        {user && <MenuRow icon="person-outline" label="Bilgilerim" onPress={() => navigation.navigate("MyInfo")} />}
        <MenuRow icon="heart-outline" label="Favorilerim" onPress={() => navigation.navigate("Favorites")} divider={!!user} />
        <MenuRow
          icon="woman-outline"
          label={`Hamilelik Modu${settings.pregnancyMode ? " (aktif)" : ""}`}
          onPress={() => navigation.navigate("PregnancyMode")}
          divider
        />
        <MenuRow icon="trash-outline" label="Tarama geçmişini sil" onPress={confirmClearHistory} divider />
        {user && <MenuRow icon="log-out-outline" label="Çıkış yap" onPress={confirmSignOut} divider />}
      </View>

      <View style={styles.tip}>
        <Ionicons name="leaf" size={32} color={colors.primary} />
        <Text style={styles.tipText}>İçeriğini bil, kendine iyi bak. Gicera'yı kullandığın için teşekkürler.</Text>
      </View>
    </ScrollView>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value ?? "-"}</Text>
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MenuRow({ icon, label, onPress, divider }: { icon: IconName; label: string; onPress: () => void; divider?: boolean }) {
  return (
    <Pressable style={[styles.menuRow, divider && styles.divider]} onPress={onPress}>
      <View style={styles.menuIcon}>
        <Ionicons name={icon} size={20} color={colors.primary} />
      </View>
      <Text style={styles.menuLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={20} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  title: { fontFamily: serif, fontSize: 36, color: colors.text },
  account: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 20, padding: 14 },
  accountName: { fontSize: 17, fontWeight: "600", color: colors.text },
  accountMail: { fontSize: 13, color: colors.muted, marginTop: 2 },
  guest: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 22, padding: 18, gap: 10 },
  profile: { backgroundColor: colors.primary, borderRadius: 22, padding: 18, gap: 14 },
  profileHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  drop: { width: 46, height: 46, borderRadius: 23, borderWidth: 3, borderColor: "#7FB08F", alignItems: "center", justifyContent: "center" },
  profileLabel: { color: "rgba(255,255,255,0.75)", fontSize: 12 },
  profileType: { color: "#fff", fontSize: 22, fontWeight: "600" },
  edit: { color: "#fff", fontSize: 14, textDecorationLine: "underline" },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  facts: { flexDirection: "row", gap: 8 },
  fact: { flex: 1, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 12, padding: 10 },
  factLabel: { color: "rgba(255,255,255,0.7)", fontSize: 11 },
  factValue: { color: "#fff", fontSize: 14, fontWeight: "600", marginTop: 2 },
  profileEmpty: { backgroundColor: colors.peach, borderRadius: 22, padding: 18, gap: 10 },
  emptyTitle: { fontFamily: serif, fontSize: 22, color: colors.text },
  emptyText: { color: colors.muted, lineHeight: 20, marginBottom: 4 },
  stats: { flexDirection: "row", gap: 12 },
  stat: { flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 18, paddingVertical: 16, alignItems: "center" },
  statValue: { fontSize: 26, fontWeight: "700", color: colors.text },
  statLabel: { color: colors.muted, fontSize: 12, marginTop: 2 },
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 14 },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 },
  menuIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  menuLabel: { flex: 1, fontSize: 15, color: colors.text },
  tip: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.peach, borderRadius: 20, padding: 18 },
  tipText: { flex: 1, color: colors.text, lineHeight: 20 },
});
