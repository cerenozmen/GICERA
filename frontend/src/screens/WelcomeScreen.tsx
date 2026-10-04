import { Ionicons } from "@react-native-vector-icons/ionicons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useRef } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../AppContext";
import { PrimaryButton } from "../components/common";
import { RootStackParamList } from "../navigation/types";
import { colors, serif } from "../theme";

const LOGO = require("../../assets/logo-mark.jpg");

/** The intro's dots also count the quiz that follows. */
const DOTS = 4;
/** The logo artwork's own cream, so its faded edges disappear into the page. */
const LOGO_BG = "#FBF4ED";

export function WelcomeScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "Welcome">) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { markWelcomeSeen } = useApp();
  const scroller = useRef<ScrollView>(null);

  function skip() {
    markWelcomeSeen();
    navigation.reset({ index: 0, routes: [{ name: "Main" }] });
  }

  const logoWidth = Math.min(width * 0.78, 340);

  return (
    <View style={styles.screen}>
      <ScrollView ref={scroller} horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
        {/* 1: brand */}
        <View style={[styles.page, styles.brandPage, { width, paddingTop: insets.top + 12 }]}>
          <View style={[styles.glow, { width: width * 1.2, height: width * 1.2, top: height * 0.3, left: -width * 0.1 }]} />
          <Bubble size={22} style={{ top: insets.top + 70, left: 34 }} />
          <Bubble size={12} style={{ top: insets.top + 110, left: 64 }} />
          <Bubble size={64} style={{ bottom: 190, right: 30 }} />
          <Bubble size={18} style={{ bottom: 270, left: 40 }} />

          <View style={styles.brand}>
            <Image source={LOGO} style={{ width: logoWidth, height: logoWidth * (775 / 820) }} resizeMode="contain" />
            <Text style={styles.logo}>Gicera</Text>
            <Text style={styles.motto}>İÇERİĞİNİ BİL,{"\n"}KENDİNE İYİ BAK.</Text>
          </View>
          <View style={[styles.bottom, { paddingBottom: insets.bottom + 20 }]}>
            <PrimaryButton label="Hemen Başla" arrow onPress={() => scroller.current?.scrollTo({ x: width, animated: true })} />
            <Dots page={0} />
          </View>
        </View>

        {/* 2: promise */}
        <View style={[styles.page, { width }]}>
          <View style={[styles.hero, { height: height * 0.5, paddingTop: insets.top }]}>
            <Ionicons name="leaf" size={150} color="#5E7F55" style={styles.heroLeafA} />
            <Ionicons name="leaf" size={120} color="#EDB09B" style={styles.heroLeafB} />
            <Ionicons name="leaf" size={110} color="#7E9A6E" style={styles.heroLeafC} />
            <View style={styles.sphere}>
              <View style={styles.sphereShine} />
              <Ionicons name="leaf" size={64} color="rgba(94,127,85,0.55)" style={styles.sphereLeaf} />
            </View>
            <Bubble size={26} style={{ top: insets.top + 40, right: 60 }} />
            <Bubble size={14} style={{ top: insets.top + 90, left: 50 }} />
          </View>
          <View style={styles.copy}>
            <Text style={styles.headline}>Cildini tanı,{"\n"}rutinini sadeleştir.</Text>
            <Text style={styles.body}>Cilt tipini öğren, ihtiyaçlarına uygun içerikleri keşfet ve sana en uygun bakım rutinini oluştur.</Text>
          </View>
          <View style={[styles.bottom, styles.pad, { paddingBottom: insets.bottom + 20 }]}>
            <PrimaryButton
              label="Cilt Profili Oluştur"
              arrow
              onPress={() => {
                markWelcomeSeen();
                navigation.replace("SkinQuiz");
              }}
            />
            <Pressable onPress={skip} hitSlop={8}>
              <Text style={styles.skip}>Şimdilik geç</Text>
            </Pressable>
            <Dots page={0} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Bubble({ size, style }: { size: number; style: object }) {
  return (
    <View style={[styles.bubble, { width: size, height: size, borderRadius: size / 2 }, style]}>
      <View style={[styles.bubbleShine, { width: size * 0.3, height: size * 0.3, borderRadius: size * 0.15 }]} />
    </View>
  );
}

function Dots({ page }: { page: number }) {
  return (
    <View style={styles.dots}>
      {Array.from({ length: DOTS }, (_, i) => (
        <View key={i} style={[styles.dot, i === page && styles.dotOn]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: LOGO_BG },
  page: { flex: 1, overflow: "hidden" },
  brandPage: { paddingHorizontal: 24, backgroundColor: LOGO_BG },
  pad: { paddingHorizontal: 24 },
  glow: { position: "absolute", borderRadius: 999, backgroundColor: "#F8E3D8", opacity: 0.6 },
  bubble: { position: "absolute", backgroundColor: "rgba(246,214,200,0.45)", borderWidth: 1, borderColor: "rgba(255,255,255,0.9)" },
  bubbleShine: { position: "absolute", top: "18%", left: "22%", backgroundColor: "rgba(255,255,255,0.9)" },
  brand: { flex: 1, alignItems: "center", justifyContent: "center" },
  logo: { fontFamily: serif, fontSize: 54, color: colors.primary, marginTop: -6 },
  motto: { fontSize: 12, letterSpacing: 4, color: colors.text, textAlign: "center", marginTop: 8, lineHeight: 19 },
  bottom: { gap: 16 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#D8D2C8" },
  dotOn: { backgroundColor: colors.primary },
  hero: { backgroundColor: "#F3DDD2", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  heroLeafA: { position: "absolute", top: 30, left: -30, transform: [{ rotate: "-40deg" }] },
  heroLeafB: { position: "absolute", bottom: -10, left: 30, transform: [{ rotate: "200deg" }] },
  heroLeafC: { position: "absolute", top: 60, right: -20, transform: [{ rotate: "50deg" }] },
  sphere: { width: 170, height: 170, borderRadius: 85, backgroundColor: "rgba(255,255,255,0.35)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.95)", alignItems: "center", justifyContent: "center", marginTop: 30 },
  sphereShine: { position: "absolute", top: 22, left: 34, width: 40, height: 22, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.8)", transform: [{ rotate: "-30deg" }] },
  sphereLeaf: { transform: [{ rotate: "30deg" }] },
  copy: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 28 },
  headline: { fontFamily: serif, fontSize: 32, color: colors.text, textAlign: "center", lineHeight: 40 },
  body: { fontSize: 15, color: colors.muted, textAlign: "center", lineHeight: 22 },
  skip: { color: colors.muted, textAlign: "center", fontSize: 14 },
});
