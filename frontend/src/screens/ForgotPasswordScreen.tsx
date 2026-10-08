import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { authApi } from "../authApi";
import { PrimaryButton } from "../components/common";
import { Field, FormMessage, FormPage } from "../components/Field";
import { isEmail } from "../formRules";
import { RootStackParamList } from "../navigation/types";
import { colors } from "../theme";
import { useSubmit } from "../useSubmit";

/** Forgotten password: type the e-mail, get a link that opens the app on the new-password screen. */
export function ForgotPasswordScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, "ForgotPassword">) {
  const [email, setEmail] = useState(route.params?.email ?? "");
  const [sent, setSent] = useState(false);
  const form = useSubmit();

  function sendLink() {
    form.run(async () => {
      if (!isEmail(email)) throw new Error("Geçerli bir e-posta adresi gir.");
      await authApi.forgot(email.trim().toLowerCase());
      setSent(true);
    });
  }

  return (
    <FormPage title="Şifremi unuttum" onBack={() => navigation.goBack()}>
      <Text style={styles.text}>Hesabına bağlı e-posta adresini yaz, sana şifreni yenilemen için bir bağlantı gönderelim.</Text>
      <Field
        label="E-posta"
        value={email}
        onChangeText={(text) => {
          setEmail(text);
          setSent(false);
        }}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
      />
      {sent && (
        <FormMessage
          tone="info"
          text={`Bu adres bir hesaba bağlıysa ${email.trim()} adresine şifre yenileme bağlantısı gönderdik. Gelen kutunu ve gereksiz klasörünü kontrol et; bağlantıya telefonundan dokun.`}
        />
      )}
      <FormMessage text={form.error} />
      <PrimaryButton label={form.busy ? "Gönderiliyor…" : sent ? "Bağlantıyı tekrar gönder" : "Bağlantı gönder"} onPress={sendLink} disabled={form.busy} />
      <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
        <Text style={styles.back}>Giriş ekranına dön</Text>
      </Pressable>
    </FormPage>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 14.5, color: colors.muted, lineHeight: 21 },
  back: { textAlign: "center", fontSize: 14, color: colors.primary, textDecorationLine: "underline" },
});
