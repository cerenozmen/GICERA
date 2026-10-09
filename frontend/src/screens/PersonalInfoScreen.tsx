import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { Alert } from "react-native";
import { useAuth } from "../AuthContext";
import { PrimaryButton } from "../components/common";
import { Field, FormMessage, FormPage } from "../components/Field";
import { RootStackParamList } from "../navigation/types";
import { useSubmit } from "../useSubmit";

export function PersonalInfoScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "PersonalInfo">) {
  const { user, updateName } = useAuth();
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const form = useSubmit();

  function save() {
    form.run(async () => {
      await updateName(firstName, lastName);
      Alert.alert("Kaydedildi", "Kişisel bilgilerin güncellendi.", [{ text: "Tamam", onPress: () => navigation.goBack() }]);
    });
  }

  return (
    <FormPage title="Kişisel bilgiler" onBack={() => navigation.goBack()}>
      <Field label="Ad" value={firstName} onChangeText={setFirstName} autoCapitalize="words" autoComplete="given-name" textContentType="givenName" maxLength={40} />
      <Field label="Soyad" value={lastName} onChangeText={setLastName} autoCapitalize="words" autoComplete="family-name" textContentType="familyName" maxLength={40} />
      <FormMessage text={form.error} />
      <PrimaryButton label={form.busy ? "Kaydediliyor…" : "Kaydet"} onPress={save} disabled={form.busy} />
    </FormPage>
  );
}
