import { StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { blurMethod, layout } from "@/src/theme";
import { useThemeGlass } from "@/src/providers/ThemeProvider";
import { usePrefersReducedTransparency } from "@/src/hooks/usePrefersReducedTransparency";

/**
 * Frosted background for the floating pill tab bar. Rendered via
 * `Tabs`' `tabBarBackground` option, behind the tab bar's icons/labels, with
 * `tabBarStyle.backgroundColor` set to `"transparent"` at the call site.
 * Falls back to a solid theme-surface fill under Reduce Transparency.
 */
export function TabBarBackground({ testID }: { testID?: string }) {
  const reducedTransparency = usePrefersReducedTransparency();
  const glass = useThemeGlass();
  const preset = glass.chrome;

  if (reducedTransparency) {
    return (
      <View testID={testID} style={[StyleSheet.absoluteFill, styles.rounded, { backgroundColor: preset.fallbackColor }]} />
    );
  }
  return (
    <View testID={testID} style={[StyleSheet.absoluteFill, styles.rounded]}>
      <BlurView
        testID={testID ? `${testID}-blur` : undefined}
        style={StyleSheet.absoluteFill}
        tint={preset.tint}
        intensity={preset.intensity}
        experimentalBlurMethod={blurMethod}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: preset.overlayColor }]} />
      <View style={[StyleSheet.absoluteFill, styles.rounded, styles.edge, { borderColor: preset.borderColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  rounded: {
    borderRadius: layout.FLOATING_TAB_BAR_RADIUS,
    overflow: "hidden",
  },
  edge: {
    borderWidth: 1,
  },
});
