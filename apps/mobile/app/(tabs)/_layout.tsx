import { Redirect, Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { type ColorValue, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "@/src/providers/SessionProvider";
import { FullScreenLoading } from "@/src/components/FullScreenLoading";
import { TabBarBackground } from "@/src/components/TabBarBackground";
import { VehicleSelectionProvider } from "@/src/components/VehicleSelection";
import { fonts, fontSizes, layout, radii } from "@/src/theme";
import { useColors, useThemeShadows } from "@/src/providers/ThemeProvider";

type IconProps = { color: ColorValue; size: number; focused: boolean };

/**
 * Active tab: the icon sits in a soft blue tile so the current section reads
 * from across the room; inactive tabs are quiet outline glyphs.
 */
const TabIcon = ({
  color,
  size,
  focused,
  name,
}: IconProps & { name: keyof typeof Ionicons.glyphMap }) => {
  const colors = useColors();
  return (
    <View style={[iconStyles.iconWrap, focused ? { backgroundColor: colors.primarySoft } : undefined]}>
      <Ionicons name={name} size={size} color={color} />
    </View>
  );
};

const iconStyles = StyleSheet.create({
  iconWrap: {
    width: 40,
    height: 28,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
  },
});

const HomeIcon = (props: IconProps) => <TabIcon {...props} name={props.focused ? "home" : "home-outline"} />;
const ParkIcon = (props: IconProps) => <TabIcon {...props} name={props.focused ? "car" : "car-outline"} />;
const SessionsIcon = (props: IconProps) => <TabIcon {...props} name={props.focused ? "time" : "time-outline"} />;
const AccountIcon = (props: IconProps) => (
  <TabIcon {...props} name={props.focused ? "person" : "person-outline"} />
);

export default function TabsLayout() {
  const colors = useColors();
  const shadows = useThemeShadows();
  const { user, isLoading } = useSession();
  const insets = useSafeAreaInsets();

  if (isLoading) {
    return <FullScreenLoading testID="session-loading" />;
  }
  if (!user) {
    return <Redirect href="/login" />;
  }

  return (
    // One vehicle choice for the whole signed-in tab area: a plate picked on
    // Now is the plate Zones uses (it used to be one provider per tab). It
    // unmounts on sign-out with the tabs, so the choice never leaks across users.
    <VehicleSelectionProvider>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.primaryDeep,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          position: "absolute",
          bottom: insets.bottom + layout.FLOATING_TAB_BAR_MARGIN,
          left: layout.FLOATING_TAB_BAR_SIDE,
          right: layout.FLOATING_TAB_BAR_SIDE,
          height: layout.FLOATING_TAB_BAR_HEIGHT,
          borderRadius: layout.FLOATING_TAB_BAR_RADIUS,
          backgroundColor: "transparent",
          borderTopWidth: 0,
          paddingTop: 4,
          ...shadows.pill,
        },
        tabBarBackground: () => <TabBarBackground testID="tab-bar-background" />,
        tabBarLabelStyle: {
          fontFamily: fonts.bodyBold,
          fontSize: fontSizes.micro,
          marginTop: 2,
        },
        sceneStyle: { backgroundColor: colors.background },
      }}>
      <Tabs.Screen
        name="parking"
        options={{ title: "Now", tabBarAccessibilityLabel: "Now", tabBarIcon: HomeIcon }}
      />
      <Tabs.Screen
        name="park"
        options={{ title: "Zones", tabBarAccessibilityLabel: "Zones", tabBarIcon: ParkIcon }}
      />
      <Tabs.Screen
        name="sessions"
        options={{ title: "History", tabBarAccessibilityLabel: "History", tabBarIcon: SessionsIcon }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: "Account", tabBarAccessibilityLabel: "Account", tabBarIcon: AccountIcon }}
      />
      {/* Vehicles moves off the tab bar (Figma direction) but stays reachable
          at /vehicles, e.g. from the Account screen's "My Vehicles" link. */}
      <Tabs.Screen name="vehicles" options={{ href: null }} />
    </Tabs>
    </VehicleSelectionProvider>
  );
}
