import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useApp } from "../AppContext";
import { IngredientAnalysisScreen } from "../screens/IngredientAnalysisScreen";
import { IngredientScanScreen } from "../screens/IngredientScanScreen";
import { PregnancyModeScreen } from "../screens/PregnancyModeScreen";
import { ProductDetailScreen } from "../screens/ProductDetailScreen";
import { ScanScreen } from "../screens/ScanScreen";
import { WelcomeScreen } from "../screens/WelcomeScreen";
import { MainTabs } from "./MainTabs";
import { RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { welcomeSeen } = useApp();
  return (
    <Stack.Navigator initialRouteName={welcomeSeen ? "Main" : "Welcome"} screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Main" component={MainTabs} />
      <Stack.Screen name="Scan" component={ScanScreen} options={{ animation: "slide_from_bottom" }} />
      <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
      <Stack.Screen name="IngredientAnalysis" component={IngredientAnalysisScreen} />
      <Stack.Screen name="PregnancyMode" component={PregnancyModeScreen} />
      <Stack.Screen name="IngredientScan" component={IngredientScanScreen} />
    </Stack.Navigator>
  );
}
