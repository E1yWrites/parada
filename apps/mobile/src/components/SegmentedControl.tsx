import { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { radii, spacing, touchTarget } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";
import type { ColorTokens } from "@/src/theme/colors";
import { Text } from "./Text";

type SegmentOption = {
  value: string;
  label: string;
  accessibilityLabel?: string;
  testID?: string;
};

type SegmentedControlProps = {
  options: [SegmentOption, SegmentOption];
  value: string;
  onChange: (value: string) => void;
  testID?: string;
};

/**
 * Two-way segmented control on a single tinted track, so picking between two
 * mutually exclusive modes (park now vs. reserve for later) reads as one
 * control rather than two independent buttons.
 */
export function SegmentedControl({ options, value, onChange, testID }: SegmentedControlProps) {
  const colors = useColors();
  const styles = useMemo(() => buildStyles(colors), [colors]);
  return (
    <View style={styles.track} testID={testID}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.segment,
              selected ? styles.segmentSelected : undefined,
              pressed && !selected ? styles.segmentPressed : undefined,
            ]}
            testID={option.testID}>
            <Text variant="bodySemi" color={selected ? colors.onAccent : colors.muted}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function buildStyles(colors: ColorTokens) {
  return StyleSheet.create({
    track: {
      flexDirection: "row",
      backgroundColor: colors.surfaceElevated,
      borderRadius: radii.md,
      borderTopRightRadius: radii.cut,
      padding: spacing.xs,
      gap: spacing.xs,
    },
    segment: {
      flex: 1,
      minHeight: touchTarget - 4,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radii.sm,
      borderTopRightRadius: radii.cut,
    },
    segmentSelected: {
      backgroundColor: colors.primary,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.24,
      shadowRadius: 8,
      elevation: 2,
    },
    segmentPressed: {
      backgroundColor: colors.surface,
    },
  });
}
