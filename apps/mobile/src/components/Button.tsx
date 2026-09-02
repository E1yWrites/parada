import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import type { ReactNode } from "react";
import { colors, fonts, fontSizes, radii, spacing, touchTarget } from "@/src/theme";
import { Text } from "./Text";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  accessibilityLabel?: string;
  testID?: string;
};

const variantColors: Record<
  ButtonVariant,
  { background: string; foreground: string; borderColor?: string }
> = {
  primary: { background: colors.orange, foreground: colors.onAccent },
  secondary: { background: colors.surfaceElevated, foreground: colors.foreground, borderColor: colors.border },
  danger: { background: colors.surfaceElevated, foreground: colors.danger, borderColor: colors.danger },
  ghost: { background: "transparent", foreground: colors.orange },
};

export function Button({
  title,
  onPress,
  variant = "primary",
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
        {
          backgroundColor: palette.background,
          borderColor: palette.borderColor ?? "transparent",
          borderWidth: palette.borderColor ? 1 : 0,
          opacity: isDisabled ? 0.5 : 1,
        },
        pressed && !isDisabled ? styles.pressed : undefined,
      ]}>
      {loading ? <ActivityIndicator testID="button-spinner" color={palette.foreground} /> : null}
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text
        variant="bodySemi"
        color={palette.foreground}
        style={variant === "ghost" ? styles.ghostText : undefined}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget,
    minWidth: 128,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.xl3,
    paddingVertical: spacing.lg,
    borderRadius: radii.md,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.85,
  },
  icon: {
    alignItems: "center",
  },
  ghostText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.body,
  },
});