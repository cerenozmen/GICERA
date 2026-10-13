import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ReactNode, useRef, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../AppContext";
import { useAuth } from "../AuthContext";
import { PrimaryButton } from "../components/common";
import { RootStackParamList } from "../navigation/types";
import { colors, display } from "../theme";

/**
 * The intro's two pages: the designed artwork (upscaled, its words taken out) filling the whole screen,
 * with the words set as live text where the design has them, so they stay sharp on any screen. The
 * buttons sit on the artwork's lower edge, over a fade into its own cream.
 */
const PAGES = [
  { image: require("../../assets/welcome-brand.jpg"), ratio: 2650 / 1440 },
  { image: require("../../assets/welcome-promise.jpg"), ratio: 2663 / 1440 },
];
const FADE = require("../../assets/welcome-fade.png");

const INK = "#10241E";
const CREAM = "#F6EDE4";

/** The intro's dots also count the quiz that follows. */
const DOTS = 4;
/** Height of the second page's actions: a button, "Şimdilik geç" and the dots, with their gaps. */
const ACTIONS_TWO = 56 + 14 + 20 + 14 + 7;

/** Where an artwork lands when it covers the screen: its size and offset (its sides may be cut). */
interface Cover {
  width: number;
  height: number;
  left: number;
  top: number;
}

function cover(ratio: number, screenWidth: number, screenHeight: number): Cover {
  const width = Math.max(screenWidth, screenHeight / ratio);
  const height = width * ratio;
  // Wider than the screen: centred, its sides cut. Taller: kept from the top, the plain cream below cut.
  return { width, height, left: (screenWidth - width) / 2, top: 0 };
}

export function WelcomeScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "Welcome">) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const { markWelcomeSeen } = useApp();
  const { user } = useAuth();
  const scroller = useRef<ScrollView>(null);
  // The screen the pages fill (the window, edge to edge; measured once laid out).
  const [screen, setScreen] = useState({ width: window.width, height: window.height });

  function skip() {
    markWelcomeSeen();
    navigation.reset({ index: 0, routes: [{ name: user ? "Main" : "Auth" }] });
  }

  function startQuiz() {
    markWelcomeSeen();
    navigation.replace("SkinQuiz");
  }

  const { width, height } = screen;
  const brand = cover(PAGES[0].ratio, width, height);
  const promise = cover(PAGES[1].ratio, width, height);
  const headline = Math.min(36, width * 0.088);

  return (
    <View style={styles.screen} onLayout={(e) => setScreen({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
      <ScrollView ref={scroller} horizontal pagingEnabled showsHorizontalScrollIndicator={false} bounces={false}>
        <Page
          width={width}
          height={height}
          image={PAGES[0].image}
          art={brand}
          bottomInset={insets.bottom}
          actions={
            <>
              <PrimaryButton label="Hemen Başla" arrow onPress={() => scroller.current?.scrollTo({ x: width, animated: true })} />
              <Dots page={0} />
            </>
          }
        >
          {/* Where the design has them: the name's middle at 43% of the artwork's height, the motto's at 52%. */}
          <Words art={brand} screenWidth={width} at={0.427} height={0.2} side={0.12}>
            <Text style={[styles.brandName, { fontSize: brand.width * 0.18, lineHeight: brand.width * 0.2 }]} numberOfLines={1} adjustsFontSizeToFit>
              Gicera
            </Text>
          </Words>
          <Words art={brand} screenWidth={width} at={0.521} height={0.11} side={0.12}>
            <Text style={[styles.motto, { fontSize: brand.width * 0.034, lineHeight: brand.width * 0.055, letterSpacing: brand.width * 0.0055 }]}>
              {"İÇERİĞİNİ BİL.\nKENDİNE İYİ BAK."}
            </Text>
          </Words>
        </Page>

        <Page
          width={width}
          height={height}
          image={PAGES[1].image}
          art={promise}
          bottomInset={insets.bottom}
          actions={
            <>
              <PrimaryButton label="Cilt Profili Oluştur" arrow onPress={startQuiz} />
              <Pressable onPress={skip} hitSlop={8}>
                <Text style={styles.skip}>Şimdilik geç</Text>
              </Pressable>
              <Dots page={1} />
            </>
          }
        >
          {/* Set for the phone, not the artwork: in from the sides, a clear gap above the buttons. */}
          <View style={[styles.promiseCopy, { bottom: insets.bottom + 18 + ACTIONS_TWO + 34 }]}>
            <Text style={[styles.headline, { fontSize: headline, lineHeight: headline * 1.15 }]} numberOfLines={2} adjustsFontSizeToFit>
              {"Cildini tanı,\nrutinini sadeleştir."}
            </Text>
            <Text style={styles.body}>Cilt tipini öğren, ihtiyaçlarına uygun içerikleri keşfet ve sana en uygun bakım rutinini oluştur.</Text>
          </View>
        </Page>
      </ScrollView>
    </View>
  );
}

/** One intro page: the artwork covering the screen, its words laid on it, the buttons over a fade at the bottom. */
function Page(props: { width: number; height: number; image: number; art: Cover; bottomInset: number; actions: ReactNode; children: ReactNode }) {
  const { art } = props;
  return (
    <View style={[styles.page, { width: props.width, height: props.height }]}>
      <Image source={props.image} style={[styles.abs, art]} resizeMode="cover" />
      {props.children}
      <Image source={FADE} style={[styles.fade, { height: 150 + props.bottomInset + 110 }]} resizeMode="stretch" />
      <View style={[styles.actions, { paddingBottom: props.bottomInset + 18 }]}>{props.actions}</View>
    </View>
  );
}

/**
 * A block of words centred at `at` of the artwork's height, `height` tall and `side` in from each side
 * (both as shares of the artwork's width), kept on screen where the artwork's sides are cut.
 */
function Words(props: { art: Cover; screenWidth: number; at: number; height: number; side: number; children: ReactNode }) {
  const { art } = props;
  const h = art.width * props.height;
  const inset = Math.max(16, art.left + art.width * props.side);
  return <View style={[styles.words, { top: art.top + art.height * props.at - h / 2, height: h, left: inset, right: inset }]}>{props.children}</View>;
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
  screen: { flex: 1, backgroundColor: CREAM },
  page: { overflow: "hidden", backgroundColor: CREAM },
  abs: { position: "absolute" },
  words: { position: "absolute", justifyContent: "center" },
  brandName: { fontFamily: display, color: INK, textAlign: "center" },
  motto: { color: "#2F4640", textAlign: "center", fontWeight: "500" },
  promiseCopy: { position: "absolute", left: 28, right: 28, alignItems: "center", gap: 14 },
  headline: { fontFamily: display, color: INK, textAlign: "center" },
  body: { color: "#55605E", textAlign: "center", fontSize: 15.5, lineHeight: 23, maxWidth: 330 },
  fade: { position: "absolute", left: 0, right: 0, bottom: 0, width: "100%" },
  actions: { position: "absolute", left: 0, right: 0, bottom: 0, gap: 14, paddingHorizontal: 24 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#D8D2C8" },
  dotOn: { backgroundColor: colors.primary },
  skip: { color: colors.muted, textAlign: "center", fontSize: 14 },
});
