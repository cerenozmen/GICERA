import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect } from "react";
import { View } from "react-native";
import { useAuth } from "../AuthContext";
import { FormPage, formStyles, InfoRow } from "../components/Field";
import { RootStackParamList } from "../navigation/types";

/** Hesap bilgileri: e-posta and şifre, each opens its own change form. */
export function AccountInfoScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "AccountInfo">) {
  const { user, refreshUser } = useAuth();

  // A pending e-mail change may have been confirmed from the mailbox since the details were saved.
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  return (
    <FormPage title="Hesap bilgileri" onBack={() => navigation.goBack()}>
      <View style={formStyles.card}>
        <InfoRow icon="mail-outline" label="E-posta" value={user?.email} onPress={() => navigation.navigate("ChangeEmail")} />
        <InfoRow icon="lock-closed-outline" label="Şifre" value="••••••••" onPress={() => navigation.navigate("ChangePassword")} divider />
      </View>
    </FormPage>
  );
}
