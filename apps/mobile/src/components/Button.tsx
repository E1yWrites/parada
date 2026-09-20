import { useMemo, useRef } from "react";
import { ActivityIndicator, Animated, Pressable, StyleSheet, View } from "react-native";
import type { ReactNode } from "react";
import { motion, radii, spacing, touchTarget } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";
import type { ColorTokens } from "@/src/theme/colors";
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

function buildVariantColors(colors: ColorTokens): Record<
  ButtonVariant,
  { background: string; pressed: string; foreground: string; borderColor?: string }
> {
  return {
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
      borderColor: colors.danger,
    },
    ghost: { background: "transparent", pressed: colors.primarySoft, foreground: colors.primary },
  };
}

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
  const colors = useColors();
  const variantColors = useMemo(() => buildVariantColors(colors), [colors]);
  const styles = useMemo(() => buildStyles(colors), [colors]);
  const isDisabled = disabled || loading;
  const palette = variantColors[variant];
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      onPressIn={() => {
        if (!isDisabled) {
          Animated.spring(scale, { toValue: 0.96, friction: 7, tension: 300, useNativeDriver: true }).start();
        }
      }}
      onPressOut={() => {
        Animated.spring(scale, {
          toValue: 1,
          friction: motion.springPlayful.friction,
          tension: motion.springPlayful.tension,
          useNativeDriver: true,
        }).start();
      }}
      style={({ pressed }) => [
        styles.base,
        size === "sm" ? styles.small : undefined,
        {
          backgroundColor: isDisabled ? colors.disabledSurface : pressed ? palette.pressed : palette.background,
          borderColor: palette.borderColor ?? "transparent",
          borderWidth: palette.borderColor ? 1.5 : 0,
        },
        variant === "primary" && !isDisabled ? styles.primaryShadow : undefined,
      ]}>
      <Animated.View style={[styles.content, { transform: [{ scale }] }]}>
        {loading ? (
          <ActivityIndicator testID="button-spinner" color={isDisabled ? colors.disabledForeground : palette.foreground} />
        ) : null}
        {icon ? <View style={styles.icon}>{icon}</View> : null}
        <Text
          variant="bodySemi"
          color={isDisabled ? colors.disabledForeground : palette.foreground}
          style={styles.text}>
          {title}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

function buildStyles(colors: ColorTokens) {
  return StyleSheet.create({
    base: {
      minHeight: touchTarget + 4,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: spacing.md,
      paddingHorizontal: spacing.xl2,
      paddingVertical: spacing.lg,
      borderRadius: radii.md,
      borderTopRightRadius: radii.cut,
    },
    small: {
      minHeight: touchTarget,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
    },
    primaryShadow: {
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.32,
      shadowRadius: 16,
      elevation: 4,
    },
    content: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.md,
    },
    text: {
      flexShrink: 1,
      textAlign: "center",
    },
    icon: {
      alignItems: "center",
    },
  });
}
