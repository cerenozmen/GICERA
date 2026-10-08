import { Ionicons } from "@react-native-vector-icons/ionicons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Camera } from "react-native-camera-kit";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCameraPermission } from "react-native-vision-camera";
import { lookupBarcode } from "../api";
import { useApp } from "../AppContext";
import { BackButton } from "../components/common";
import { RootStackParamList } from "../navigation/types";
import { colors } from "../theme";

export function ScanScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "Scan">) {
  const insets = useSafeAreaInsets();
  const { recordScan } = useApp();
  const { hasPermission, requestPermission } = useCameraPermission();
  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const lastCode = useRef<string | null>(null);

  async function handleCode(code: string) {
    if (busy || code === lastCode.current) return;
    lastCode.current = code;
    setBusy(true);
    setMessage(null);
    try {
      const result = await lookupBarcode(code);
      if (result.found) {
        recordScan(result.product);
        navigation.replace("ProductDetail", { barcode: code, product: result.product });
        return;
      }
      navigation.replace("ProductNotFound", { barcode: code });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Bağlantı hatası");
    } finally {
      setBusy(false);
      setTimeout(() => {
        lastCode.current = null;
      }, 2500);
    }
  }

  if (!hasPermission) {
    return (
      <View style={[styles.dark, styles.center]}>
        <Ionicons name="camera-outline" size={48} color="#fff" />
        <Text style={styles.permissionText}>Barkod okutmak için kamera izni gerekli.</Text>
        <Pressable style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>İzin ver</Text>
        </Pressable>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.link}>Geri dön</Text>
        </Pressable>
      </View>
    );
  }

  const manualValid = manualCode.trim().length >= 8;

  return (
    <KeyboardAvoidingView style={styles.dark} behavior="padding">
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <BackButton dark onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Barkod tara</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.segment}>
        <View style={[styles.segmentItem, styles.segmentOn]}>
          <Text style={[styles.segmentText, styles.segmentTextOn]}>Barkod</Text>
        </View>
        <Pressable style={styles.segmentItem} onPress={() => navigation.replace("IngredientScan")}>
          <Text style={styles.segmentText}>İçerik listesi</Text>
        </Pressable>
      </View>

      <View style={styles.viewer}>
        <Camera
          style={StyleSheet.absoluteFill}
          torchMode={torch ? "on" : "off"}
          scanBarcode
          allowedBarcodeTypes={["ean-13", "ean-8", "upc-a", "upc-e", "code-128"]}
          onReadCode={(event) => {
            console.log("[ScanScreen] onReadCode", event.nativeEvent);
            handleCode(event.nativeEvent.codeStringValue);
          }}
          onError={(event) => console.log("[ScanScreen] camera error", event.nativeEvent)}
        />
        <View style={styles.frameWrap} pointerEvents="none">
          <View style={styles.frame}>
            <View style={[styles.corner, styles.tl]} />
            <View style={[styles.corner, styles.tr]} />
            <View style={[styles.corner, styles.bl]} />
            <View style={[styles.corner, styles.br]} />
            <View style={styles.scanLine} />
          </View>
        </View>
        <View style={styles.viewerBottom}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.hint}>{message ?? "Barkodu çerçeveye hizala, otomatik taranacaktır."}</Text>}
          <Pressable style={styles.torchPill} onPress={() => setTorch((t) => !t)}>
            <Ionicons name={torch ? "flash" : "flash-outline"} size={14} color={colors.accent} />
            <Text style={styles.torchText}>{torch ? "Işığı kapat" : "Işığı aç"}</Text>
          </Pressable>
        </View>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
        {manualOpen && (
          <View style={styles.manualRow}>
            <TextInput
              style={styles.input}
              placeholder="Barkod numarası"
              placeholderTextColor="#aaa"
              keyboardType="number-pad"
              autoFocus
              value={manualCode}
              onChangeText={setManualCode}
              onSubmitEditing={() => manualValid && handleCode(manualCode.trim())}
            />
            <Pressable style={[styles.go, !manualValid && { opacity: 0.4 }]} disabled={!manualValid} onPress={() => handleCode(manualCode.trim())}>
              <Text style={styles.goText}>Ara</Text>
            </Pressable>
          </View>
        )}
        <View style={styles.actions}>
          <Pressable style={styles.sideButton} onPress={() => setManualOpen((o) => !o)} accessibilityLabel="Barkodu elle gir">
            <Ionicons name="keypad-outline" size={22} color="#fff" />
          </Pressable>
          {/* Barcodes are read automatically: the ring only shows that a lookup is running. */}
          <View style={styles.shutter}>{busy ? <ActivityIndicator color={colors.accent} /> : <View style={styles.shutterInner} />}</View>
          <Pressable style={styles.sideButton} onPress={() => setTorch((t) => !t)} accessibilityLabel="Işık">
            <Ionicons name={torch ? "flash" : "flash-outline"} size={22} color="#fff" />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const CORNER = 30;
const styles = StyleSheet.create({
  dark: { flex: 1, backgroundColor: colors.scanBg },
  center: { alignItems: "center", justifyContent: "center", gap: 14, padding: 24 },
  permissionText: { color: "#fff", fontSize: 16, textAlign: "center" },
  permissionButton: { backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 28, paddingVertical: 12 },
  permissionButtonText: { color: "#fff", fontWeight: "600" },
  link: { color: "#fff", textDecorationLine: "underline", textAlign: "center" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12 },
  title: { color: "#fff", fontSize: 17, fontWeight: "600" },
  segment: { flexDirection: "row", alignSelf: "center", backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 12, padding: 4, marginBottom: 14 },
  segmentItem: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 9 },
  segmentOn: { backgroundColor: "#fff" },
  segmentText: { color: "#fff", fontSize: 14 },
  segmentTextOn: { color: colors.text, fontWeight: "600" },
  viewer: { flex: 1, marginHorizontal: 16, borderRadius: 24, overflow: "hidden", backgroundColor: "#26332C" },
  frameWrap: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", paddingBottom: 90 },
  frame: { width: "80%", height: 180, justifyContent: "center" },
  corner: { position: "absolute", width: CORNER, height: CORNER, borderColor: colors.accent },
  tl: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 16 },
  tr: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 16 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 16 },
  br: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 16 },
  scanLine: { height: 2, marginHorizontal: 12, backgroundColor: colors.accent, opacity: 0.8 },
  viewerBottom: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", gap: 12, paddingVertical: 18, paddingHorizontal: 20, backgroundColor: "rgba(20,30,25,0.55)" },
  hint: { color: "#fff", fontSize: 14, textAlign: "center" },
  torchPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  torchText: { color: "#fff", fontSize: 13 },
  bottom: { paddingTop: 18, paddingHorizontal: 24, gap: 14 },
  actions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sideButton: { width: 46, height: 46, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  shutter: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: colors.accent, alignItems: "center", justifyContent: "center" },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: "#fff" },
  manualRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  input: { flex: 1, backgroundColor: "rgba(255,255,255,0.12)", color: "#fff", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  go: { backgroundColor: colors.accent, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 11 },
  goText: { color: "#fff", fontWeight: "600" },
});
