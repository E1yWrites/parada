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
    <View style={styles.track} accessibilityRole="radiogroup" testID={testID}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, selected }}
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
      padding: spacing.xs,
      gap: spacing.xs,
    },
    segment: {
      flex: 1,
      minHeight: touchTarget,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radii.sm,
    },
    segmentSelected: {
      backgroundColor: colors.primary,
      // No shadow: a segment is nested chrome (DESIGN.md, Panel-Level Shadow Rule).
    },
    segmentPressed: {
      backgroundColor: colors.surface,
    },
  });
}
