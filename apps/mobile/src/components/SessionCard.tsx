import { StyleSheet, View } from "react-native";
import { Card } from "./Card";
import { PlateChip } from "./PlateChip";
import { SessionBadge } from "./StatusBadge";
import { Text } from "./Text";
import { colors, spacing } from "@/src/theme";
import { formatCurrency, formatDateTime, formatDurationSeconds, formatElapsed } from "@/lib/format";
import type { SessionDto } from "@/lib/api/client";

type SessionCardProps = {
  session: SessionDto;
  now?: Date;
  testID?: string;
};

/** Compact session row: plate, zone, time window and duration. */
export function SessionCard({ session, now, testID }: SessionCardProps) {
  const active = session.status === "ACTIVE";
  return (
    <Card style={styles.card} testID={testID}>
      <View style={styles.row}>
        <View style={styles.left}>
          <Text variant="plate" testID={testID ? `${testID}-plate` : undefined}>
            {session.vehicle?.plateNumber ?? "GUEST"}
          </Text>
          <View style={styles.zoneLine}>
            <PlateChip value={session.zone.code} tone="soft" size="sm" />
            <Text variant="caption" numberOfLines={2} style={styles.zoneName}>
              Zone {session.zone.name}
            </Text>
          </View>
        </View>
        <View style={styles.badgeSlot}>
          <SessionBadge status={session.status} size="sm" testID={testID ? `${testID}-status` : undefined} />
        </View>
      </View>
      <View style={styles.divider} />
      <View style={styles.times}>
        <View style={styles.timeGroup}>
          <Text variant="micro">ENTERED</Text>
          <Text variant="mono" testID={testID ? `${testID}-entered` : undefined}>
            {formatDateTime(session.enteredAt)}
          </Text>
        </View>
        <View style={styles.timeGroup}>
          <Text variant="micro">{active ? "ELAPSED" : "EXITED"}</Text>
          {active ? (
            <Text variant="monoBold" color={colors.primary} testID={testID ? `${testID}-elapsed` : undefined}>
              {formatElapsed(session.enteredAt, now)}
            </Text>
          ) : (
            <>
              <Text variant="mono" testID={testID ? `${testID}-exited` : undefined}>
                {formatDateTime(session.exitedAt ?? "")}
              </Text>
              <Text variant="mono" color={colors.muted} testID={testID ? `${testID}-duration` : undefined}>
                {formatDurationSeconds(session.durationSeconds)}
              </Text>
            </>
          )}
        </View>
        {session.feeAmount != null ? (
          <View style={styles.timeGroup}>
            <Text variant="micro">PARKING FEE</Text>
            <Text variant="monoBold" color={colors.highlight} testID={testID ? `${testID}-fee` : undefined}>
              {formatCurrency(session.feeAmount)}
            </Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.xl,
  },
  left: {
    gap: spacing.md,
    flex: 1,
    minWidth: 0,
  },
  badgeSlot: {
    flexShrink: 0,
  },
  zoneLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  zoneName: {
    flexShrink: 1,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  times: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xl2,
  },
  timeGroup: {
    gap: spacing.xs,
    flexShrink: 1,
  },
});
