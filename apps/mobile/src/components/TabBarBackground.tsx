import { StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { blurMethod, glass, layout } from "@/src/theme";
import { usePrefersReducedTransparency } from "@/src/hooks/usePrefersReducedTransparency";

/**
 * Frosted background for the floating pill tab bar. Rendered via
 * `Tabs`' `tabBarBackground` option, behind the tab bar's icons/labels, with
 * `tabBarStyle.backgroundColor` set to `"transparent"` at the call site.
 * Falls back to the old solid charcoal fill under Reduce Transparency.
 */
export function TabBarBackground({ testID }: { testID?: string }) {
  const reducedTransparency = usePrefersReducedTransparency();
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
    </View>
  );
}

const styles = StyleSheet.create({
  rounded: {
    borderRadius: layout.FLOATING_TAB_BAR_RADIUS,
    overflow: "hidden",
  },
});
