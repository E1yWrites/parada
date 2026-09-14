import { Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, motion, radii, spacing, touchTarget } from "@/src/theme";
import { Text } from "./Text";

type ChoiceChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** `radio` for pick-one groups (vehicles), `button` for type toggles. */
  accessibilityRole?: "radio" | "button";
  accessibilityLabel?: string;
  /** Render the label in the plate/mono face (plate numbers). */
  mono?: boolean;
  testID?: string;
};

/**
 * Pick-one chip. Every option stays present; the chosen one is struck
 * forward in blue with a check, the rest sit quietly on the tinted surface.
 */
export function ChoiceChip({
  label,
  selected,
  onPress,
  accessibilityRole = "radio",
  accessibilityLabel,
  mono = false,
  testID,
}: ChoiceChipProps) {
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.chipSelected : undefined,
        pressed ? styles.pressed : undefined,
      ]}
      testID={testID}>
      {selected ? <Ionicons name="checkmark-circle" size={16} color={colors.onAccent} /> : null}
      <Text
        variant={mono ? "mono" : "bodySemi"}
        color={selected ? colors.onAccent : colors.foreground}
        style={mono ? styles.mono : undefined}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: touchTarget,
    minWidth: 84,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 3,
  },
  pressed: {
    transform: [{ scale: motion.pressScale }],
  },
  mono: {
    letterSpacing: 1,
    fontSize: 14,
  },
});
