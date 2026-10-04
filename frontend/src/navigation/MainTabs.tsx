import { Ionicons } from "@react-native-vector-icons/ionicons";
import type { IconName } from "../components/icons";
import { BottomTabBarProps, createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme";
import { DiscussionScreen } from "../screens/DiscussionScreen";
import { HistoryScreen } from "../screens/HistoryScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { MainTabParamList } from "./types";

const Tab = createBottomTabNavigator<MainTabParamList>();

const TABS: Record<keyof MainTabParamList, { label: string; on: IconName; off: IconName }> = {
  Home: { label: "Anasayfa", on: "home-outline", off: "home-outline" },
  Discussion: { label: "Tartışma", on: "chatbubble-ellipses", off: "chatbubble-ellipses-outline" },
  ScanTab: { label: "Barkod Okuma", on: "scan-outline", off: "scan-outline" },
  History: { label: "Geçmiş", on: "time-outline", off: "time-outline" },
  Profile: { label: "Profilim", on: "person-outline", off: "person-outline" },
};

/** The design's bar: the active tab sits on a soft green tile; the scan button is a raised orange square. */
function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom + 8 }]}>
      {state.routes.map((route, index) => {
        const name = route.name as keyof MainTabParamList;
        const tab = TABS[name];
        const focused = state.index === index;
        if (name === "ScanTab") {
          return (
            <Pressable key={route.key} style={styles.item} onPress={() => navigation.getParent()?.navigate("Scan")} accessibilityLabel={tab.label}>
              <View style={styles.scan}>
                <Ionicons name="scan-outline" size={26} color="#fff" />
              </View>
              <Text style={styles.label} numberOfLines={1} adjustsFontSizeToFit>
                {tab.label}
              </Text>
            </Pressable>
          );
        }
        return (
          <Pressable
            key={route.key}
            style={[styles.item, focused && styles.itemOn]}
            onPress={() => {
              const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
            }}
            accessibilityState={{ selected: focused }}
            accessibilityLabel={tab.label}
          >
            <Ionicons name={focused ? tab.on : tab.off} size={25} color={focused ? colors.primary : colors.text} />
            <Text style={[styles.label, focused && styles.labelOn]} numberOfLines={1} adjustsFontSizeToFit>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const Empty = () => null;

export function MainTabs() {
  return (
    <Tab.Navigator tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Discussion" component={DiscussionScreen} />
      <Tab.Screen name="ScanTab" component={Empty} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "flex-end", backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6, paddingHorizontal: 8 },
  item: { flex: 1, alignItems: "center", justifyContent: "flex-end", gap: 4, paddingVertical: 8, borderRadius: 14 },
  itemOn: { backgroundColor: colors.primaryLight },
  label: { fontSize: 11.5, color: colors.text },
  labelOn: { color: colors.primary, fontWeight: "500" },
  scan: {
    marginTop: -26,
    width: 54,
    height: 54,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.accent,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
