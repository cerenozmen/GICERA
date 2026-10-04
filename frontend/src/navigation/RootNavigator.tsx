import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { FavoritesScreen } from "../screens/FavoritesScreen";
import { IngredientAnalysisScreen } from "../screens/IngredientAnalysisScreen";
import { IngredientScanScreen } from "../screens/IngredientScanScreen";
import { NewPostScreen } from "../screens/NewPostScreen";
import { NotificationsScreen } from "../screens/NotificationsScreen";
import { PostDetailScreen } from "../screens/PostDetailScreen";
import { PregnancyModeScreen } from "../screens/PregnancyModeScreen";
import { ProductDetailScreen } from "../screens/ProductDetailScreen";
import { ProductNotFoundScreen } from "../screens/ProductNotFoundScreen";
import { ProductSearchScreen } from "../screens/ProductSearchScreen";
import { ScanScreen } from "../screens/ScanScreen";
import { SkinQuizScreen } from "../screens/SkinQuizScreen";
import { WelcomeScreen } from "../screens/WelcomeScreen";
import { MainTabs } from "./MainTabs";
import { RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator initialRouteName="Welcome" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="SkinQuiz" component={SkinQuizScreen} />
      <Stack.Screen name="Main" component={MainTabs} />
      <Stack.Screen name="Scan" component={ScanScreen} options={{ animation: "slide_from_bottom" }} />
      <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
      <Stack.Screen name="ProductNotFound" component={ProductNotFoundScreen} />
      <Stack.Screen name="IngredientAnalysis" component={IngredientAnalysisScreen} />
      <Stack.Screen name="PregnancyMode" component={PregnancyModeScreen} />
      <Stack.Screen name="Favorites" component={FavoritesScreen} />
      <Stack.Screen name="PostDetail" component={PostDetailScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="ProductSearch" component={ProductSearchScreen} />
      <Stack.Screen name="NewPost" component={NewPostScreen} options={{ animation: "slide_from_bottom" }} />
      <Stack.Screen name="IngredientScan" component={IngredientScanScreen} />
    </Stack.Navigator>
  );
}
