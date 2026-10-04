import { Ionicons } from "@react-native-vector-icons/ionicons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useRef, useState } from "react";
import TextRecognition, { TextRecognitionResult } from "@react-native-ml-kit/text-recognition";
import { orientedSize, toScanFrame } from "../guidedScan";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import RNFS from "react-native-fs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Camera, useCameraDevice, useCameraPermission } from "react-native-vision-camera";
import { AnalysisResult, analyzeScan, scoreBlockers } from "../api";
import { useApp } from "../AppContext";
import { BackButton } from "../components/common";
import { joinLines, normalizeListItems } from "../ingredients";
import { addFrame, candidates, createScan, readyToCheck, FrameReading, FrameReport, progressLevel, readSection, ScanLine, ScanPhase, ScanState } from "../ingredientScanner";
import { RootStackParamList } from "../navigation/types";
import { colors } from "../theme";
import { Product } from "../types";

/*
 * The ingredient list scan (route IngredientScan). The ingredient scanner (see ingredientScanner.ts): the camera runs, snapshots are read continuously,
 * and the scan ends by itself once the whole list has been read and analysed, or once it stops
 * getting anywhere. When a snapshot shows the whole list, one high-resolution photo of the same view
 * is taken and read as well (small print reads better at full resolution); development builds log
 * both so the two can be compared (backend `npm run scan:compare -- --pairs`).
 */

// Time limits (starting values for device tests; the scan logs record what real scans need).
/** No ingredient list seen at all for this long: give up. */
const SEARCH_LIMIT_MS = 20000;
/** No progress for this long: change the hint... */
const HINT_AFTER_MS = 5000;
/** ...and for this long: give up (an incomplete list is never shown). */
const NO_PROGRESS_MS = 12000;
const MAX_SCAN_MS = 45000;
/** High-resolution photos: at most one per this interval, and this many per scan. */
const PHOTO_INTERVAL_MS = 4000;
const MAX_PHOTOS = 4;
/**
 * A whole list whose score is withheld for names OCR visibly misread ("Titanlum Dloxide" at a tube's
 * curve): keep reading this long, for one clean read of them in another view...
 */
const IMPROVE_MS = 10000;
/** ...with a high-resolution photo at most this often, and this many. */
const IMPROVE_PHOTO_MS = 2500;
const IMPROVE_PHOTOS = 3;
/**
 * Rebuilding the list from every observation (settled) and checking it: at most this often while
 * views come in (a frame showing the whole list is checked at once).
 */
const CHECK_INTERVAL_MS = 1500;
/** Text rows lower than this (snapshot pixels) are too small to read reliably. */
const SMALL_TEXT_PX = 12;

const MESSAGES = {
  show: "İçerik listesini kameraya gösterin.",
  reading: "İçerikler okunuyor…",
  turn: "Ürünü yavaşça çevirerek listenin devamını gösterin.",
  // The rebuilt list stopped growing: the same part of the package keeps being shown.
  wider: "Listenin diğer tarafını da kameraya göstermek için ürünü biraz daha çevirin.",
  frame: "Listenin tamamını kadraja alın.",
  closer: "Yazıları biraz daha yakından ve sabit gösterin.",
  failed: "İçerik listesinin tamamı güvenilir şekilde okunamadı. Tekrar deneyin.",
  done: "İçerikler okundu ✓",
};

type Source = "snapshot" | "photo";

interface LoggedFrame {
  at: number;
  source: Source;
  /** Index of the snapshot a photo was taken after (same view). */
  pairedWith?: number;
  captureMs: number;
  ocrMs: number;
  scanMs: number;
  width: number;
  height: number;
  lines: ScanLine[];
  verdict: FrameReport["verdict"];
  reason: string | null;
  section: FrameReading["section"];
  /** MULTI_VIEW: where the frame's list rows were placed, their exact overlap with the rebuilt rows,
   *  what they added, and the rebuilt rows after the frame (when it changed them). */
  placement: Pick<FrameReport, "offset" | "overlaps" | "grew" | "newPieces" | "mixed" | "newEvidence">;
  rebuiltAfter?: string[];
  /** What the frame changed, as the development panel shows it. */
  change?: string;
}

