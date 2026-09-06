import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { colors, spacing } from "@/src/theme";
import { Text } from "./Text";

type MetricProps = {
  label: string;
  value: string;
  accent?: string;
  icon?: ComponentProps<typeof Ionicons>["name"];
  testID?: string;
};

/** Labeled data point rendered in JetBrains Mono. */
export function Metric({ label, value, accent = colors.primary, icon, testID }: MetricProps) {
  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        {icon ? <Ionicons name={icon} size={12} color={accent} /> : null}
        <Text variant="micro" style={styles.label}>
          {label.toUpperCase()}
        </Text>
      </View>
      <Text variant="monoBold" color={accent} testID={testID}>
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
  label: {
    letterSpacing: 0.8,
  },
});