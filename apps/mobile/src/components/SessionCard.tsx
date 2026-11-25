import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "./Card";
import { PlateChip } from "./PlateChip";
import { SessionBadge } from "./StatusBadge";
import { Text } from "./Text";
import { spacing } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";
import type { ColorTokens } from "@/src/theme/colors";
import { formatClockTime, formatCurrency, formatDateTime, formatDurationSeconds, formatElapsed } from "@/lib/format";
import type { SessionDto } from "@/lib/api/client";

type SessionCardProps = {
  session: SessionDto;
  now?: Date;
  testID?: string;
};

/**
 * One session, read in one glance: where (zone + code) and what it cost on the
 * first line, when and how long on the second, which vehicle on the third.
 * A completed session needs no badge — the list is history; only a live one
 * is marked.
 */
export function SessionCard({ session, now, testID }: SessionCardProps) {
  const colors = useColors();
  const styles = useMemo(() => buildStyles(colors), [colors]);
  const active = session.status === "ACTIVE";
  const id = (part: string) => (testID ? `${testID}-${part}` : undefined);
  return (
    <Card style={styles.card} testID={testID}>
      <View style={styles.row}>
        <View style={styles.zone}>
          <Text variant="title" numberOfLines={2} style={styles.shrink}>
            {session.zone.name}
          </Text>
          <PlateChip value={session.zone.code} tone="soft" size="sm" style={styles.chip} />
        </View>
        {active ? (
          <SessionBadge status={session.status} size="sm" testID={id("status")} />
        ) : session.feeAmount != null ? (
          <Text variant="monoBold" color={colors.foreground} testID={id("fee")}>
            {formatCurrency(session.feeAmount)}
          </Text>
        ) : null}
      </View>
      <View style={styles.meta}>
        <Text variant="caption" testID={id("entered")}>
          {formatDateTime(session.enteredAt)}
        </Text>
        {active ? (
          <>
            <Text variant="caption">·</Text>
            <Text variant="caption" color={colors.primaryDeep} testID={id("elapsed")}>
              {formatElapsed(session.enteredAt, now)}
            </Text>
          </>
        ) : (
          <>
            <Text variant="caption">→</Text>
            <Text variant="caption" testID={id("exited")}>
              {exitLabel(session.enteredAt, session.exitedAt)}
            </Text>
            <Text variant="caption">·</Text>
            <Text variant="caption" color={colors.foreground} testID={id("duration")}>
              {formatDurationSeconds(session.durationSeconds)}
            </Text>
          </>
        )}
      </View>
      <View style={styles.meta}>
        <Ionicons name="car-outline" size={14} color={colors.muted} />
        <Text variant="caption" testID={id("plate")}>
          {session.vehicle?.plateNumber ?? "GUEST"}
        </Text>
      </View>
    </Card>
  );
}

/** Exit as a clock time on the entry day; the full date when it ran overnight. */
function exitLabel(enteredAt: string, exitedAt: string | null): string {
  if (!exitedAt) return "--:--";
  const full = formatDateTime(exitedAt);
  return full.slice(0, 10) === formatDateTime(enteredAt).slice(0, 10) ? formatClockTime(exitedAt) : full;
}

function buildStyles(_colors: ColorTokens) {
  return StyleSheet.create({
    card: {
      gap: spacing.sm,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.lg,
    },
    zone: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    shrink: {
      flexShrink: 1,
    },
    chip: {
      flexShrink: 0,
    },
    meta: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: spacing.xs,
    },
  });
}
