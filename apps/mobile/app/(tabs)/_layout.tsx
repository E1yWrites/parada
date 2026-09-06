import { Redirect, Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "@/src/providers/SessionProvider";
import { FullScreenLoading } from "@/src/components/FullScreenLoading";
import { TabBarBackground } from "@/src/components/TabBarBackground";
import { colors, fonts, fontSizes, layout, shadows } from "@/src/theme";

type IconProps = { color: string; size: number; focused: boolean };

const FloatingDot = ({ show }: { show: boolean }) =>
  show ? <View style={styles.dot} /> : null;

const ParkingIcon = ({ color, size, focused }: IconProps) => (
  <View style={styles.iconWrap}>
    <Ionicons name={focused ? "grid" : "grid-outline"} size={size} color={color} />
    <FloatingDot show={focused} />
  </View>
);
const VehiclesIcon = ({ color, size, focused }: IconProps) => (
  <View style={styles.iconWrap}>
    <Ionicons name={focused ? "car-sport" : "car-sport-outline"} size={size} color={color} />
    <FloatingDot show={focused} />
  </View>
);
const SessionsIcon = ({ color, size, focused }: IconProps) => (
  <View style={styles.iconWrap}>
    <Ionicons name={focused ? "time" : "time-outline"} size={size} color={color} />
    <FloatingDot show={focused} />
  </View>
);
const AccountIcon = ({ color, size, focused }: IconProps) => (
  <View style={styles.iconWrap}>
    <Ionicons name={focused ? "person" : "person-outline"} size={size} color={color} />
    <FloatingDot show={focused} />
  </View>
);

export default function TabsLayout() {
  const { user, isLoading } = useSession();
  const insets = useSafeAreaInsets();

  if (isLoading) {
    return <FullScreenLoading testID="session-loading" />;
  }
  if (!user) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: "#FFFFFF",
        tabBarInactiveTintColor: "rgba(183, 198, 194, 0.9)",
        tabBarStyle: {
          position: "absolute",
          bottom: insets.bottom + layout.FLOATING_TAB_BAR_MARGIN,
          left: layout.FLOATING_TAB_BAR_SIDE,
          right: layout.FLOATING_TAB_BAR_SIDE,
          height: layout.FLOATING_TAB_BAR_HEIGHT,
          borderRadius: layout.FLOATING_TAB_BAR_RADIUS,
          backgroundColor: "transparent",
          borderTopWidth: 0,
          paddingTop: 6,
          ...shadows.pill,
        },
        tabBarBackground: () => <TabBarBackground testID="tab-bar-background" />,
        tabBarLabelStyle: {
          fontFamily: fonts.headingRegular,
          fontSize: fontSizes.micro + 1,
          fontWeight: "600",
        },
        sceneStyle: { backgroundColor: colors.background },
      }}>
      <Tabs.Screen
        name="parking"
        options={{ title: "Parking", tabBarAccessibilityLabel: "Parking", tabBarIcon: ParkingIcon }}
      />
      <Tabs.Screen
        name="vehicles"
        options={{ title: "Vehicles", tabBarAccessibilityLabel: "Vehicles", tabBarIcon: VehiclesIcon }}
      />
      <Tabs.Screen
        name="sessions"
        options={{ title: "Sessions", tabBarAccessibilityLabel: "Sessions", tabBarIcon: SessionsIcon }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: "Account", tabBarAccessibilityLabel: "Account", tabBarIcon: AccountIcon }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
});