import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { Alert } from "react-native";
import { useAuth } from "../AuthContext";
import { PrimaryButton } from "../components/common";
import { Field, FormMessage, FormPage } from "../components/Field";
import { PASSWORD_RULE, passwordProblem, REQUIRED } from "../formRules";
import { RootStackParamList } from "../navigation/types";
import { useSubmit } from "../useSubmit";

export function ChangePasswordScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "ChangePassword">) {
  const { changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [errors, setErrors] = useState<{ current?: string; next?: string }>({});
  const form = useSubmit();

  function save() {
    const found: { current?: string; next?: string } = {};
    if (!currentPassword) found.current = REQUIRED;
    if (!newPassword) found.next = REQUIRED;
    else if (passwordProblem(newPassword)) found.next = passwordProblem(newPassword)!;
    else if (newPassword === currentPassword) found.next = "Yeni şifre mevcut şifreyle aynı olamaz.";
    setErrors(found);
    if (found.current || found.next) return;

    form.run(async () => {
      await changePassword(currentPassword, newPassword);
      Alert.alert("Şifren değişti", "Yeni şifreni bir sonraki girişinde kullanabilirsin.", [{ text: "Tamam", onPress: () => navigation.goBack() }]);
    });
  }

  return (
    <FormPage title="Parola değiştir" onBack={() => navigation.goBack()}>
      <Field
        label="Mevcut parola"
        value={currentPassword}
        onChangeText={(text) => {
          setCurrentPassword(text);
          setErrors((e) => ({ ...e, current: undefined }));
        }}
        secure
        autoComplete="current-password"
        textContentType="password"
        error={errors.current}
      />
      <Field
        label="Yeni şifre"
        value={newPassword}
        onChangeText={(text) => {
          setNewPassword(text);
          setErrors((e) => ({ ...e, next: undefined }));
        }}
        secure
        autoComplete="new-password"
        textContentType="newPassword"
        hint={PASSWORD_RULE}
        error={errors.next}
      />
      <FormMessage text={form.error} />
      <PrimaryButton label={form.busy ? "Kaydediliyor…" : "Kaydet"} onPress={save} disabled={form.busy} />
    </FormPage>
  );
}
