import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { analyzeIngredientsText, extractIngredientsFromImage } from "../api";
import { ScreenHeader } from "../components/common";
import { RootStackParamList } from "../navigation/types";
import { colors } from "../theme";

type Step = "capture" | "reading" | "edit" | "analyzing";

export function IngredientScanScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, "IngredientScan">) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [step, setStep] = useState<Step>("capture");
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function takePhoto() {
    if (!camera.current) return;
    setMessage(null);
    setStep("reading");
    try {
      const photo = await camera.current.takePictureAsync({ base64: true, quality: 0.5 });
      if (!photo.base64) throw new Error("Fotoğraf alınamadı.");
      const extracted = await extractIngredientsFromImage(photo.base64);
      if (extracted === null) {
        setMessage("Fotoğrafta okunabilir bir içerik listesi bulunamadı. Listeyi daha yakından ve net çekmeyi dene.");
        setStep("capture");
        return;
      }
      setText(extracted);
      setStep("edit");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Bir hata oluştu.");
      setStep("capture");
    }
  }

  async function analyze() {
    setMessage(null);
    setStep("analyzing");
    try {
      const result = await analyzeIngredientsText(text.trim());
      navigation.replace("ProductDetail", {
        barcode: `custom:${Date.now()}`,
        product: {
          barcode: "",
          productName: route.params?.productName ?? "Kendi taramam",
          brands: null,
          ingredientsText: result.ingredientsText,
          imageUrl: null,
          cleanScore: result.cleanScore,
          cleanRating: result.cleanRating,
          pregnancySafe: result.pregnancySafe,
          flaggedIngredients: result.flaggedIngredients,
        },
      });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Analiz yapılamadı.");
      setStep("edit");
    }
  }

  if (step === "edit" || step === "analyzing") {
    return (
      <KeyboardAvoidingView style={styles.light} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScreenHeader title="İçerik Listesi" onBack={() => setStep("capture")} />
        <ScrollView contentContainerStyle={styles.editContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.note}>
            Okunan metni kontrol et. Yanlış okunan bir madde analizi etkiler, gerekirse düzeltebilirsin.
          </Text>
          <TextInput
            style={styles.textArea}
            multiline
            value={text}
            onChangeText={setText}
            placeholder="Aqua, Glycerin, ..."
            placeholderTextColor={colors.muted}
            textAlignVertical="top"
            editable={step === "edit"}
          />
          {message && <Text style={styles.error}>{message}</Text>}
          <Pressable
            style={[styles.primary, (step === "analyzing" || text.trim().length < 3) && { opacity: 0.5 }]}
            disabled={step === "analyzing" || text.trim().length < 3}
            onPress={analyze}
          >
            {step === "analyzing" ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Analiz et</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  if (!permission) return <View style={styles.dark} />;

  if (!permission.granted) {
    return (
      <View style={[styles.dark, styles.center]}>
        <Ionicons name="camera-outline" size={48} color="#fff" />
        <Text style={styles.centerText}>İçerik listesini fotoğraflamak için kamera izni gerekli.</Text>
        <Pressable style={styles.primary} onPress={requestPermission}>
          <Text style={styles.primaryText}>İzin ver</Text>
        </Pressable>
        <Pressable onPress={() => setStep("edit")}>
          <Text style={styles.link}>Metni elle gir</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.dark}>
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" />

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={28} color="#fff" />
        </Pressable>
        <Text style={styles.title}>İçerik Listesini Tara</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.frameWrap} pointerEvents="none">
        <View style={styles.frame} />
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 20 }]}>
        {step === "reading" ? (
          <>
            <ActivityIndicator color="#fff" />
            <Text style={styles.hint}>İçerik listesi okunuyor...</Text>
          </>
        ) : (
          <>
            <Text style={styles.hint}>{message ?? "Ambalajdaki içerik (Ingredients) listesini çerçeveye al"}</Text>
            <Pressable style={styles.shutter} onPress={takePhoto}>
              <View style={styles.shutterInner} />
            </Pressable>
            <Pressable onPress={() => setStep("edit")}>
              <Text style={styles.link}>Metni elle gir</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  light: { flex: 1, backgroundColor: colors.bg },
  dark: { flex: 1, backgroundColor: "#111" },
  center: { alignItems: "center", justifyContent: "center", gap: 14, padding: 24 },
  centerText: { color: "#fff", fontSize: 16, textAlign: "center" },
  topBar: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, backgroundColor: "rgba(0,0,0,0.35)" },
  title: { color: "#fff", fontSize: 17, fontWeight: "600" },
  frameWrap: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  frame: { width: "88%", height: 260, borderColor: "#fff", borderWidth: 3, borderRadius: 18, opacity: 0.85 },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", gap: 14, paddingTop: 18, paddingHorizontal: 20, backgroundColor: "rgba(0,0,0,0.5)" },
  hint: { color: "#fff", fontSize: 14, textAlign: "center" },
  link: { color: "#fff", textDecorationLine: "underline", textAlign: "center" },
  shutter: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: "#fff", alignItems: "center", justifyContent: "center" },
  shutterInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: "#fff" },
  editContent: { padding: 20, gap: 14 },
  note: { color: colors.muted, lineHeight: 20 },
  textArea: { minHeight: 220, backgroundColor: colors.card, borderRadius: 16, padding: 14, fontSize: 15, color: colors.text },
  error: { color: colors.danger },
  primary: { backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 15, paddingHorizontal: 28, alignItems: "center" },
  primaryText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
