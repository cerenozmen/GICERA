import { Ionicons } from "@react-native-vector-icons/ionicons";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../AppContext";
import { Bell } from "../components/Bell";
import { ProgressRing } from "../components/ProgressRing";
import { ScoreChip, Thumb } from "../components/common";
import { resultState } from "../ingredients";
import { MainTabParamList, RootStackParamList } from "../navigation/types";
import { Period, ROUTINES } from "../routine";
import { colors } from "../theme";
import { humidityAdvice, loadSkinWeather, SkinWeather, uvAdvice, uvLevel } from "../weather";

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, "Home">,
  NativeStackScreenProps<RootStackParamList>
>;

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Günaydın";
  if (hour < 18) return "İyi günler";
  return "İyi akşamlar";
}

/** Today's routine, in words for the green card. */
function routineMood(done: number, total: number): { title: string; text: string } {
  if (done === 0) return { title: "Başlayalım", text: "Bugünkü bakım rutinin seni bekliyor." };
  if (done < total) return { title: "Dengede", text: "Rutinin yolunda gidiyor. Böyle devam et!" };
  return { title: "Harika", text: "Bugünkü rutinini tamamladın. Cildin sana teşekkür ediyor!" };
}

export function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { history, skinProfile, routineDone, routineProducts, toggleRoutineStep, nickname } = useApp();
  const [period, setPeriod] = useState<Period>(new Date().getHours() < 15 ? "Sabah" : "Akşam");
  const [weather, setWeather] = useState<SkinWeather | null | "loading">("loading");
  const steps = ROUTINES[period];
  const done = steps.filter((s) => routineDone.includes(s.key)).length;
  const allSteps = [...ROUTINES.Sabah, ...ROUTINES.Akşam];
  const allDone = allSteps.filter((s) => routineDone.includes(s.key)).length;
  const percent = Math.round((allDone / allSteps.length) * 100);
  const mood = routineMood(allDone, allSteps.length);

  useEffect(() => {
    loadSkinWeather().then(setWeather);
  }, []);

  const uv = weather !== "loading" && weather ? weather : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 32 }}>
      <View style={styles.pad}>
        <View style={styles.headRow}>
          <View style={styles.flex}>
            <Text style={styles.hello}>Merhaba,</Text>
            <Text style={styles.greeting}>{`${greeting()}${nickname ? `, ${nickname}` : ""}!`}</Text>
          </View>
          <View style={styles.bellWrap}>
            <Bell onPress={() => navigation.navigate("Notifications")} />
          </View>
        </View>

        <Pressable style={styles.profileCard} onPress={() => (skinProfile ? navigation.navigate("Profile") : navigation.navigate("SkinQuiz"))}>
          <View style={styles.profileIcon}>
            <Ionicons name="person-circle-outline" size={22} color="#fff" />
          </View>
          <View style={styles.flex}>
            <Text style={styles.profileTitle}>{skinProfile ? "Cilt profilin hazır" : "Cilt profilini oluştur"}</Text>
            <Text style={styles.profileText}>{skinProfile ? "Sana özel önerilerini keşfet." : "6 kısa soruyla sana özel öneriler al."}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </Pressable>

        <View style={styles.statusCard}>
          <ProgressRing size={74} stroke={6} progress={allDone / allSteps.length} color="#8CC79A" track="rgba(255,255,255,0.18)">
            <Text style={styles.ringText}>{percent}</Text>
          </ProgressRing>
          <View style={styles.flex}>
            <Text style={styles.statusLabel}>Cilt bakımın bugün</Text>
            <Text style={styles.statusTitle}>{mood.title}</Text>
            <Text style={styles.statusText}>{mood.text}</Text>
          </View>
        </View>

        <View style={styles.tiles}>
          <Pressable style={[styles.tile, { backgroundColor: colors.peach }]} onPress={() => weather === null && loadSkinWeather().then(setWeather)}>
            <View style={[styles.tileIcon, { backgroundColor: "#F7C9B0" }]}>
              <Ionicons name="sunny-outline" size={20} color={colors.accent} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.tileLabel}>UV Endeksi</Text>
              <Text style={styles.tileValue}>{uv ? `${uv.uvIndex} - ${uvLevel(uv.uvIndex)}` : "—"}</Text>
              <Text style={styles.tileHint} numberOfLines={1}>
                {uv ? uvAdvice(uv.uvIndex) : weather === "loading" ? "Yükleniyor..." : "Konum izni gerekli"}
              </Text>
            </View>
          </Pressable>
          <Pressable style={[styles.tile, { backgroundColor: colors.primaryLight }]} onPress={() => weather === null && loadSkinWeather().then(setWeather)}>
            <View style={[styles.tileIcon, { backgroundColor: "#CFE0D2" }]}>
              <Ionicons name="water-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.tileLabel}>Nem</Text>
              <Text style={styles.tileValue}>{uv ? `%${uv.humidity}` : "—"}</Text>
              <Text style={styles.tileHint} numberOfLines={1}>
                {uv ? humidityAdvice(uv.humidity) : weather === "loading" ? "Yükleniyor..." : "Konum izni gerekli"}
              </Text>
            </View>
          </Pressable>
        </View>

        <View style={styles.sectionRow}>
          <Text style={styles.section}>Bugünkü rutin</Text>
          <Text style={styles.sectionNote}>{`${done} / ${steps.length} tamam`}</Text>
        </View>
        <View style={styles.routine}>
          <View style={styles.tabs}>
            {(Object.keys(ROUTINES) as Period[]).map((p) => (
              <Pressable key={p} style={[styles.tab, period === p && styles.tabOn]} onPress={() => setPeriod(p)}>
                <Text style={[styles.tabText, period === p && styles.tabTextOn]}>{p}</Text>
              </Pressable>
            ))}
          </View>
          {steps.map((s, i) => {
            const on = routineDone.includes(s.key);
            const product = routineProducts[s.key];
            return (
              <Pressable key={s.key} style={[styles.step, i > 0 && styles.divider]} onPress={() => toggleRoutineStep(s.key)}>
                <View style={[styles.check, on && styles.checkOn]}>{on && <Ionicons name="checkmark" size={15} color="#fff" />}</View>
                <View style={styles.flex}>
                  <Text style={styles.stepTitle}>{s.title}</Text>
                  <Text style={styles.stepText} numberOfLines={1}>
                    {product?.productName ?? s.text}
                  </Text>
                </View>
                <View style={[styles.radio, on && styles.radioOn]}>{on && <Ionicons name="checkmark" size={13} color="#fff" />}</View>
              </Pressable>
            );
          })}
        </View>

        {history.length > 0 && <Text style={[styles.section, styles.recentTitle]}>Son taramalar</Text>}
      </View>

      {history.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
          {history.slice(0, 8).map((item) => (
            <Pressable key={item.barcode} style={styles.miniCard} onPress={() => navigation.navigate("ProductDetail", { barcode: item.barcode, product: item.product })}>
              <Thumb uri={item.imageUrl} size={64} />
              <Text style={styles.miniTitle} numberOfLines={2}>
                {item.productName ?? "İsimsiz ürün"}
              </Text>
              <ScoreChip rating={item.cleanRating} score={item.cleanScore} listRead={!!item.product && resultState(item.product) === "SCAN_COMPLETE_ANALYSIS_BLOCKED"} />
            </Pressable>
          ))}
        </ScrollView>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { paddingHorizontal: 20 },
  flex: { flex: 1 },
  headRow: { flexDirection: "row", alignItems: "flex-start" },
  bellWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#EFEAE3", alignItems: "center", justifyContent: "center" },
  hello: { fontSize: 16, color: colors.text },
  greeting: { fontSize: 26, fontWeight: "700", color: colors.text, marginTop: 2 },
  profileCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.peach, borderRadius: 18, padding: 14, marginTop: 18 },
  profileIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  profileTitle: { fontSize: 15, fontWeight: "600", color: colors.text },
  profileText: { fontSize: 12, color: colors.muted, marginTop: 2 },
  statusCard: { flexDirection: "row", alignItems: "center", gap: 18, backgroundColor: colors.primary, borderRadius: 20, padding: 18, marginTop: 12 },
  ringText: { color: "#fff", fontSize: 24, fontWeight: "600" },
  statusLabel: { fontSize: 12, color: "rgba(255,255,255,0.8)" },
  statusTitle: { fontSize: 22, fontWeight: "600", color: "#fff", marginTop: 2 },
  statusText: { fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 4, lineHeight: 17 },
  tiles: { flexDirection: "row", gap: 12, marginTop: 12 },
  tile: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 18, padding: 14 },
  tileIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  tileLabel: { fontSize: 12, color: colors.text },
  tileValue: { fontSize: 19, fontWeight: "700", color: colors.text, marginTop: 2 },
  tileHint: { fontSize: 10.5, color: colors.muted, marginTop: 2 },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 24, marginBottom: 10 },
  section: { fontSize: 18, fontWeight: "600", color: colors.text },
  sectionNote: { fontSize: 13, color: colors.muted },
  routine: { backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingBottom: 4 },
  tabs: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, alignItems: "center", paddingVertical: 11, marginBottom: -1, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabOn: { borderBottomColor: colors.primary },
  tabText: { fontSize: 14, color: colors.muted },
  tabTextOn: { color: colors.primary, fontWeight: "600" },
  step: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: "#CFC8BE", alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: "#DDD6CC", alignItems: "center", justifyContent: "center" },
  radioOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  stepTitle: { fontSize: 15, color: colors.text, fontWeight: "600" },
  stepText: { fontSize: 12, color: colors.muted, marginTop: 1 },
  recentTitle: { marginTop: 26, marginBottom: 12 },
  hList: { paddingHorizontal: 20, gap: 12 },
  miniCard: { width: 140, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 12, gap: 8, alignItems: "flex-start" },
  miniTitle: { fontSize: 13, fontWeight: "600", color: colors.text },
});
