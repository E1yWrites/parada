import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "./Card";
import { Text } from "./Text";
import { ViolationBadge } from "./StatusBadge";
import { formatCurrency, formatDateTime } from "@/lib/format";
import type { ViolationResponse } from "@parada/types";
import { spacing } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";

type ViolationCardProps = {
  violation: ViolationResponse;
  onPress?: () => void;
  testID?: string;
};

/** Summary card for the violations list. Tap to open the full detail/appeal screen. */
export function ViolationCard({ violation, onPress, testID }: ViolationCardProps) {
  const colors = useColors();
  return (
    <Card onPress={onPress} style={styles.card} testID={testID}>
      <View style={styles.body}>
        <View style={styles.row}>
          <Text variant="title" numberOfLines={2} style={styles.title}>
            {violation.zone.name}
          </Text>
          <ViolationBadge status={violation.status} size="sm" testID={testID ? `${testID}-status` : undefined} />
        </View>
        <Text variant="mono" color={colors.muted}>
          {violation.vehicle?.plateNumber ?? "Unknown vehicle"}
        </Text>
        <View style={styles.footRow}>
          <Text variant="caption">Issued {formatDateTime(violation.issuedAt)}</Text>
          <Text variant="monoBold" color={colors.warning} style={styles.fine}>
            {formatCurrency(violation.fineAmount)}
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  title: {
    flex: 1,
    minWidth: 0,
  },
  footRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  fine: {
    fontSize: 15,
  },
});
