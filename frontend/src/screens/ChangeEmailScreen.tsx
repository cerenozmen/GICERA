import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { Alert } from "react-native";
import { useAuth } from "../AuthContext";
import { PrimaryButton } from "../components/common";
import { Field, FormMessage, FormPage, StaticField } from "../components/Field";
import { isEmail, REQUIRED } from "../formRules";
import { RootStackParamList } from "../navigation/types";
import { useSubmit } from "../useSubmit";

/** E-posta değiştir: needs the current password; the new address is confirmed from its mailbox before it takes over. */
export function ChangeEmailScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "ChangeEmail">) {
  const { user, changeEmail } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [errors, setErrors] = useState<{ current?: string; next?: string }>({});
  const form = useSubmit();

  function save() {
    const found: { current?: string; next?: string } = {};
    if (!currentPassword) found.current = REQUIRED;
    if (!newEmail.trim()) found.next = REQUIRED;
    else if (!isEmail(newEmail)) found.next = "Geçerli bir e-posta adresi gir.";
    else if (newEmail.trim().toLowerCase() === user?.email.toLowerCase()) found.next = "Bu zaten mevcut e-posta adresin.";
    setErrors(found);
    if (found.current || found.next) return;

    form.run(async () => {
      await changeEmail(currentPassword, newEmail.trim().toLowerCase());
      Alert.alert(
        "Onay bekleniyor",
        `${newEmail.trim()} adresine bir onay bağlantısı gönderdik. Bağlantıya dokunduğunda e-posta adresin değişir; o zamana kadar mevcut adresinle giriş yapabilirsin.`,
        [{ text: "Tamam", onPress: () => navigation.goBack() }]
      );
    });
  }

  return (
    <FormPage title="E-posta değiştir" onBack={() => navigation.goBack()}>
      <StaticField label="Mevcut giriş e-postanız:" value={user?.email ?? ""} />
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
        hint="Mevcut parolayı gir"
        error={errors.current}
      />
      <Field
        label="Yeni e-posta"
        value={newEmail}
        onChangeText={(text) => {
          setNewEmail(text);
          setErrors((e) => ({ ...e, next: undefined }));
        }}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        hint="Yeni e-posta adresini girin"
        error={errors.next}
      />
      <FormMessage text={form.error} />
      <PrimaryButton label={form.busy ? "Gönderiliyor…" : "E-posta değiştir"} onPress={save} disabled={form.busy} />
    </FormPage>
  );
}
