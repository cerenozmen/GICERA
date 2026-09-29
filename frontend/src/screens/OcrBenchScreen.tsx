import { Ionicons } from "@react-native-vector-icons/ionicons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useRef, useState } from "react";
import TextRecognition from "@react-native-ml-kit/text-recognition";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import RNFS from "react-native-fs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Camera, useCameraDevice, useCameraPermission } from "react-native-vision-camera";
import { orientedSize, toScanFrame } from "../guidedScan";
import { RootStackParamList } from "../navigation/types";
import { colors } from "../theme";

/*
 * Development only: the local OCR preprocessing POC's two ends on the phone (ML Kit runs only here).
 *
 *  1. Capture: high-resolution photos of a product (flat: 1, tube: centre/left/right, round: up to 5),
 *     each kept as its original JPEG with ML Kit's reading of it: files/bench/capture-<time>/.
 *  2. Bench: every image in files/bench/in/ (variants the backend POC script made on the computer:
 *     crops, corrected, dewarped, enhanced) read by the same ML Kit, results in files/bench/out/.
 *
 * Nothing leaves the phone and the computer: no API, no key, no cloud.
 */

type Product = "flat" | "tube" | "round";
const STEPS: Record<Product, string[]> = {
  flat: ["CENTER"],
  tube: ["CENTER", "LEFT", "RIGHT"],
  round: ["CENTER", "LEFT", "RIGHT", "EXTRA1", "EXTRA2"],
};
const HINTS: Record<string, string> = {
  CENTER: "İçerik listesini ortalayıp çekin.",
  LEFT: "Ürünü çevirip listenin sol tarafını ortaya getirin.",
  RIGHT: "Ürünü çevirip listenin sağ tarafını ortaya getirin.",
  EXTRA1: "(İsteğe bağlı) Okunmayan bir bölümü ortalayıp çekin.",
  EXTRA2: "(İsteğe bağlı) Okunmayan bir bölümü ortalayıp çekin.",
};
const NAMES: Record<Product, string> = { flat: "Düz", tube: "Tüp", round: "Yuvarlak" };
const BENCH = `${RNFS.DocumentDirectoryPath}/bench`;

