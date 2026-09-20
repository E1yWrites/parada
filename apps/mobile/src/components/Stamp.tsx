import { useEffect, useRef } from "react";
import { Animated, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { usePrefersReducedMotion } from "@/src/hooks/usePrefersReducedMotion";
import { motion, radii, spacing } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";
import { softColor } from "@/src/theme/colors";
import { Text } from "./Text";

type StampProps = {
  /** Short caps label, e.g. "ZONE ASSIGNED". */
  label: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  color?: string;
  testID?: string;
};

/**
 * The pass card's stamp: a tinted icon+caps pill that lands with a short
 * spring (0.92 → 1) when the state resolves. Static under Reduce Motion.
 */
export function Stamp({ label, icon, color, testID }: StampProps) {
  const colors = useColors();
  const resolvedColor = color ?? colors.primary;
  const reducedMotion = usePrefersReducedMotion();
  const scale = useRef(new Animated.Value(reducedMotion ? 1 : 0.92)).current;

  useEffect(() => {
    if (reducedMotion) {
      scale.setValue(1);
      return;
    }
    Animated.spring(scale, {
      toValue: 1,
      friction: motion.spring.friction,
      tension: motion.spring.tension,
      useNativeDriver: true,
    }).start();
  }, [reducedMotion, scale]);

  return (
    <Animated.View
      testID={testID}
      accessibilityLabel={label}
      style={[styles.stamp, { backgroundColor: softColor(resolvedColor, colors), transform: [{ scale }] }]}>
      <Ionicons name={icon} size={13} color={resolvedColor} />
      <Text variant="micro" color={resolvedColor}>
        {label}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stamp: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    alignSelf: "flex-start",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 1,
    borderRadius: radii.full,
  },
});
