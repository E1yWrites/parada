import { Redirect, Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSession } from "@/src/providers/SessionProvider";
import { FullScreenLoading } from "@/src/components/FullScreenLoading";
import { colors, fonts, fontSizes } from "@/src/theme";

type IconProps = { color: string; size: number; focused: boolean };

const ParkingIcon = ({ color, size, focused }: IconProps) => (
  <Ionicons name={focused ? "grid" : "grid-outline"} size={size} color={color} />
);
const VehiclesIcon = ({ color, size, focused }: IconProps) => (
  <Ionicons name={focused ? "car-sport" : "car-sport-outline"} size={size} color={color} />
);
const SessionsIcon = ({ color, size, focused }: IconProps) => (
  <Ionicons name={focused ? "time" : "time-outline"} size={size} color={color} />
);
const AccountIcon = ({ color, size, focused }: IconProps) => (
  <Ionicons name={focused ? "person" : "person-outline"} size={size} color={color} />
);

export default function TabsLayout() {
  const { user, isLoading } = useSession();

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
        tabBarActiveTintColor: colors.orange,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontFamily: fonts.bodySemi,
          fontSize: fontSizes.micro,
        },
        sceneStyle: { backgroundColor: colors.background },
      }}>
      <Tabs.Screen name="parking" options={{ title: "Parking", tabBarIcon: ParkingIcon }} />
      <Tabs.Screen name="vehicles" options={{ title: "Vehicles", tabBarIcon: VehiclesIcon }} />
      <Tabs.Screen name="sessions" options={{ title: "Sessions", tabBarIcon: SessionsIcon }} />
      <Tabs.Screen name="account" options={{ title: "Account", tabBarIcon: AccountIcon }} />
    </Tabs>
  );
}