import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { AppProviders } from "@/src/providers/AppProviders";
import { PopupProvider } from "@/src/providers/PopupProvider";
import { ThemeProvider, useColors, useColorSchemeResolved } from "@/src/providers/ThemeProvider";
import { FullScreenLoading } from "@/src/components/FullScreenLoading";
import { fontAssets } from "@/src/theme";

function RootStack() {
  const [fontsLoaded] = useFonts(fontAssets);
  const colors = useColors();
  const scheme = useColorSchemeResolved();
  if (!fontsLoaded) {
    return <FullScreenLoading testID="font-loading" />;
  }
  return (
    <AppProviders>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      {/* Above the whole stack so banners and toasts show on pushed screens too
          (Vehicles, the tutorial), not only on the tabs. */}
      <PopupProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        />
      </PopupProvider>
    </AppProviders>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootStack />
    </ThemeProvider>
  );
}
