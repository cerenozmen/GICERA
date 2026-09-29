import { Ionicons } from "@react-native-vector-icons/ionicons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useRef, useState } from "react";
import TextRecognition from "@react-native-ml-kit/text-recognition";
import { ActivityIndicator, Linking, NativeModules, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import RNFS from "react-native-fs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Camera, useCameraDevice, useCameraPermission } from "react-native-vision-camera";
import { analyzeScan, ScanResult, scoreBlockers } from "../api";
import { useApp } from "../AppContext";
import {
  blockerRegion,
  Box,
  chooseReading,
  cropBox,
  GuidedCandidate,
  MAX_PHOTOS,
  MAX_SHOTS,
  MESSAGES,
  Need,
  PhotoReading,
  Prompt,
  promptForNeeds,
  promptHeadline,
  promptText,
  orientedSize,
  placeCrop,
  Quality,
  readPhoto,
  reconstruct,
  serverNeeds,
  Side,
  toScanFrame,
} from "../guidedScan";
import { ScanLine } from "../ingredientScanner";
import { MergedList } from "../photoMerge";
import { RootStackParamList } from "../navigation/types";
import { colors } from "../theme";
import { Product } from "../types";

/*
 * The barcode-less product's ingredient scan (GUIDED_HIGH_RES_PHOTO, see guidedScan.ts): the user takes
 * a high-resolution photo of the ingredient list; the app reads it on the phone and asks for another
 * angle only when something is missing, up to MAX_PHOTOS. The server is asked only once the phone
 * holds a list it can't find anything missing in. Development builds save every scan
 * (guided-<time>.json: the photos' OCR, every decision, the server's answers) for backend
 * `npm run poc:photos -- --guided=<dir>`.
 */

type Complete = Extract<ScanResult, { complete: true }>;

/** ImageCropModule.kt: a photo's upright size (EXIF), and a full-resolution crop of it. */
const ImageCrop: {
  size(path: string): Promise<{ width: number; height: number; rotation: number }>;
  crop(path: string, left: number, top: number, width: number, height: number): Promise<{ path: string; left: number; top: number; width: number; height: number }>;
} | undefined = NativeModules.ImageCrop;

/** Development log of one photo: its OCR as read (the raw evidence), and what the app made of it. */
interface LoggedPhoto {
  id: string;
  /** The real photo the observation comes from (one per photo, whichever pass was used). */
  sourcePhotoId: string;
  at: number;
  captureMs: number;
  /** ML Kit on the whole photo, then on the list's crop (0: no crop). */
  ocrMs: number;
  cropMs: number;
  cropOcrMs: number;
  orientation: string;
  /** The photo's size as ML Kit reads it (EXIF orientation applied). */
  width: number;
  height: number;
  /** The observation used: the crop's reading (in the photo's coordinates) or the whole photo's. */
  pass: "crop" | "original";
  passWhy: string;
  cropBox: Box | null;
  lines: ScanLine[];
  /** Development: the other pass's lines, for comparisons. */
  otherLines?: ScanLine[];
  accepted: boolean;
  quality: Quality;
  section: { rows: string[]; heading: boolean; start: boolean; end: boolean; cropped: string[] } | null;
  /** Merged list after this photo (kept photos only). */
  merged?: { rows: string[]; start: boolean; end: boolean; unplaced: string[]; mergeMs: number; needs: Need[] };
}

interface Exchange {
  at: number;
  photos: number;
  candidate: Omit<GuidedCandidate, "key">;
  roundTripMs: number;
  serverMs?: number;
  scanStatus: string;
  analysisStatus: string;
  unverified: string[];
  score: number | null;
}

interface Session {
  started: number;
  photos: PhotoReading[];
  shots: LoggedPhoto[];
  asked: Side[];
  steps: { at: number; prompt: string; why: string }[];
  exchanges: Exchange[];
  lastKey: string | null;
  lastNeeds: Need[];
  /** A complete result held while one targeted photo is taken (its analysis was blocked). */
  held: Complete | null;
  targetedUsed: boolean;
  over: boolean;
}

const newSession = (): Session => ({
  started: Date.now(),
  photos: [],
  shots: [],
  asked: [],
  steps: [],
  exchanges: [],
  lastKey: null,
  lastNeeds: [],
  held: null,
  targetedUsed: false,
  over: false,
});

const TEST_TAGS = [null, "flat", "tube", "round"] as const;
const TAG_NAMES: Record<string, string> = { flat: "DÜZ", tube: "TÜP", round: "YUVARLAK" };
/** Development: the test tag stays chosen from one scan to the next (5 scans per product in a row). */
let lastTestTag: (typeof TEST_TAGS)[number] = null;

export function GuidedScanScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, "IngredientScan">) {
  const insets = useSafeAreaInsets();
  const { recordScan } = useApp();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const camera = useRef<Camera>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [prompt, setPrompt] = useState<Prompt>({ kind: "first" });
  const [busy, setBusy] = useState<string | null>(null);
  const [kept, setKept] = useState(0);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState(false);
  const [debug, setDebug] = useState<string[]>([]);
  const [panelOpen, setPanelOpen] = useState(true);
  const [testTag, setTestTag] = useState<(typeof TEST_TAGS)[number]>(lastTestTag);
  const session = useRef<Session>(newSession());
  const testTagRef = useRef(testTag);
  testTagRef.current = testTag;
  lastTestTag = testTag;

  // The barcode screen's camera-kit calls CameraX unbindAll() when its view detaches at the end of the
  // transition, which would also drop our session; only start the camera once that is over.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = navigation.addListener("transitionEnd", (event) => {
      if (!event.data.closing) timer = setTimeout(() => setCameraReady(true), 300);
    });
    // Opened without a transition (the app's first screen, a replace): ready anyway.
    const fallback = setTimeout(() => setCameraReady(true), 900);
    return () => {
      unsubscribe();
      clearTimeout(timer);
      clearTimeout(fallback);
    };
  }, [navigation]);

  // Leaving the screen mid-scan: the scan's log still says how far it got.
  useEffect(
    () => () => {
      if (!session.current.over && session.current.shots.length) saveLog(session.current, "left");
    },
    []
  );

  async function askPermission() {
    if (!(await requestPermission())) setPermissionDenied(true);
  }

  const note = (line: string) => {
    if (__DEV__) setDebug((lines) => [line, ...lines].slice(0, 14));
  };

  function saveLog(s: Session, outcome: string, result?: ScanResult) {
    if (!__DEV__) return;
    const complete = result?.complete ? result : null;
    const log = {
      kind: "guided",
      session: `guided-${s.started}`,
      testTag: testTagRef.current,
      outcome,
      durationMs: Date.now() - s.started,
      photos: s.shots,
      steps: s.steps,
      exchanges: s.exchanges,
      result: result
        ? {
            scanStatus: result.scanStatus,
            analysisStatus: result.analysisStatus,
            score: complete && complete.reliable ? complete.cleanScore : null,
            ingredientsText: complete?.ingredientsText ?? null,
            ingredients: complete?.ingredients ?? null,
            unverified: complete ? complete.ingredients.filter((i) => i.status === "unknown").map((i) => i.text) : [],
            // Why no score: names OCR visibly misread, or names read right that the dictionary lacks.
            analysisBlocker: !complete || complete.reliable ? null : complete.ingredients.some((i) => i.status === "unknown" && i.ocrSuspect) ? "OCR" : complete.ingredients.some((i) => i.status === "unknown") ? "DICTIONARY_MISS" : result.analysisStatus,
          }
        : null,
    };
    console.log(`[guided] ${outcome} in ${log.durationMs} ms, ${s.shots.length} photos (${s.photos.length} kept), ${s.exchanges.length} server requests`);
    RNFS.writeFile(`${RNFS.DocumentDirectoryPath}/guided-${s.started}.json`, JSON.stringify(log)).catch(() => {});
  }

  function ask(next: Prompt, why: string) {
    const s = session.current;
    if (next.kind === "more") s.asked.push(next.side);
    s.steps.push({ at: Date.now() - s.started, prompt: next.kind === "more" ? `more:${next.side}` : next.kind === "retake" ? `retake:${next.problem}` : next.kind, why });
    setPrompt(next);
    note(`→ ${next.kind === "more" ? `more ${next.side}` : next.kind === "retake" ? `retake ${next.problem}` : next.kind}: ${why}`);
  }

  function fail(why: string) {
    const s = session.current;
    s.over = true;
    s.steps.push({ at: Date.now() - s.started, prompt: "failed", why });
    saveLog(s, `incomplete: ${why}`);
    setFailed(true);
  }

  /**
   * The list read whole: the result screen, with the score when the analysis could give one, else the
   * list alone and why there is no score. The camera is done either way.
   */
  function finish(result: Complete) {
    const s = session.current;
    s.over = true;
    setDone(true);
    saveLog(s, result.reliable ? "score" : `complete_${result.analysisStatus.toLowerCase()}`, result);
    const id = `custom:${Date.now()}`;
    const now = new Date();
    const stamp = `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const product: Product = {
      barcode: id,
      productName: route.params?.productName ?? "Kendi taramam",
      brands: `Kendi içerik listem · ${stamp}`,
      ingredientsText: result.ingredientsText,
      imageUrl: null,
      cleanScore: result.reliable ? result.cleanScore : null,
      cleanRating: result.reliable ? result.cleanRating : null,
      pregnancySafe: result.reliable ? result.pregnancySafe : null,
      flaggedIngredients: result.reliable ? result.flaggedIngredients : [],
      unverifiedIngredients: result.ingredients.filter((item) => item.status === "unknown").map((item) => item.text),
      scoreBlockers: result.reliable ? undefined : scoreBlockers(result.ingredients),
      rescanRoute: "IngredientScan",
    };
    recordScan(product);
    navigation.replace("ProductDetail", { barcode: id, product });
  }

  /** The list is still incomplete: ask for the photo that can complete it, or give up. */
  function askMore(needs: Need[], merged: MergedList | null, why: string) {
    const s = session.current;
    // The targeted photo after a complete list didn't give a complete list again: the complete one stands.
    if (s.held) return finish(s.held);
    if (s.photos.length >= MAX_PHOTOS || s.shots.length >= MAX_SHOTS) return fail(`${s.photos.length} photos, still ${why}`);
    const next = promptForNeeds(needs, s.asked, merged);
    if (!next) return fail(`nothing to ask for: ${why}`);
    ask(next, why);
  }

  async function send(candidate: GuidedCandidate): Promise<ScanResult> {
    const s = session.current;
    const { path, readings, edges, ingredientsText, evidence } = candidate;
    const body = { path, readings, edges, ingredientsText, evidence };
    const sentAt = Date.now();
    const result = await analyzeScan(body);
    const roundTripMs = Date.now() - sentAt;
    s.lastKey = candidate.key;
    s.exchanges.push({
      at: sentAt - s.started,
      photos: s.photos.length,
      candidate: body,
      roundTripMs,
      serverMs: result.serverMs,
      scanStatus: result.scanStatus,
      analysisStatus: result.analysisStatus,
      unverified: result.complete ? result.ingredients.filter((i) => i.status === "unknown").map((i) => i.text) : result.unverifiedBoundaries.map((b) => `${b.kind}@${b.row + 1}: ${b.reason}`),
      score: result.complete && result.reliable ? result.cleanScore : null,
    });
    note(`server ${roundTripMs} ms (${result.serverMs ?? "-"} ms): ${result.scanStatus} / ${result.analysisStatus}${result.complete && result.reliable ? ` / score ${result.cleanScore}` : ""}`);
    return result;
  }

  async function shoot() {
    const s = session.current;
    if (busy || !camera.current || s.over) return;
    setBusy(MESSAGES.reading);
    try {
      const at = Date.now() - s.started;
      const captureStart = Date.now();
      const file = await camera.current.takePhoto({ flash: "off", enableShutterSound: false });
      const captureMs = Date.now() - captureStart;
      const raw = file.path.replace(/^file:\/\//, "");
      const id = `P${s.shots.length + 1}`;
      let ocrMs = 0;
      let cropMs = 0;
      let cropOcrMs = 0;
      let reading;
      let choice;
      let box: Box | null = null;
      let size = orientedSize(file.width, file.height, file.orientation);
      let otherLines: ScanLine[] | undefined;
      // Each pass's lines in ML Kit's frame of the whole photo (size), as logged and replayed.
      let wholeLines: ScanLine[] = [];
      let cropLines: ScanLine[] | null = null;
      try {
        // The photo's size as ML Kit reads it, from the file itself (EXIF), whatever way the phone was held.
        if (ImageCrop) size = await ImageCrop.size(raw).then(({ width, height }) => ({ width, height })).catch(() => size);
        const ocrStart = Date.now();
        const ocr = await TextRecognition.recognize(`file://${raw}`);
        ocrMs = Date.now() - ocrStart;
        const whole = toScanFrame(ocr, size.width, size.height);
        wholeLines = whole.lines;
        reading = readPhoto(whole, id);
        // Second pass: the list's region at full resolution (bigger print for ML Kit), when the photo is usable.
        box = !reading.quality.problem && ImageCrop ? cropBox(reading, size) : null;
        let cropped = null;
        if (box) {
          const cropStart = Date.now();
          const out = await ImageCrop!.crop(raw, box.left, box.top, box.width, box.height).catch(() => null);
          cropMs = Date.now() - cropStart;
          if (out) {
            try {
              const cropOcrStart = Date.now();
              const cropOcr = await TextRecognition.recognize(`file://${out.path}`);
              cropOcrMs = Date.now() - cropOcrStart;
              box = { left: out.left, top: out.top, width: out.width, height: out.height };
              const placed = placeCrop(toScanFrame(cropOcr, out.width, out.height), box, size);
              cropLines = placed.lines;
              cropped = readPhoto(placed, id);
            } finally {
              RNFS.unlink(out.path).catch(() => {});
            }
          }
        }
        choice = chooseReading(reading, cropped, box, size);
        if (__DEV__) otherLines = choice.pass === "crop" ? wholeLines : cropLines ?? undefined;
      } finally {
        // Development builds keep the photo (guided-<session>-<id>.jpg) for later measurements.
        if (__DEV__) RNFS.moveFile(raw, `${RNFS.DocumentDirectoryPath}/guided-${s.started}-${id}.jpg`).catch(() => RNFS.unlink(raw).catch(() => {}));
        else RNFS.unlink(raw).catch(() => {});
      }
      const used = choice.reading;
      // Whether the photo is usable is the whole photo's question; what it says, the chosen pass's.
      const accepted = !reading.quality.problem;
      const section = used.section;
      const logged: LoggedPhoto = {
        id,
        sourcePhotoId: id,
        at,
        captureMs,
        ocrMs,
        cropMs,
        cropOcrMs,
        orientation: file.orientation,
        width: size.width,
        height: size.height,
        pass: choice.pass,
        passWhy: choice.why,
        cropBox: box,
        lines: choice.pass === "crop" && cropLines ? cropLines : wholeLines,
        otherLines,
        accepted,
        quality: reading.quality,
        section: section ? { rows: section.rows, heading: section.heading, start: !!section.start, end: !!section.end, cropped: section.cropped } : null,
      };
      s.shots.push(logged);
      note(`${id}: ${file.orientation} ${size.width}x${size.height}, capture ${captureMs} ms, OCR ${ocrMs}+${cropOcrMs} ms (crop ${cropMs} ms), pass ${choice.pass} (${choice.why}), ${used.frame.lines.length} lines, ${section ? `list ${section.rows.length} rows${section.heading ? " H" : ""}${section.start ? " S" : ""}${section.end ? " E" : ""}` : "no list"}, quality ${reading.quality.problem ?? "ok"} (${reading.quality.detail})`);

      if (!accepted) {
        if (s.shots.length >= MAX_SHOTS) return fail(`unusable photos (${reading.quality.problem})`);
        return ask({ kind: "retake", problem: reading.quality.problem! }, reading.quality.detail);
      }
      s.photos.push(used);
      setKept(s.photos.length);

      const mergeStart = Date.now();
      const rec = reconstruct(s.photos);
      const mergeMs = Date.now() - mergeStart;
      logged.merged = rec.merged
        ? { rows: rec.merged.rows, start: rec.merged.start, end: rec.merged.end, unplaced: rec.merged.unplaced, mergeMs, needs: rec.completeness.needs }
        : undefined;
      if (__DEV__ && rec.merged) note(`merged ${rec.merged.rows.length} rows in ${mergeMs} ms${rec.merged.unplaced.length ? `, not placed: ${rec.merged.unplaced.join(",")}` : ""}; ${rec.completeness.status} ${rec.completeness.needs.map((n) => n.need + ("row" in n ? `@${n.row + 1}` : "")).join(" ")}`);

      if (!rec.candidate) return askMore(rec.completeness.needs, rec.merged, rec.completeness.needs.map((n) => n.need).join(", "));
      // Nothing new since the server last said what is missing: that still holds.
      if (rec.candidate.key === s.lastKey) return askMore(s.lastNeeds, rec.merged, "same list as before");

      setBusy(MESSAGES.analysing);
      const result = await send(rec.candidate);
      if (!result.complete) {
        s.lastNeeds = serverNeeds(result.unverifiedBoundaries);
        return askMore(s.lastNeeds, rec.merged, result.unverifiedBoundaries.map((b) => `${b.kind}@${b.row + 1}`).join(", "));
      }
      // Complete, analysis blocked by names OCR visibly misread in a known place: one closer photo of
      // that place, once, while photos are left. Otherwise, the result.
      if (result.analysisStatus !== "SCORE_AVAILABLE" && !s.targetedUsed && s.photos.length < MAX_PHOTOS && rec.merged) {
        const region = blockerRegion(result.ingredients, rec.merged);
        if (region !== undefined) {
          s.targetedUsed = true;
          s.held = result;
          return ask({ kind: "targeted", region }, `${result.analysisStatus}: ${result.ingredients.filter((i) => i.ocrSuspect).map((i) => i.text).join(", ")}`);
        }
      }
      finish(result);
    } catch (err) {
      note(`error: ${err instanceof Error ? err.message : String(err)}`);
      if (s.held) return finish(s.held);
      ask({ kind: "retake", problem: "no_text" }, err instanceof Error ? err.message : "photo failed");
    } finally {
      setBusy(null);
    }
  }

  function restart() {
    session.current = newSession();
    setKept(0);
    setFailed(false);
    setDebug([]);
    setPrompt({ kind: "first" });
  }

  if (!hasPermission) {
    return (
      <View style={[styles.dark, styles.center]}>
        <Ionicons name="camera-outline" size={48} color="#fff" />
        <Text style={styles.centerText}>
          {permissionDenied ? "Kamera izni verilmedi. İçerik listesini taramak için ayarlardan kamera iznini açabilirsin." : "İçerik listesini taramak için kamera izni gerekli."}
        </Text>
        <Pressable style={styles.primary} onPress={permissionDenied ? () => Linking.openSettings() : askPermission}>
          <Text style={styles.primaryText}>{permissionDenied ? "Ayarları aç" : "İzin ver"}</Text>
        </Pressable>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.link}>Geri dön</Text>
        </Pressable>
      </View>
    );
  }

  const headline = promptHeadline(prompt);
  return (
    <View style={styles.dark}>
      {device && cameraReady && <Camera ref={camera} style={StyleSheet.absoluteFill} device={device} isActive={!failed && !done} photo />}

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={28} color="#fff" />
        </Pressable>
        <Text style={styles.title}>İçerik Listesini Tara</Text>
        <View style={styles.dots}>
          {Array.from({ length: MAX_PHOTOS }, (_, i) => (
            <View key={i} style={[styles.dot, i < kept && styles.dotOn]} />
          ))}
        </View>
      </View>

      {/* The guide: a wide frame for the list's text, in the middle of the picture (where it reads best). */}
      <View style={styles.frameWrap} pointerEvents="none">
        <View style={styles.frame}>
          <View style={[styles.corner, styles.tl]} />
          <View style={[styles.corner, styles.tr]} />
          <View style={[styles.corner, styles.bl]} />
          <View style={[styles.corner, styles.br]} />
        </View>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 18 }]}>
        {!!headline && <Text style={styles.headline}>{headline}</Text>}
        <Text style={styles.hint}>{promptText(prompt)}</Text>
        {__DEV__ && (
          <View style={styles.panel}>
            <Pressable onPress={() => setPanelOpen((open) => !open)} onLongPress={() => setTestTag((tag) => TEST_TAGS[(TEST_TAGS.indexOf(tag) + 1) % TEST_TAGS.length])}>
              <Text style={styles.panelTitle}>{`DEBUG guided-${session.current.started} · test: ${testTag ? TAG_NAMES[testTag] : "-"} (uzun bas) ${panelOpen ? "▾" : "▸"}`}</Text>
            </Pressable>
            {panelOpen && (
              <ScrollView style={styles.panelScroll}>
                <Text style={styles.panelText}>{debug.join("\n") || "-"}</Text>
              </ScrollView>
            )}
          </View>
        )}
        <View style={styles.actions}>
          <View style={styles.side}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
              <Text style={styles.link}>Vazgeç</Text>
            </Pressable>
          </View>
          <Pressable style={[styles.shutter, !!busy && styles.shutterBusy]} onPress={shoot} disabled={!!busy || !cameraReady} accessibilityLabel="Fotoğraf çek">
            {busy ? <ActivityIndicator color={colors.primary} /> : <View style={styles.shutterInner} />}
          </Pressable>
          <View style={styles.side}>
            {prompt.kind === "targeted" && session.current.held && !busy && (
              <Pressable onPress={() => finish(session.current.held!)} hitSlop={10}>
                <Text style={styles.link}>Atla</Text>
              </Pressable>
            )}
          </View>
        </View>
        {!!busy && <Text style={styles.busy}>{busy}</Text>}
      </View>

      {failed && (
        <View style={[styles.overlay, styles.center]}>
          <Ionicons name="alert-circle-outline" size={48} color="#fff" />
          <Text style={styles.centerTitle}>{MESSAGES.incomplete}</Text>
          <Text style={styles.centerText}>İçerik listesini ışığı iyi bir yerde, yazılar net görünecek şekilde tekrar çekmeyi deneyin.</Text>
          <Pressable style={styles.primary} onPress={restart}>
            <Text style={styles.primaryText}>Tekrar dene</Text>
          </Pressable>
          <Pressable onPress={() => navigation.goBack()}>
            <Text style={styles.link}>Geri dön</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const CORNER = 30;
const styles = StyleSheet.create({
  dark: { flex: 1, backgroundColor: "#111" },
  center: { alignItems: "center", justifyContent: "center", gap: 14, padding: 24 },
  centerTitle: { color: "#fff", fontSize: 18, fontWeight: "700", textAlign: "center" },
  centerText: { color: "#fff", fontSize: 15, textAlign: "center", lineHeight: 21 },
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.8)" },
  topBar: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, backgroundColor: "rgba(0,0,0,0.35)" },
  title: { color: "#fff", fontSize: 17, fontWeight: "600" },
  dots: { flexDirection: "row", gap: 5, width: 60, justifyContent: "flex-end" },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.35)" },
  dotOn: { backgroundColor: "#3DDC84" },
  frameWrap: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", paddingBottom: 150 },
  frame: { width: "92%", height: "42%", borderWidth: 1, borderColor: "rgba(255,255,255,0.35)", borderRadius: 16 },
  corner: { position: "absolute", width: CORNER, height: CORNER, borderColor: "#fff" },
  tl: { top: -2, left: -2, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 16 },
  tr: { top: -2, right: -2, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 16 },
  bl: { bottom: -2, left: -2, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 16 },
  br: { bottom: -2, right: -2, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 16 },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", gap: 8, paddingTop: 16, paddingHorizontal: 20, backgroundColor: "rgba(0,0,0,0.55)" },
  headline: { color: "#FFD54F", fontSize: 15, fontWeight: "700", textAlign: "center" },
  hint: { color: "#fff", fontSize: 15, fontWeight: "600", textAlign: "center", lineHeight: 21 },
  actions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", alignSelf: "stretch", marginTop: 6 },
  side: { width: 80, alignItems: "center" },
  shutter: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: "#fff", alignItems: "center", justifyContent: "center" },
  shutterBusy: { backgroundColor: "#fff" },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: "#fff" },
  busy: { color: "#fff", fontSize: 13 },
  link: { color: "#fff", textDecorationLine: "underline", textAlign: "center" },
  primary: { backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 15, paddingHorizontal: 28, alignItems: "center" },
  primaryText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  panel: { alignSelf: "stretch", backgroundColor: "rgba(0,0,0,0.8)", borderRadius: 8, padding: 6 },
  panelScroll: { maxHeight: 150 },
  panelTitle: { color: "#FFD54F", fontSize: 11, fontFamily: "monospace", fontWeight: "700" },
  panelText: { color: "#E0E0E0", fontSize: 10, fontFamily: "monospace" },
});