const plain = (path: string) => path.replace(/^file:\/\//, "");

export function OcrBenchScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "OcrBench">) {
  const insets = useSafeAreaInsets();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const camera = useRef<Camera>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [dir, setDir] = useState<string | null>(null);
  const [taken, setTaken] = useState(0);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const note = (line: string) => setLog((lines) => [line, ...lines].slice(0, 30));

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  async function start(p: Product) {
    const folder = `${BENCH}/capture-${p}-${Date.now()}`;
    await RNFS.mkdir(folder);
    setDir(folder);
    setTaken(0);
    setProduct(p);
    note(`capture folder ${folder.split("/").pop()}`);
  }

  async function shoot() {
    if (!camera.current || !product || !dir || busy) return;
    const step = STEPS[product][taken];
    if (!step) return;
    setBusy(true);
    try {
      const captureStart = Date.now();
      const file = await camera.current.takePhoto({ flash: "off", enableShutterSound: false });
      const captureMs = Date.now() - captureStart;
      const jpg = `${dir}/${step}.jpg`;
      await RNFS.moveFile(plain(file.path), jpg);
      const ocrStart = Date.now();
      const ocr = await TextRecognition.recognize(`file://${jpg}`);
      const ocrMs = Date.now() - ocrStart;
      const size = orientedSize(file.width, file.height, file.orientation);
      const frame = toScanFrame(ocr, size.width, size.height);
      await RNFS.writeFile(`${dir}/${step}.mlkit.json`, JSON.stringify({ step, product, captureMs, ocrMs, sensor: { width: file.width, height: file.height, orientation: file.orientation }, ...frame }));
      note(`${step}: ${frame.lines.length} lines, capture ${captureMs} ms, OCR ${ocrMs} ms`);
      setTaken((n) => n + 1);
    } catch (err) {
      note(`error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  /** Every image in bench/in read by ML Kit (the same call as the app's), results to bench/out. */
  async function runBench() {
    setBusy(true);
    try {
      await RNFS.mkdir(`${BENCH}/in`);
      await RNFS.mkdir(`${BENCH}/out`);
      const images = (await RNFS.readDir(`${BENCH}/in`)).filter((f) => /\.(jpe?g|png)$/i.test(f.name)).sort((a, b) => (a.name < b.name ? -1 : 1));
      note(`bench: ${images.length} images`);
      for (const image of images) {
        const started = Date.now();
        const ocr = await TextRecognition.recognize(`file://${image.path}`);
        const ocrMs = Date.now() - started;
        // Sizes come from the script's manifest; boxes are in the image's own pixels.
        const frame = toScanFrame(ocr, 0, 0);
        await RNFS.writeFile(`${BENCH}/out/${image.name.replace(/\.[^.]+$/, "")}.json`, JSON.stringify({ image: image.name, ocrMs, lines: frame.lines }));
        note(`${image.name}: ${frame.lines.length} lines, ${ocrMs} ms`);
      }
      note("bench done");
    } catch (err) {
      note(`bench error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  const steps = product ? STEPS[product] : [];
  const step = steps[taken];
  return (
    <View style={styles.dark}>
      {product && step && device && hasPermission && <Camera ref={camera} style={StyleSheet.absoluteFill} device={device} isActive photo />}
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title}>{product ? `[DEV] ${NAMES[product]} · ${step ? `${taken + 1}/${steps.length} ${step}` : "bitti"}` : "[DEV] OCR Bench (yerel, ücretsiz)"}</Text>
        {product && step && <Text style={styles.hint}>{HINTS[step]}</Text>}
      </View>
      {product && step && (
        <View style={styles.frameWrap} pointerEvents="none">
          <View style={styles.frame} />
        </View>
      )}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
        <ScrollView style={styles.logBox}>
          <Text style={styles.logText}>{log.join("\n") || "-"}</Text>
        </ScrollView>
        {product && step ? (
          <View style={styles.row}>
            <Pressable onPress={() => setProduct(null)}>
              <Text style={styles.link}>{taken > 0 ? "Bitir" : "Vazgeç"}</Text>
            </Pressable>
            <Pressable style={styles.shutter} onPress={shoot} disabled={busy}>
              {busy ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="camera" size={32} color={colors.primary} />}
            </Pressable>
            <View style={{ width: 50 }} />
          </View>
        ) : (
          <View style={styles.buttons}>
            {(Object.keys(STEPS) as Product[]).map((p) => (
              <Pressable key={p} style={styles.primary} onPress={() => start(p)} disabled={busy}>
                <Text style={styles.primaryText}>{`Topla: ${NAMES[p]} (${p === "round" ? "3-5" : STEPS[p].length} fotoğraf)`}</Text>
              </Pressable>
            ))}
            <Pressable style={[styles.primary, styles.secondary]} onPress={runBench} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Bench: bench/in görüntülerini oku</Text>}
            </Pressable>
            <Pressable onPress={() => navigation.goBack()}>
              <Text style={styles.link}>Geri dön</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dark: { flex: 1, backgroundColor: "#111" },
  top: { position: "absolute", top: 0, left: 0, right: 0, padding: 14, gap: 6, backgroundColor: "rgba(0,0,0,0.55)" },
  title: { color: "#fff", fontSize: 16, fontWeight: "700", textAlign: "center" },
  hint: { color: "#fff", fontSize: 15, textAlign: "center" },
  frameWrap: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", paddingBottom: 120 },
  frame: { width: "92%", height: "42%", borderWidth: 2, borderColor: "rgba(255,255,255,0.7)", borderRadius: 16 },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, gap: 12, padding: 16, backgroundColor: "rgba(0,0,0,0.6)" },
  logBox: { maxHeight: 140 },
  logText: { color: "#E0E0E0", fontSize: 11, fontFamily: "monospace" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  buttons: { gap: 10 },
  shutter: { width: 76, height: 76, borderRadius: 38, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", alignSelf: "center" },
  primary: { backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 13, paddingHorizontal: 20, alignItems: "center" },
  secondary: { backgroundColor: "#455A64" },
  primaryText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  link: { color: "#fff", textDecorationLine: "underline", textAlign: "center" },
});