/** Development panel: what the scanner holds right now (development builds only). */
interface DevPanel {
  session: string;
  frames: number;
  ocrLines: number;
  section: boolean;
  fragments: number;
  rows: number;
  ingredients: number;
  start: boolean;
  end: boolean;
  scanStatus: string;
  analysisStatus: string;
  lastUsefulS: number | null;
  lastReject: string;
  liveText: string;
  changes: string[];
  highRes: { requested: boolean; captured: boolean | null; lines: number | null; ingredients: number | null };
  sent: string;
  returned: string;
}

const newPanel = (session: string): DevPanel => ({
  session, frames: 0, ocrLines: 0, section: false, fragments: 0, rows: 0, ingredients: 0, start: false, end: false,
  scanStatus: "-", analysisStatus: "-", lastUsefulS: null, lastReject: "-", liveText: "", changes: [],
  highRes: { requested: false, captured: null, lines: null, ingredients: null }, sent: "", returned: "",
});

/** The list the scanner has rebuilt so far, as items. */
const liveItems = (scan: ScanState) => normalizeListItems(joinLines(scan.rows));

export function IngredientScanScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, "IngredientScan">) {
  const insets = useSafeAreaInsets();
  const { recordScan } = useApp();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const camera = useRef<Camera>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [phase, setPhase] = useState<ScanPhase | null>(null);
  const [hint, setHint] = useState(MESSAGES.show);
  const [failure, setFailure] = useState<string | null>(null);
  const scanning = useRef(false);

  // Leaving the screen ends a running scan.
  useEffect(
    () => () => {
      scanning.current = false;
    },
    []
  );

  // The barcode screen's camera-kit calls CameraX unbindAll() when its view detaches at the end of
  // the transition, which would also drop our session; only start the camera once that is over.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = navigation.addListener("transitionEnd", (event) => {
      if (!event.data.closing) timer = setTimeout(() => setCameraReady(true), 300);
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [navigation]);

  async function askPermission() {
    if (!(await requestPermission())) setPermissionDenied(true);
  }

  /**
   * Shows the list read as a product: with its score when the analysis could give one, else the list
   * alone (the product screen says why there is no score). The list was read whole either way.
   */
  function showResult(result: AnalysisResult, onNavigate?: (detail: string) => void) {
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
    onNavigate?.(`ProductDetail, ${result.reliable ? `score ${result.cleanScore}` : "no score"}, ${result.ingredients.length} ingredients`);
    // The list read first ("Ürün içeriği okundu"), then its result.
    navigation.replace("IngredientAnalysis", { product, fromScan: true });
  }

  async function runScan() {
    if (scanning.current) return;
    const scan = createScan();
    const started = Date.now();
    const at = () => Date.now() - started;
    const frames: LoggedFrame[] = [];
    const validations: { at: number; path: string; readings: number; scanStatus: string; analysisStatus: string; unverified: string[]; score: number | null; settleMs: number }[] = [];
    const phases: { at: number; phase: ScanPhase }[] = [];
    const sent = new Set<string>();
    let current: ScanPhase = "SEARCHING";
    let listSeenAt: number | null = null;
    let lastProgressAt = started;
    let bestProgress = 0;
    let fewestUnverified = Infinity;
    let lastPhotoAt = 0;
    let photos = 0;
    let lastCheckAt = 0;
    /** Development log: the scan's steps from a complete list to the result screen. */
    const events: { at: number; event: string; detail?: string }[] = [];
    const note = (event: string, detail?: string) => events.push({ at: at(), event, detail });
    let lookedAgain = false;
    /** The latest whole list, held while the scan looks for clean reads of names OCR misread. */
    let held: (AnalysisResult & { analysisStatus: string }) | null = null;
    let improveUntil: number | null = null;
    let improvePhotos = 0;
    let lastReading: FrameReading | null = null;
    let lastFailure = "";
    const session = `scan-${started}`;
    // Development panel, updated after every frame and server exchange.
    const dev = newPanel(session);
    const show = (patch: Partial<DevPanel> = {}) => {
      if (!__DEV__) return;
      Object.assign(dev, patch);
    };
    /** What the server was sent and what it returned, for the log and the panel. */
    const exchange = async (candidate: ReturnType<typeof candidates>[number], label: string) => {
      note("server request", label);
      if (__DEV__) {
        events.push({ at: at(), event: "final ingredient list sent to server", detail: candidate.ingredientsText });
        show({ sent: `${label}: ${candidate.ingredientsText}` });
      }
      const result = await analyzeScan(candidate);
      const returned = `${result.scanStatus} / ${result.analysisStatus}${result.complete ? ` / ${result.ingredients.length} ingredients / scoreAllowed ${result.reliable} / score ${result.reliable ? result.cleanScore : "-"}` : ` / ${result.unverifiedBoundaries.map((b) => `${b.kind}@${b.row + 1}: ${b.reason}`).slice(0, 2).join("; ")}`}`;
      note("server response", returned);
      if (__DEV__ && result.complete) events.push({ at: at(), event: "server ingredients", detail: result.ingredients.map((i) => `${i.text} [${i.status}]`).join(", ") });
      show({ returned, scanStatus: result.scanStatus, analysisStatus: result.analysisStatus });
      return result;
    };

    const enter = (next: ScanPhase) => {
      if (next === current && phases.length) return;
      current = next;
      phases.push({ at: at(), phase: next });
      setPhase(next);
    };
    const saveLog = (outcome: string) => {
      if (!__DEV__) return;
      // A scan that ends without a result says how far it got (the oracle runs on this log: backend
      // `npm run scan:oracle`).
      const items = liveItems(scan);
      const summary = {
        ocrObservedChars: frames.reduce((n, f) => n + (f.section?.rows.join(" ").length ?? 0), 0),
        reconstructedChars: scan.rows.join(" ").length,
        reconstructedIngredients: items.length,
        unresolved: lastFailure || "-",
        startEvidence: scan.start,
        endEvidence: scan.end,
        lastBlocker: lastFailure || lastReading?.reason || "-",
      };
      const log = { session, outcome, durationMs: at(), photos, phases, summary, validations, events, frames, rebuilt: { rows: scan.rows, start: scan.start, end: scan.end, restarts: scan.restarts } };
      console.log(`[scan] ${outcome} in ${log.durationMs} ms, ${frames.length} frames (${photos} photos), ${validations.length} checks`);
      RNFS.writeFile(`${RNFS.DocumentDirectoryPath}/scan-${started}.json`, JSON.stringify(log)).catch(() => {});
    };
    const finish = (outcome: string, message: string) => {
      scanning.current = false;
      saveLog(outcome);
      enter("RETRY");
      setFailure(message);
    };
    /** Ends with the whole list held, without a score (the product screen says why). */
    const endHeld = async () => {
      const result = held!;
      scanning.current = false;
      enter("COMPLETE");
      setHint(MESSAGES.done);
      await new Promise<void>((resolve) => setTimeout(() => resolve(), 800));
      showResult(result, (detail) => note("navigation", detail));
      saveLog(`scan_complete_${result.analysisStatus.toLowerCase()}`);
    };
    /**
     * Which names to bring into view, and which way to turn the product: a name toward a row's end sits
     * round the right of a tube's curve (turning the product left brings it to the middle), toward its
     * start round the left.
     */
    const improveHint = (names: string[]) => {
      const places = names.flatMap((name) => {
        for (const word of name.toLowerCase().split(/\s+/).filter((w) => w.length >= 4)) {
          const row = scan.rows.find((r) => r.toLowerCase().includes(word));
          if (row) return [row.toLowerCase().indexOf(word) / Math.max(1, row.length)];
        }
        return [];
      });
      const list = names.slice(0, 2).join(", ");
      if (!places.length) return `Birkaç içerik net okunamadı (${list}). Bu kısmı ortaya getirip telefonu sabit tutun.`;
      const turn = places.reduce((a, b) => a + b, 0) / places.length > 0.5 ? "sola" : "sağa";
      return `Birkaç içerik net okunamadı (${list}). Ürünü biraz ${turn} çevirip bu kısmı ortaya getirin ve sabit tutun.`;
    };

    /** Captures one frame, reads it and adds it to the scan. */
    const take = async (source: Source, pairedWith?: number): Promise<FrameReading | null> => {
      if (!camera.current) return null;
      const captureStart = Date.now();
      let path: string;
      let width: number;
      let height: number;
      let orientation: string | undefined;
      try {
        const file = source === "photo" ? await camera.current.takePhoto({ flash: "off" }) : await camera.current.takeSnapshot({ quality: 90 });
        path = file.path.startsWith("file://") ? file.path : `file://${file.path}`;
        width = file.width;
        height = file.height;
        orientation = "orientation" in file ? file.orientation : undefined;
      } catch {
        return null;
      }
      const captureMs = Date.now() - captureStart;
      const ocrStart = Date.now();
      let ocr: TextRecognitionResult;
      try {
        ocr = await TextRecognition.recognize(path);
      } catch {
        return null;
      } finally {
        RNFS.unlink(path).catch(() => {});
      }
      const ocrMs = Date.now() - ocrStart;
      // takePhoto reports the sensor's landscape size; ML Kit reads the picture upright.
      const size = source === "photo" ? orientedSize(width, height, orientation) : { width, height };
      const frame = toScanFrame(ocr, size.width, size.height);
      const before = __DEV__ ? [...scan.rows] : [];
      const scanStart = Date.now();
      const reading = readSection(frame);
      const report = addFrame(scan, reading);
      const scanMs = Date.now() - scanStart;
      if (__DEV__) {
        // What this frame changed: the first rebuilt row it changed, its overlap, and the rebuilt length.
        const index = frames.length;
        const changedRow = scan.rows.findIndex((row, i) => row !== before[i]);
        const overlap = Math.max(0, ...report.overlaps);
        const chars = (rows: string[]) => rows.join(" ").length;
        const change =
          report.verdict === "no_list" || report.verdict === "unplaced"
            ? `REJECTED: ${report.reason ?? report.verdict}`
            : changedRow < 0 && report.verdict !== "restarted"
              ? `DUPLICATE (overlap ${overlap})`
              : `${report.verdict === "restarted" ? "RESTARTED " : ""}+ row ${changedRow + 1}: "${scan.rows[changedRow]?.slice(-40) ?? ""}" overlap ${overlap}, chars ${chars(before)} → ${chars(scan.rows)}`;
        frames.push({ at: at(), source, pairedWith, captureMs, ocrMs, scanMs, width: frame.width, height: frame.height, lines: frame.lines, verdict: report.verdict, reason: report.reason, section: reading.section,
          placement: { offset: report.offset, overlaps: report.overlaps, grew: report.grew, newPieces: report.newPieces, mixed: report.mixed, newEvidence: report.newEvidence },
          rebuiltAfter: report.verdict === "useful" || report.verdict === "restarted" ? [...scan.rows] : undefined, change });
        const useful = changedRow >= 0 || report.verdict === "restarted";
        show({
          frames: frames.length,
          ocrLines: frame.lines.length,
          section: !!reading.section,
          fragments: scan.rebuilt.reduce((n, row) => n + row.pieces.length, 0),
          rows: scan.rows.length,
          ingredients: liveItems(scan).length,
          start: scan.start !== null,
          end: scan.end !== null,
          lastUsefulS: useful ? Math.round(at() / 100) / 10 : dev.lastUsefulS,
          lastReject: report.verdict === "no_list" || report.verdict === "unplaced" ? report.reason ?? report.verdict : dev.lastReject,
          liveText: scan.rows.join("\n"),
          changes: [`Frame ${index}${source === "photo" ? " (high-res)" : ""}: ${change}`, ...dev.changes].slice(0, 6),
        });
        if (source === "photo" && dev.highRes.requested) {
          show({ highRes: { requested: true, captured: true, lines: frame.lines.length, ingredients: reading.section ? normalizeListItems(joinLines(reading.section.rows)).length : 0 } });
        }
      }
      return reading;
    };

    scanning.current = true;
    setFailure(null);
    setHint(MESSAGES.show);
    phases.length = 0;
    enter("SEARCHING");
    show();

    try {
      while (scanning.current && camera.current) {
        const reading = await take("snapshot");
        if (!scanning.current) break;
        if (!reading) continue;
        lastReading = reading;
        if (reading.section && listSeenAt === null) listSeenAt = Date.now();

        // The whole list in view: one high-resolution photo of it as well.
        if (reading.section?.whole && photos < MAX_PHOTOS && Date.now() - lastPhotoAt > PHOTO_INTERVAL_MS) {
          enter("READING");
          setHint(MESSAGES.reading);
          photos++;
          lastPhotoAt = Date.now();
          show({ highRes: { requested: true, captured: null, lines: null, ingredients: null } });
          if (!(await take("photo", frames.length - 1))) show({ highRes: { requested: true, captured: false, lines: null, ingredients: null } });
          if (!scanning.current) break;
        }

        // Check every new candidate: the whole list from single frames, the list rebuilt from several
        // (from every observation so far, the same whatever order they came in).
        const due = readyToCheck(scan) && (!!reading.section?.whole || Date.now() - lastCheckAt >= CHECK_INTERVAL_MS);
        const settleStart = Date.now();
        const toCheck = due ? candidates(scan) : [];
        const settleMs = Date.now() - settleStart;
        if (due) lastCheckAt = Date.now();
        for (const candidate of toCheck) {
          if (sent.has(candidate.key)) continue;
          sent.add(candidate.key);
          enter(candidate.path === "full_frame" ? "FULL_FRAME_VALIDATING" : "VALIDATING");
          setHint(MESSAGES.reading);
          const result = await exchange(candidate, candidate.path);
          const unverified = result.complete ? [] : result.unverifiedBoundaries.map((b) => `${b.kind}@${b.row + 1}: ${b.reason}`);
          validations.push({
            at: at(),
            path: candidate.path,
            readings: candidate.readings.length,
            scanStatus: result.scanStatus,
            analysisStatus: result.analysisStatus,
            unverified,
            score: result.complete && result.reliable ? result.cleanScore : null,
            settleMs,
          });
          if (!scanning.current) break;
          if (!result.complete) {
            lastFailure = unverified.slice(0, 2).join("; ");
            // Fewer unseen boundaries than ever: the scan is getting somewhere.
            if (unverified.length < fewestUnverified) {
              fewestUnverified = unverified.length;
              lastProgressAt = Date.now();
            }
            continue;
          }
          if (result.reliable) {
            scanning.current = false;
            enter("COMPLETE");
            setHint(MESSAGES.done);
            await new Promise<void>((resolve) => setTimeout(() => resolve(), 800));
            showResult(result, (detail) => note("navigation", detail));
            saveLog("reliable");
            return;
          }
          // The whole list was read, but the analysis can't vouch for a score (an unknown name that could
          // be a flagged one; or names misread in low-resolution snapshots). The scan is done, after one
          // last look in full resolution when the list hasn't been photographed yet: small print misread
          // in snapshots reads better there. Scanning on beyond that won't change the label.
          note("scan candidate complete", `${candidate.path}, analysis ${result.analysisStatus}`);
          if (!lookedAgain && photos < MAX_PHOTOS && camera.current) {
            lookedAgain = true;
            note("high-res capture requested");
            show({ highRes: { requested: true, captured: null, lines: null, ingredients: null } });
            photos++;
            lastPhotoAt = Date.now();
            enter("READING");
            setHint(MESSAGES.reading);
            const photo = await take("photo", frames.length - 1);
            note("high-res capture", photo ? `ok, ${photo.section ? `list ${photo.section.rows.length} rows` : "no list"}` : "failed (going on without it)");
            if (!photo) show({ highRes: { requested: true, captured: false, lines: null, ingredients: null } });
            for (const again of candidates(scan)) {
              if (sent.has(again.key) || !scanning.current) continue;
              sent.add(again.key);
              const second = await exchange(again, `${again.path} (after photo)`);
              validations.push({
                at: at(),
                path: `${again.path} (after photo)`,
                readings: again.readings.length,
                scanStatus: second.scanStatus,
                analysisStatus: second.analysisStatus,
                unverified: [],
                score: second.complete && second.reliable ? second.cleanScore : null,
                settleMs: 0,
              });
              if (second.complete && second.reliable) {
                scanning.current = false;
                enter("COMPLETE");
                setHint(MESSAGES.done);
                await new Promise<void>((resolve) => setTimeout(() => resolve(), 800));
                showResult(second, (detail) => note("navigation", detail));
            saveLog("reliable");
                return;
              }
            }
          }
          // Scan complete, analysis blocked. Names OCR visibly misread (not names missing from the
          // dictionary) may read cleanly in another view: keep reading for a while, saying which names and
          // which way to turn; one clean read of them (evidence) lets the analysis score. Otherwise, or once
          // that time is up, the camera's job is done: the product screen shows the list read, without a
          // score, and says why.
          held = result;
          const misread = result.ingredients.filter((i) => i.status === "unknown" && i.ocrSuspect).map((i) => i.text);
          if (misread.length && scanning.current && (improveUntil === null || Date.now() < improveUntil)) {
            if (improveUntil === null) {
              improveUntil = Date.now() + IMPROVE_MS;
              note("improving", misread.join(", "));
            }
            enter("NEED_MORE_VIEW");
            setHint(improveHint(misread));
            continue;
          }
          return endHeld();
        }
        if (!scanning.current) break;

        const level = progressLevel(scan);
        if (level > bestProgress) {
          bestProgress = level;
          lastProgressAt = Date.now();
        }
        const now = Date.now();
        const stalled = now - lastProgressAt;
        const section = lastReading.section;

        // State and hint for what the scan still needs.
        if (improveUntil !== null) {
          // (The hint names the misread names: set when the whole list was checked.)
        } else if (listSeenAt === null) {
          enter("SEARCHING");
          const small = lastReading.lineHeight !== null && lastReading.lineHeight < SMALL_TEXT_PX;
          setHint(small || (now - started > HINT_AFTER_MS && lastReading.rows.length > 3) ? MESSAGES.closer : MESSAGES.show);
        } else if (fewestUnverified !== Infinity) {
          // (Every candidate built so far was sent above. Building them again here, on every frame, rebuilt
          // the list each time: on the phone 2-3 s per frame once a check had failed.)
          enter("NEED_MORE_VIEW");
          // A whole list in one frame with words unreadable at its row boundaries: a clearer view helps;
          // a list rebuilt from several views: more of it has to be seen.
          setHint(scan.wholeReadings.length && stalled > HINT_AFTER_MS ? MESSAGES.closer : stalled > HINT_AFTER_MS ? MESSAGES.wider : MESSAGES.turn);
        } else if (section && !section.whole) {
          enter(scan.frames > 1 ? "MULTI_VIEW_SCANNING" : "READING");
          setHint(section.cropped.length ? MESSAGES.frame : scan.frames > 1 ? (stalled > HINT_AFTER_MS ? MESSAGES.wider : MESSAGES.turn) : MESSAGES.reading);
        } else {
          enter("READING");
          setHint(stalled > HINT_AFTER_MS ? MESSAGES.closer : MESSAGES.reading);
        }

        // Looking for clean reads of misread names: high-resolution photos (small print reads better
        // there), until the time is up; then the whole list held is shown.
        if (improveUntil !== null) {
          if (improvePhotos < IMPROVE_PHOTOS && now - lastPhotoAt > IMPROVE_PHOTO_MS && camera.current) {
            improvePhotos++;
            photos++;
            lastPhotoAt = Date.now();
            note("high-res capture (improving)");
            await take("photo", frames.length - 1);
            if (!scanning.current) break;
          }
          if (Date.now() > improveUntil) return endHeld();
          continue;
        }

        // Time limits. Nothing incomplete is ever shown: running out of time is a failure.
        if (listSeenAt === null && now - started > SEARCH_LIMIT_MS) return finish("no_list", MESSAGES.failed);
        if (listSeenAt !== null && stalled > NO_PROGRESS_MS) return finish("no_progress", MESSAGES.failed);
        if (now - started > MAX_SCAN_MS) return finish("timeout", MESSAGES.failed);
      }
    } catch (err) {
      return finish("error", err instanceof Error ? err.message : MESSAGES.failed);
    }
    // Left the screen.
    saveLog("stopped");
  }

  // Start scanning as soon as the camera is up.
  useEffect(() => {
    if (hasPermission && cameraReady && device && phase === null && !failure) {
      const timer = setTimeout(() => runScan(), 500);
      return () => clearTimeout(timer);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPermission, cameraReady, device, phase, failure]);

  if (!hasPermission) {
    return (
      <View style={[styles.dark, styles.center]}>
        <Ionicons name="camera-outline" size={48} color="#fff" />
        <Text style={styles.centerText}>
          {permissionDenied
            ? "Kamera izni verilmedi. İçerik listesini taramak için ayarlardan kamera iznini açabilirsin."
            : "İçerik listesini taramak için kamera izni gerekli."}
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

  const done = phase === "COMPLETE";
  return (
    <View style={styles.dark}>
      {device && cameraReady && <Camera ref={camera} style={StyleSheet.absoluteFill} device={device} isActive={!failure && !done} photo />}

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <View style={styles.topRow}>
          <BackButton dark onPress={() => navigation.goBack()} />
          <Text style={styles.title}>İçerik listesi tara</Text>
          <View style={styles.topSide} />
        </View>
        <View style={styles.segment}>
          <Pressable style={styles.segmentItem} onPress={() => navigation.replace("Scan")}>
            <Text style={styles.segmentText}>Barkod</Text>
          </Pressable>
          <View style={[styles.segmentItem, styles.segmentOn]}>
            <Text style={[styles.segmentText, styles.segmentTextOn]}>İçerik listesi</Text>
          </View>
        </View>
      </View>

      <View style={styles.frameWrap} pointerEvents="none">
        <View style={styles.frame}>
          <View style={[styles.corner, styles.tl, done && styles.cornerDone]} />
          <View style={[styles.corner, styles.tr, done && styles.cornerDone]} />
          <View style={[styles.corner, styles.bl, done && styles.cornerDone]} />
          <View style={[styles.corner, styles.br, done && styles.cornerDone]} />
        </View>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.status}>
          {!done && phase !== null && <ActivityIndicator color="#fff" />}
          <Text style={styles.hint}>{done ? MESSAGES.done : hint}</Text>
        </View>
        {!done && (
          <Pressable onPress={() => navigation.goBack()}>
            <Text style={styles.link}>Vazgeç</Text>
          </Pressable>
        )}
      </View>

      {failure && (
        <View style={[styles.overlay, styles.center]}>
          <Ionicons name="alert-circle-outline" size={48} color="#fff" />
          <Text style={styles.centerText}>{failure}</Text>
          <Pressable
            style={styles.primary}
            onPress={() => {
              setFailure(null);
              setPhase(null);
            }}
          >
            <Text style={styles.primaryText}>Tekrar tara</Text>
          </Pressable>
          <Pressable onPress={() => navigation.goBack()}>
            <Text style={styles.link}>Geri dön</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const CORNER = 28;
const styles = StyleSheet.create({
  dark: { flex: 1, backgroundColor: colors.scanBg },
  center: { alignItems: "center", justifyContent: "center", gap: 14, padding: 24 },
  centerText: { color: "#fff", fontSize: 16, textAlign: "center", lineHeight: 22 },
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.75)" },
  topBar: { position: "absolute", top: 0, left: 0, right: 0, gap: 12, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: "rgba(30,42,36,0.85)" },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  topSide: { width: 40 },
  segment: { flexDirection: "row", alignSelf: "center", backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 12, padding: 4 },
  segmentItem: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 9 },
  segmentOn: { backgroundColor: "#fff" },
  segmentText: { color: "#fff", fontSize: 14 },
  segmentTextOn: { color: colors.text, fontWeight: "600" },
  title: { color: "#fff", fontSize: 17, fontWeight: "600" },
  frameWrap: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", paddingBottom: 90 },
  frame: { width: "88%", height: "45%" },
  corner: { position: "absolute", width: CORNER, height: CORNER, borderColor: colors.accent },
  cornerDone: { borderColor: "#3DDC84" },
  tl: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 14 },
  tr: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 14 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 14 },
  br: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 14 },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", gap: 10, paddingTop: 18, paddingHorizontal: 20, backgroundColor: "rgba(30,42,36,0.85)" },
  status: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 24 },
  hint: { color: "#fff", fontSize: 15, fontWeight: "600", textAlign: "center", flexShrink: 1 },
  link: { color: "#fff", textDecorationLine: "underline", textAlign: "center" },
  primary: { backgroundColor: colors.accent, borderRadius: 999, paddingVertical: 15, paddingHorizontal: 28, alignItems: "center" },
  primaryText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
