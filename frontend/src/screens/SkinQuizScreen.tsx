import { Ionicons } from "@react-native-vector-icons/ionicons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ReactNode, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../AppContext";
import { useAuth } from "../AuthContext";
import { BackButton, Chip, PrimaryButton } from "../components/common";
import { RootStackParamList } from "../navigation/types";
import { EMPTY_PROFILE, SkinProfile } from "../storage";
import { colors, serif } from "../theme";

export const SKIN_TYPES = [
  { label: "Kuru", text: "Gergin, yer yer pul pul" },
  { label: "Yağlı", text: "Parlak, gözenekler belirgin" },
  { label: "Karma", text: "T bölgesi yağlı, yanaklar kuru" },
  { label: "Normal", text: "Dengeli ve rahat" },
  { label: "Hassas", text: "Kızarıklık, yanma ya da kaşıntıya yatkın" },
];
const CONCERNS = ["Akne ve sivilce", "Leke ve ton eşitsizliği", "Kuruluk", "Kızarıklık", "Belirgin gözenek", "İnce çizgiler", "Göz altı", "Matlık", "Yağlanma"];
const MAX_CONCERNS = 3;
const FREQUENCY = ["Sık sık", "Bazen", "Nadiren", "Hiç"];
const YES_NO_UNSURE = ["Evet", "Hayır", "Bilmiyorum"];
const AGES = ["18 altı", "18-24", "25-34", "35-44", "45+"];
const ROUTINE = ["Minimal", "Orta", "Kapsamlı"];
const YES_NO_PRIVATE = ["Evet", "Hayır", "Belirtmek istemiyorum"];
const STEPS = 6;

