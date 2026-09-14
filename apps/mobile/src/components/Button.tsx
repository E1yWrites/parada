import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import type { ReactNode } from "react";
import { colors, motion, radii, spacing, touchTarget } from "@/src/theme";
import { Text } from "./Text";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "md" | "sm";

type ButtonProps = {
  title: string;
  onPress: () => void;
  /** `primary` is the one filled action on a screen; everything else is quiet. */
  variant?: ButtonVariant;
  /** `sm` for inline/secondary rows (still ≥44pt tall). */
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  accessibilityLabel?: string;
  testID?: string;
};

const variantColors: Record<
  ButtonVariant,
  { background: string; pressed: string; foreground: string; borderColor?: string }
> = {
  primary: { background: colors.primary, pressed: colors.primaryDeep, foreground: colors.onAccent },
  secondary: {
    background: colors.surface,
    pressed: colors.surfaceElevated,
    foreground: colors.foreground,
    borderColor: colors.border,
  },
  danger: {
    background: colors.surface,
    pressed: colors.dangerSoft,
    foreground: colors.danger,
    borderColor: "rgba(217, 52, 47, 0.35)",
  },
  ghost: { background: "transparent", pressed: colors.primarySoft, foreground: colors.primary },
};

export function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  icon,
  accessibilityLabel,
  testID,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const palette = variantColors[variant];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        size === "sm" ? styles.small : undefined,
        {
          backgroundColor: pressed && !isDisabled ? palette.pressed : palette.background,
          borderColor: palette.borderColor ?? "transparent",
          borderWidth: palette.borderColor ? 1 : 0,
          opacity: isDisabled ? 0.5 : 1,
        },
        variant === "primary" && !isDisabled ? styles.primaryShadow : undefined,
        pressed && !isDisabled ? styles.pressed : undefined,
      ]}>
      {loading ? <ActivityIndicator testID="button-spinner" color={palette.foreground} /> : null}
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text variant="bodySemi" color={palette.foreground} style={styles.text}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget + 4,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.xl2,
    paddingVertical: spacing.lg,
    borderRadius: radii.md,
  },
  small: {
    minHeight: touchTarget,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  primaryShadow: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 4,
  },
  text: {
    flexShrink: 1,
    textAlign: "center",
  },
  pressed: {
    transform: [{ scale: motion.pressScale }],
  },
  icon: {
    alignItems: "center",
  },
});
