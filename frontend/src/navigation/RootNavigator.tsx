import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../AuthContext";
import { AccountInfoScreen } from "../screens/AccountInfoScreen";
import { AuthScreen } from "../screens/AuthScreen";
import { ChangeEmailScreen } from "../screens/ChangeEmailScreen";
import { ChangePasswordScreen } from "../screens/ChangePasswordScreen";
import { FavoritesScreen } from "../screens/FavoritesScreen";
import { ForgotPasswordScreen } from "../screens/ForgotPasswordScreen";
import { MyInfoScreen } from "../screens/MyInfoScreen";
import { PersonalInfoScreen } from "../screens/PersonalInfoScreen";
import { ResetPasswordScreen } from "../screens/ResetPasswordScreen";
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
  const { user } = useAuth();
  return (
    // Someone already signed in skips the intro.
    <Stack.Navigator initialRouteName={user ? "Main" : "Welcome"} screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="SkinQuiz" component={SkinQuizScreen} />
      <Stack.Screen name="Auth" component={AuthScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
      <Stack.Screen name="MyInfo" component={MyInfoScreen} />
      <Stack.Screen name="PersonalInfo" component={PersonalInfoScreen} />
      <Stack.Screen name="AccountInfo" component={AccountInfoScreen} />
      <Stack.Screen name="ChangeEmail" component={ChangeEmailScreen} />
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
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
