import { StyleSheet, View } from "react-native";
import { Card } from "./Card";
import { SessionBadge } from "./StatusBadge";
import { Text } from "./Text";
import { colors, fonts, fontSizes, spacing } from "@/src/theme";
import { formatDateTime, formatDurationSeconds, formatElapsed } from "@/lib/format";
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
    <Card accent={active ? colors.orange : colors.muted} style={styles.card} testID={testID}>
      <View style={styles.row}>
        <View style={styles.left}>
          <Text variant="plate" testID={testID ? `${testID}-plate` : undefined}>
            {session.vehicle.plateNumber}
          </Text>
          <View style={styles.zoneLine}>
            <Text variant="caption">Zone {session.zone.name}</Text>
            <Text variant="mono" style={styles.code}>
              {session.zone.code}
            </Text>
          </View>
        </View>
        <SessionBadge status={session.status} size="sm" testID={testID ? `${testID}-status` : undefined} />
      </View>
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
            <Text variant="monoBold" color={colors.orange} testID={testID ? `${testID}-elapsed` : undefined}>
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
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.xl,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.xl,
  },
  left: {
    gap: spacing.md,
    flexShrink: 1,
  },
  zoneLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  code: {
    color: colors.muted,
    fontFamily: fonts.mono,
    fontSize: fontSizes.caption,
  },
  times: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.xl,
  },
  timeGroup: {
    gap: spacing.xs,
  },
});