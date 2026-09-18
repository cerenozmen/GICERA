import { Ionicons } from "@expo/vector-icons";
import { BottomTabBarButtonProps, createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme";
import { ExploreScreen } from "../screens/ExploreScreen";
import { FavoritesScreen } from "../screens/FavoritesScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { MainTabParamList } from "./types";

const Tab = createBottomTabNavigator<MainTabParamList>();

const ICONS: Record<string, { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap }> = {
  Home: { on: "home", off: "home-outline" },
  Explore: { on: "search", off: "search-outline" },
  Favorites: { on: "heart", off: "heart-outline" },
  Profile: { on: "person", off: "person-outline" },
};

function ScanButton({ onPress }: BottomTabBarButtonProps) {
  return (
    <View style={styles.scanWrap}>
      <Pressable style={styles.scan} onPress={onPress}>
        <Ionicons name="scan-outline" size={30} color="#fff" />
      </Pressable>
    </View>
  );
}

const Empty = () => null;

export function MainTabs() {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border, height: 64 + insets.bottom, paddingTop: 6, paddingBottom: insets.bottom },
        tabBarLabelStyle: { fontSize: 11, marginBottom: 6 },
        tabBarIcon: ({ focused, color }) => {
          const icon = ICONS[route.name];
          return icon ? <Ionicons name={focused ? icon.on : icon.off} size={22} color={color} /> : null;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: "Ana Sayfa" }} />
      <Tab.Screen name="Explore" component={ExploreScreen} options={{ title: "Keşfet" }} />
      <Tab.Screen
        name="ScanTab"
        component={Empty}
        options={{ title: "", tabBarButton: (props) => <ScanButton {...props} /> }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.getParent()?.navigate("Scan");
          },
        })}
      />
      <Tab.Screen name="Favorites" component={FavoritesScreen} options={{ title: "Favoriler" }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: "Profil" }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  scanWrap: { flex: 1, alignItems: "center" },
  scan: {
    marginTop: -22,
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: colors.bg,
  },
});
