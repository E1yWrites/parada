import { useMemo } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { radii, spacing } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";
import type { ColorTokens } from "@/src/theme/colors";
import { Text } from "./Text";

type PlateChipProps = {
  /** Zone code or plate number — always data, always mono. */
  value: string;
  /** `ink` is the default plate (reads like a physical plate in both themes); `soft` an orange-tinted plate for secondary rows. */
  tone?: "ink" | "soft";
  size?: "sm" | "md";
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Square-cornered "plate" chip for identifiers (zone codes, plate numbers).
 * The same chip appears everywhere an identifier does, so a code is
 * recognizable as the literal thing painted on the gate.
 */
export function PlateChip({ value, tone = "ink", size = "md", style, testID }: PlateChipProps) {
  const colors = useColors();
  const styles = useMemo(() => buildStyles(colors), [colors]);
  const compact = size === "sm";
  return (
    <View
      testID={testID}
      style={[
        styles.base,
        compact ? styles.compact : undefined,
        tone === "ink" ? styles.ink : styles.soft,
        style,
      ]}>
      <Text
        variant="mono"
        numberOfLines={1}
        color={tone === "ink" ? colors.onAccent : colors.primaryDeep}
        style={compact ? styles.textSm : styles.text}>
        {value}
      </Text>
    </View>
  );
}

function buildStyles(colors: ColorTokens) {
  return StyleSheet.create({
    base: {
      alignSelf: "flex-start",
      paddingHorizontal: spacing.md + 2,
      paddingVertical: spacing.sm + 1,
      borderRadius: radii.sm - 4,
    },
    compact: {
      paddingHorizontal: spacing.md + 2,
      paddingVertical: 2,
    },
    ink: {
      backgroundColor: colors.foreground,
    },
    soft: {
      backgroundColor: colors.primarySoft,
    },
    text: {
      letterSpacing: 1,
    },
    textSm: {
      letterSpacing: 0.8,
      fontSize: 11,
      lineHeight: 16,
    },
  });
}
