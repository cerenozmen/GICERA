import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { Alert, StyleSheet, Text } from "react-native";
import { useAuth } from "../AuthContext";
import { PrimaryButton } from "../components/common";
import { Field, FormMessage, FormPage } from "../components/Field";
import { PASSWORD_RULE, passwordProblem, REQUIRED } from "../formRules";
import { RootStackParamList } from "../navigation/types";
import { colors } from "../theme";
import { useSubmit } from "../useSubmit";

/** Where the e-mailed "şifreni yenile" link lands: pick a new password, then you're signed in. */
export function ResetPasswordScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, "ResetPassword">) {
  const { accessToken, refreshToken, failed } = route.params;
  const { resetPassword } = useAuth();
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [errors, setErrors] = useState<{ password?: string; again?: string }>({});
  const form = useSubmit();

  function leave() {
    navigation.reset({ index: 0, routes: [{ name: "Welcome" }] });
  }

  if (failed || !accessToken || !refreshToken) {
    return (
      <FormPage title="Şifreni yenile" onBack={leave}>
        <FormMessage text="Bağlantının süresi dolmuş veya daha önce kullanılmış. Yeni bir bağlantı isteyebilirsin." />
        <PrimaryButton label="Yeni bağlantı iste" onPress={() => navigation.replace("ForgotPassword")} />
      </FormPage>
    );
  }

  function save() {
    const found: { password?: string; again?: string } = {};
    if (!password) found.password = REQUIRED;
    else if (passwordProblem(password)) found.password = passwordProblem(password)!;
    if (!again) found.again = REQUIRED;
    else if (again !== password) found.again = "Şifreler aynı değil.";
    setErrors(found);
    if (found.password || found.again) return;

    form.run(async () => {
      await resetPassword(accessToken!, refreshToken!, password);
      Alert.alert("Şifren oluşturuldu", "Yeni şifren başarıyla oluşturuldu. Uygulamaya giriş yapılıyor…", [
        { text: "Tamam", onPress: () => navigation.reset({ index: 0, routes: [{ name: "Main" }] }) },
      ]);
    });
  }

  return (
    <FormPage title="Şifreni yenile" onBack={leave}>
      <Text style={styles.text}>Hesabın için yeni bir şifre belirle.</Text>
      <Field
        label="Yeni şifre"
        value={password}
        onChangeText={(text) => {
          setPassword(text);
          setErrors((e) => ({ ...e, password: undefined }));
        }}
        secure
        autoComplete="new-password"
        textContentType="newPassword"
        hint={PASSWORD_RULE}
        error={errors.password}
      />
      <Field
        label="Yeni şifre (tekrar)"
        value={again}
        onChangeText={(text) => {
          setAgain(text);
          setErrors((e) => ({ ...e, again: undefined }));
        }}
        secure
        autoComplete="new-password"
        textContentType="newPassword"
        error={errors.again}
      />
      <FormMessage text={form.error} />
      <PrimaryButton label={form.busy ? "Kaydediliyor…" : "Şifreyi güncelle"} onPress={save} disabled={form.busy} />
    </FormPage>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 14.5, color: colors.muted, lineHeight: 21 },
});
