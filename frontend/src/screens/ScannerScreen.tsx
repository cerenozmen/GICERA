import { CameraView, useCameraPermissions } from "expo-camera";
import { useState } from "react";
import { Button, StyleSheet, Text, TextInput, View } from "react-native";

interface Props {
  busy: boolean;
  error: string | null;
  onScanned: (barcode: string) => void;
}

export function ScannerScreen({ busy, error, onScanned }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [manualCode, setManualCode] = useState("");

  if (!permission) return <View style={styles.center} />;

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>Barkod okutmak için kamera izni gerekli.</Text>
        <Button title="İzin ver" onPress={requestPermission} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"] }}
        onBarcodeScanned={busy ? undefined : ({ data }) => onScanned(data)}
      />
      <View style={styles.banner}>
        <Text style={styles.bannerText}>{busy ? "Ürün aranıyor..." : "Ürün barkodunu kameraya gösterin"}</Text>
        {error && <Text style={styles.error}>{error}</Text>}
        <View style={styles.manualRow}>
          <TextInput
            style={styles.input}
            placeholder="Barkodu elle girin"
            placeholderTextColor="#aaa"
            keyboardType="number-pad"
            value={manualCode}
            onChangeText={setManualCode}
          />
          <Button title="Ara" disabled={busy || manualCode.trim().length < 8} onPress={() => onScanned(manualCode.trim())} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  text: { fontSize: 16, textAlign: "center" },
  banner: { position: "absolute", bottom: 48, left: 16, right: 16, backgroundColor: "rgba(0,0,0,0.7)", borderRadius: 12, padding: 16 },
  bannerText: { color: "#fff", fontSize: 16, textAlign: "center" },
  manualRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  input: { flex: 1, backgroundColor: "#222", color: "#fff", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  error: { color: "#ff8a80", marginTop: 8, textAlign: "center" },
});
