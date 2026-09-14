import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { colors, spacing } from "@/src/theme";
import { Text } from "./Text";

type MetricProps = {
  label: string;
  value: string;
  /** Color of the value; defaults to ink so only the one number that matters is colored. */
  accent?: string;
  icon?: ComponentProps<typeof Ionicons>["name"];
  /** `lg` renders the value at display size (the free-space count on a lane card). */
  size?: "md" | "lg";
  testID?: string;
};

/** Labeled data point with tabular numerals so counts never jump width. */
export function Metric({ label, value, accent = colors.foreground, icon, size = "md", testID }: MetricProps) {
  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        {icon ? <Ionicons name={icon} size={12} color={colors.muted} /> : null}
        <Text variant="micro">{label.toUpperCase()}</Text>
      </View>
      <Text variant={size === "lg" ? "display" : "monoBold"} color={accent} testID={testID}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
});
