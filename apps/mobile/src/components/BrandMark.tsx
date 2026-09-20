import { useMemo } from "react";
import { Image, StyleSheet, View } from "react-native";
import { radii, spacing } from "@/src/theme";
import { useColors, useThemeShadows } from "@/src/providers/ThemeProvider";
import type { ColorTokens } from "@/src/theme/colors";
import type { ShadowTokens } from "@/src/theme/shadows";

const LOGO = require("../../assets/brand/parada-logo.webp");
/** The source asset's real aspect ratio (1500 × 198 px) — never distort it. */
const LOGO_ASPECT = 1500 / 198;

type BrandMarkProps = {
  /** Height of the logo mark in points; width follows the asset's own aspect ratio. */
  size?: number;
  testID?: string;
};

/**
 * The canonical PARADA logo, unmodified, mounted on its own light plate so
 * the mark stays legible on the dark ground (the source asset is black ink
 * with orange cuts on a transparent field). The plate is a fixed neutral
 * white by design — intentionally theme-independent, since the mark needs
 * the same legible ground in both registers, not a themed surface color.
 * Reserved for brand moments — auth, onboarding, splash — never repeated as
 * generic screen chrome.
 */
export function BrandMark({ size = 22, testID }: BrandMarkProps) {
  const colors = useColors();
  const shadows = useThemeShadows();
  const styles = useMemo(() => buildStyles(colors, shadows), [colors, shadows]);
  return (
    <View style={styles.plate} testID={testID} accessibilityRole="image" accessibilityLabel="PARADA">
      <Image
        source={LOGO}
        resizeMode="contain"
        style={{ width: Math.round(size * LOGO_ASPECT), height: size }}
      />
    </View>
  );
}

function buildStyles(colors: ColorTokens, shadows: ShadowTokens) {
  return StyleSheet.create({
    plate: {
      alignSelf: "flex-start",
      backgroundColor: "#FFFFFF",
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.lg,
      borderRadius: radii.lg,
      borderTopRightRadius: radii.cut,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadows.card,
    },
  });
}
