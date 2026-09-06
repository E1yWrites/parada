import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { AppProviders } from "@/src/providers/AppProviders";
import { FullScreenLoading } from "@/src/components/FullScreenLoading";
import { fontAssets, colors } from "@/src/theme";

export default function RootLayout() {
  const [fontsLoaded] = useFonts(fontAssets);
  if (!fontsLoaded) {
    return <FullScreenLoading testID="font-loading" />;
  }
  return (
    <AppProviders>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </AppProviders>
  );
}