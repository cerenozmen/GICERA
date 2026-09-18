import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { lookupBarcode } from "../api";
import { useApp } from "../AppContext";
import { RootStackParamList } from "../navigation/types";
import { colors } from "../theme";

export function ScanScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "Scan">) {
  const insets = useSafeAreaInsets();
  const { recordScan } = useApp();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const lastCode = useRef<string | null>(null);

  async function handleCode(code: string) {
    if (busy || code === lastCode.current) return;
    lastCode.current = code;
    setBusy(true);
    setMessage(null);
    setNotFound(false);
    try {
      const result = await lookupBarcode(code);
      if (result.found) {
        recordScan(result.product);
        navigation.replace("ProductDetail", { barcode: code, product: result.product });
        return;
      }
      setMessage("Bu ürün henüz veritabanımızda yok.");
      setNotFound(true);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Bağlantı hatası");
    } finally {
      setBusy(false);
      setTimeout(() => {
        lastCode.current = null;
      }, 2500);
    }
  }

  if (!permission) return <View style={styles.dark} />;

  if (!permission.granted) {
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

  return (
    <View style={styles.dark}>
      <CameraView
        style={StyleSheet.absoluteFill}
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"] }}
        onBarcodeScanned={({ data }) => handleCode(data)}
      />

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={28} color="#fff" />
        </Pressable>
        <Text style={styles.title}>Barkod Tara</Text>
        <Pressable onPress={() => setTorch((t) => !t)} hitSlop={12}>
          <Ionicons name={torch ? "flash" : "flash-outline"} size={26} color="#fff" />
        </Pressable>
      </View>

      <View style={styles.frameWrap} pointerEvents="none">
        <View style={styles.frame}>
          <View style={[styles.corner, styles.tl]} />
          <View style={[styles.corner, styles.tr]} />
          <View style={[styles.corner, styles.bl]} />
          <View style={[styles.corner, styles.br]} />
          <View style={styles.scanLine} />
        </View>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 20 }]}>
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.hint}>{message ?? "Barkodu ürünün üzerine hizala"}</Text>
        )}
        {notFound && (
          <Pressable style={styles.go} onPress={() => navigation.replace("IngredientScan")}>
            <Text style={styles.goText}>İçerik listesini fotoğrafla</Text>
          </Pressable>
        )}
        {manualOpen ? (
          <View style={styles.manualRow}>
            <TextInput
              style={styles.input}
              placeholder="Barkod numarası"
              placeholderTextColor="#aaa"
              keyboardType="number-pad"
              value={manualCode}
              onChangeText={setManualCode}
            />
            <Pressable
              style={[styles.go, manualCode.trim().length < 8 && { opacity: 0.4 }]}
              disabled={manualCode.trim().length < 8}
              onPress={() => handleCode(manualCode.trim())}
            >
              <Text style={styles.goText}>Ara</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => setManualOpen(true)}>
            <Text style={styles.link}>Barkodu elle gir</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const CORNER = 28;
const styles = StyleSheet.create({
  dark: { flex: 1, backgroundColor: "#111" },
  center: { alignItems: "center", justifyContent: "center", gap: 14, padding: 24 },
  permissionText: { color: "#fff", fontSize: 16, textAlign: "center" },
  permissionButton: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 28, paddingVertical: 12 },
  permissionButtonText: { color: "#fff", fontWeight: "600" },
  link: { color: "#fff", textDecorationLine: "underline", textAlign: "center" },
  topBar: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, backgroundColor: "rgba(0,0,0,0.35)" },
  title: { color: "#fff", fontSize: 17, fontWeight: "600" },
  frameWrap: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  frame: { width: "78%", height: 200, justifyContent: "center" },
  corner: { position: "absolute", width: CORNER, height: CORNER, borderColor: "#fff" },
  tl: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 14 },
  tr: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 14 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 14 },
  br: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 14 },
  scanLine: { height: 2, backgroundColor: "#3DDC84" },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", gap: 14, paddingTop: 20, paddingHorizontal: 20, backgroundColor: "rgba(0,0,0,0.45)" },
  hint: { color: "#fff", fontSize: 15, textAlign: "center" },
  manualRow: { flexDirection: "row", gap: 10, alignItems: "center", width: "100%" },
  input: { flex: 1, backgroundColor: "rgba(255,255,255,0.15)", color: "#fff", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  go: { backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 11 },
  goText: { color: "#fff", fontWeight: "600" },
});
