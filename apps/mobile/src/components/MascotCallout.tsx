import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Mascot, type MascotVariant } from "./Mascot";
import { Text } from "./Text";
import { radii, spacing } from "@/src/theme";
import { useColors, useThemeShadows } from "@/src/providers/ThemeProvider";
import type { ColorTokens } from "@/src/theme/colors";
import type { ShadowTokens } from "@/src/theme/shadows";

type MascotCalloutProps = {
  /** Which head variant speaks this line. */
  variant: MascotVariant;
  /** The line in the speech bubble — keep it short, one breath. */
  text: string;
  /** Mascot size; deliberately taller than the bubble so it pops out the top
   *  (RN doesn't clip by default — no absolute-position hack needed). */
  size?: number;
  testID?: string;
};

/**
 * Duolingo-style callout: a speech-bubble card with the mascot rising out of
 * its top edge. The bubble and mascot sit in one row with `alignItems:
 * "flex-end"`; because the mascot is taller than the bubble, it naturally
 * overflows upward past the bubble's own top border — no negative margins
 * or absolute positioning, which keeps this safe from the clipping bugs
 * that come from `overflow: hidden` ancestors (see the Park-screen rail
 * fix). Give the row above this a little extra bottom spacing so the
 * mascot's head has room before it collides with prior content.
 */
export function MascotCallout({ variant, text, size = 88, testID }: MascotCalloutProps) {
  const colors = useColors();
  const shadows = useThemeShadows();
  const styles = useMemo(() => buildStyles(colors, shadows), [colors, shadows]);
  return (
    <View style={styles.row} testID={testID}>
      <View style={styles.bubble}>
        <Text variant="bodySemi" testID={testID ? `${testID}-text` : undefined}>
          {text}
        </Text>
        <View style={styles.tail} />
      </View>
      <Mascot variant={variant} size={size} testID={testID ? `${testID}-mascot` : undefined} />
    </View>
  );
}

function buildStyles(colors: ColorTokens, shadows: ShadowTokens) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: spacing.sm,
    },
    bubble: {
      flex: 1,
      minWidth: 0,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      borderTopRightRadius: radii.cut,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.lg,
      marginBottom: spacing.md,
      ...shadows.card,
    },
    tail: {
      position: "absolute",
      right: 18,
      bottom: -6,
      width: 14,
      height: 14,
      backgroundColor: colors.surface,
      borderRightWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.border,
      transform: [{ rotate: "45deg" }],
    },
  });
}
