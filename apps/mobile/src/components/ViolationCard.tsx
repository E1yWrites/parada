import { StyleSheet, View } from "react-native";
import { Card } from "./Card";
import { Text } from "./Text";
import { ViolationBadge, violationStatusMeta } from "./StatusBadge";
import { formatCurrency, formatDateTime } from "@/lib/format";
import type { ViolationResponse } from "@parada/types";
import { colors, spacing } from "@/src/theme";

type ViolationCardProps = {
  violation: ViolationResponse;
  onPress?: () => void;
  testID?: string;
};

/** Summary card for the violations list. Tap to open the full detail/appeal screen. */
export function ViolationCard({ violation, onPress, testID }: ViolationCardProps) {
  return (
    <Card
      onPress={onPress}
      accent={violationStatusMeta(violation.status).color}
      testID={testID}>
      <View style={styles.row}>
        <View style={styles.heading}>
          <Text variant="title" numberOfLines={2}>
            {violation.zone.name}
          </Text>
          <Text variant="mono">{violation.vehicle?.plateNumber ?? "Unknown vehicle"}</Text>
        </View>
        <View style={styles.badgeSlot}>
          <ViolationBadge status={violation.status} testID={testID ? `${testID}-status` : undefined} />
        </View>
      </View>
      <View style={styles.footRow}>
        <Text variant="caption" color={colors.muted}>
          Issued {formatDateTime(violation.issuedAt)}
        </Text>
        <Text variant="monoBold" color={colors.warning}>
          {formatCurrency(violation.fineAmount)}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  heading: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  badgeSlot: {
    flexShrink: 0,
  },
  footRow: {
    marginTop: spacing.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
});