export function SkinQuizScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, "SkinQuiz">) {
  const insets = useSafeAreaInsets();
  const { skinProfile, saveSkinProfile, updateSettings } = useApp();
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [p, setP] = useState<SkinProfile>(skinProfile ?? EMPTY_PROFILE);
  const [whyOpen, setWhyOpen] = useState(false);
  const set = (patch: Partial<SkinProfile>) => setP((current) => ({ ...current, ...patch }));

  const canContinue =
    (step === 1 && !!p.skinType) ||
    (step === 2 && p.concerns.length > 0) ||
    (step === 3 && !!p.reactionFrequency && !!p.sunBurns) ||
    (step === 4 && !!p.ageRange && !!p.routineLevel) ||
    (step === 5 && !!p.pregnant && !!p.skinCondition) ||
    step === 6;

  function back() {
    if (step > 1) setStep(step - 1);
    else if (navigation.canGoBack()) navigation.goBack();
    else navigation.replace("Main");
  }

  function next() {
    if (step < STEPS) {
      setStep(step + 1);
      return;
    }
    saveSkinProfile(p);
    if (p.pregnant === "Evet" || p.pregnant === "Hayır") updateSettings({ pregnancyMode: p.pregnant === "Evet" });
    if (route.params?.edit) navigation.goBack();
    // Sign-in comes last, after the profile (skipped when already signed in).
    else navigation.reset({ index: 0, routes: [{ name: user ? "Main" : "Auth" }] });
  }

  function toggleConcern(c: string) {
    if (p.concerns.includes(c)) set({ concerns: p.concerns.filter((x) => x !== c) });
    else if (p.concerns.length < MAX_CONCERNS) set({ concerns: [...p.concerns, c] });
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.top}>
        <BackButton onPress={back} />
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={styles.counter}>{`${step} / ${STEPS}`}</Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${(step / STEPS) * 100}%` }]} />
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {step === 1 && (
          <Section title="Cilt tipini öğrenelim" sub="Cildinin genel durumunu en iyi tanıtan seçeneği seç.">
            <View style={{ gap: 10 }}>
              {SKIN_TYPES.map((t) => {
                const on = p.skinType === t.label;
                return (
                  <Pressable key={t.label} style={[styles.option, on && styles.optionOn]} onPress={() => set({ skinType: t.label })}>
                    <View style={styles.drop}>
                      <Ionicons name="water-outline" size={18} color={colors.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.optionTitle}>{t.label}</Text>
                      <Text style={styles.optionText}>{t.text}</Text>
                    </View>
                    {on && (
                      <View style={styles.tick}>
                        <Ionicons name="checkmark" size={14} color="#fff" />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </Section>
        )}

        {step === 2 && (
          <Section title="Odak konuların neler?" sub={`En fazla ${MAX_CONCERNS} konu seç. Rutinini bunlara göre önceliklendireceğiz.`}>
            <View style={styles.wrap}>
              {CONCERNS.map((c) => (
                <Chip key={c} label={c} check active={p.concerns.includes(c)} onPress={() => toggleConcern(c)} />
              ))}
            </View>
            <Info text="Seçtiğin konulara göre sana en uygun içerik ve rutin önerileri sunacağız." />
          </Section>
        )}

        {step === 3 && (
          <Section title="Hassasiyet ve tepkiler" sub="Yeni bir ürün denediğinde ne sıklıkla kızarıklık, yanma veya kaşıntı yaşarsın?">
            <Choices options={FREQUENCY} value={p.reactionFrequency} onChange={(v) => set({ reactionFrequency: v })} />
            <View style={styles.sep} />
            <Text style={styles.question}>Güneşte kolay kızarır mısın?</Text>
            <Choices options={YES_NO_UNSURE} value={p.sunBurns} onChange={(v) => set({ sunBurns: v })} outline />
            <Info text={'Bu bilgiler, sana uygun içerikleri önerirken bazı ürünleri "Dikkat" olarak işaretlememize yardımcı olur.'} />
          </Section>
        )}

        {step === 4 && (
          <Section title="Sen ve rutinin" sub="Yaşın ve bakım alışkanlıkların, önerileri sana göre ayarlamamızı sağlar.">
            <Text style={styles.question}>Yaş aralığın</Text>
            <Choices options={AGES} value={p.ageRange} onChange={(v) => set({ ageRange: v })} />
            <View style={styles.sep} />
            <Text style={styles.question}>Bakım rutinin ne kadar kapsamlı?</Text>
            <Choices options={ROUTINE} value={p.routineLevel} onChange={(v) => set({ routineLevel: v })} outline />
          </Section>
        )}

        {step === 5 && (
          <Section title="Sağlık ve güvenlik" sub="Bu bilgiler, sana güvenli ve uygun içerikler önerebilmemiz için önemlidir.">
            <Text style={styles.question}>Hamile misin ya da emziriyor musun?</Text>
            <Choices options={YES_NO_PRIVATE} value={p.pregnant} onChange={(v) => set({ pregnant: v })} outline />
            <Text style={[styles.question, { marginTop: 18 }]}>Egzama, rozasea gibi teşhis konmuş bir cilt rahatsızlığın var mı?</Text>
            <Choices options={YES_NO_PRIVATE} value={p.skinCondition} onChange={(v) => set({ skinCondition: v })} outline />
            <Pressable style={styles.why} onPress={() => setWhyOpen((o) => !o)}>
              <View style={styles.whyRow}>
                <Ionicons name="information-circle-outline" size={20} color={colors.text} />
                <Text style={styles.whyTitle}>Bu soruları neden soruyoruz?</Text>
                <Ionicons name={whyOpen ? "chevron-up" : "chevron-down"} size={18} color={colors.text} />
              </View>
              {whyOpen && (
                <Text style={styles.whyText}>
                  Bazı içerikler hamilelikte ya da hassas, teşhisli ciltlerde önerilmez. Cevapların yalnızca bu cihazda saklanır ve ürünleri değerlendirirken
                  dikkat uyarılarını ayarlamak için kullanılır. Bu bilgiler tıbbi tavsiyenin yerine geçmez.
                </Text>
              )}
            </Pressable>
          </Section>
        )}

        {step === 6 && (
          <Section title="Cilt profilin hazır" sub="Önerilerini bu bilgilere göre hazırlayacağız. İstediğin zaman Profilim'den güncelleyebilirsin.">
            <View style={styles.summary}>
              <SummaryRow label="Cilt tipi" value={p.skinType} />
              <SummaryRow label="Odak konuları" value={p.concerns.join(", ")} />
              <SummaryRow label="Tepki sıklığı" value={p.reactionFrequency} />
              <SummaryRow label="Güneşte kızarma" value={p.sunBurns} />
              <SummaryRow label="Yaş aralığı" value={p.ageRange} />
              <SummaryRow label="Rutin" value={p.routineLevel} />
              <SummaryRow label="Hamilelik / emzirme" value={p.pregnant} last />
            </View>
          </Section>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <PrimaryButton label={step === STEPS ? "Profili Kaydet" : "Devam Et"} arrow disabled={!canContinue} onPress={next} />
      </View>
    </View>
  );
}

function Section({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.sub}>{sub}</Text>
      {children}
    </View>
  );
}

function Choices({ options, value, onChange, outline }: { options: string[]; value: string | null; onChange: (v: string) => void; outline?: boolean }) {
  return (
    <View style={styles.wrap}>
      {options.map((o) => {
        const on = value === o;
        if (!outline) return <Chip key={o} label={o} check active={on} onPress={() => onChange(o)} />;
        return (
          <Pressable key={o} style={[styles.outline, on && styles.outlineOn]} onPress={() => onChange(o)}>
            <Text style={[styles.outlineText, on && { fontWeight: "600" }]}>{o}</Text>
            {on && (
              <View style={styles.tick}>
                <Ionicons name="checkmark" size={12} color="#fff" />
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

function Info({ text }: { text: string }) {
  return (
    <View style={styles.info}>
      <Ionicons name="information-circle-outline" size={22} color={colors.accent} />
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

function SummaryRow({ label, value, last }: { label: string; value: string | null; last?: boolean }) {
  return (
    <View style={[styles.summaryRow, !last && styles.summaryDivider]}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value || "-"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingBottom: 8 },
  counter: { fontSize: 12, color: colors.muted },
  track: { height: 4, borderRadius: 2, backgroundColor: "#E7E1D8" },
  fill: { height: 4, borderRadius: 2, backgroundColor: colors.primary },
  content: { padding: 20, paddingTop: 16 },
  title: { fontFamily: serif, fontSize: 28, color: colors.text },
  sub: { fontSize: 14, color: colors.muted, lineHeight: 20, marginTop: 8, marginBottom: 22 },
  option: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14 },
  optionOn: { borderColor: colors.primary, borderWidth: 1.5, backgroundColor: "#F3F6F1" },
  drop: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accentLight, alignItems: "center", justifyContent: "center" },
  optionTitle: { fontSize: 15, fontWeight: "600", color: colors.text },
  optionText: { fontSize: 12, color: colors.muted, marginTop: 2 },
  tick: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  sep: { height: 1, backgroundColor: colors.border, marginVertical: 22 },
  question: { fontSize: 15, color: colors.text, marginBottom: 12, lineHeight: 21 },
  outline: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 11 },
  outlineOn: { borderColor: colors.primary, borderWidth: 1.5, backgroundColor: "#F3F6F1" },
  outlineText: { fontSize: 14, color: colors.text },
  info: { flexDirection: "row", gap: 10, backgroundColor: colors.accentLight, borderRadius: 16, padding: 14, marginTop: 24, alignItems: "flex-start" },
  infoText: { flex: 1, fontSize: 13, lineHeight: 19, color: colors.text },
  why: { backgroundColor: "#F1ECE5", borderRadius: 16, padding: 14, marginTop: 24, gap: 10 },
  whyRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  whyTitle: { flex: 1, fontSize: 14, color: colors.text },
  whyText: { fontSize: 13, lineHeight: 19, color: colors.muted },
  summary: { backgroundColor: colors.card, borderRadius: 18, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.border },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 13 },
  summaryDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  summaryLabel: { color: colors.muted, fontSize: 14 },
  summaryValue: { flex: 1, textAlign: "right", color: colors.text, fontSize: 14, fontWeight: "500" },
  footer: { paddingHorizontal: 20, paddingTop: 8 },
});
