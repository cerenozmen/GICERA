import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { View } from "react-native";
import { useAuth } from "../AuthContext";
import { FormPage, formStyles, InfoRow } from "../components/Field";
import { displayName } from "../formRules";
import { RootStackParamList } from "../navigation/types";

/** Profile > Bilgilerim: the two groups, personal details and account details. */
export function MyInfoScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "MyInfo">) {
  const { user } = useAuth();
  return (
    <FormPage title="Bilgilerim" onBack={() => navigation.goBack()}>
      <View style={formStyles.card}>
        <InfoRow icon="person-outline" label="Kişisel bilgiler" value={user ? displayName(user) : undefined} onPress={() => navigation.navigate("PersonalInfo")} />
        <InfoRow icon="shield-checkmark-outline" label="Hesap bilgileri" onPress={() => navigation.navigate("AccountInfo")} divider />
      </View>
    </FormPage>
  );
}
