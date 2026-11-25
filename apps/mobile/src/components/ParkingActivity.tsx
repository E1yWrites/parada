import { useEffect, useMemo, useState } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import type { SessionDto } from "@/lib/api/client";
import { radii, spacing } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";
import { usePrefersReducedMotion } from "@/src/hooks/usePrefersReducedMotion";
import { GlassCard } from "./GlassCard";
import { Text } from "./Text";

const DAY = 24 * 60 * 60 * 1000;
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Minutes parked per local calendar day: completed sessions by their stored
 * duration, the active one by time so far.
 * ponytail: a session is counted on the day it started; split across
 * midnight if overnight parking ever matters.
 */
export function minutesByDay(sessions: SessionDto[], now: Date): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of sessions) {
    const start = new Date(s.enteredAt);
    const seconds =
      s.status === "COMPLETED" ? (s.durationSeconds ?? 0) : s.status === "ACTIVE" ? (now.getTime() - start.getTime()) / 1000 : 0;
    if (seconds <= 0) continue;
    const key = dayKey(start);
    out.set(key, (out.get(key) ?? 0) + Math.round(seconds / 60));
  }
  return out;
}

export function formatMinutes(m: number): string {
  if (m <= 0) return "0m";
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}

/**
 * History's charts: the last 7 days as tappable bars (tap a day to read it)
 * and the current month as a heat calendar (darker = longer). Both come from
 * the driver's own /sessions list.
 */
export function ParkingActivity({ sessions, now = new Date(), testID }: { sessions: SessionDto[]; now?: Date; testID?: string }) {
  const colors = useColors();
  const reducedMotion = usePrefersReducedMotion();
  const byDay = useMemo(() => minutesByDay(sessions, now), [now, sessions]);
  const week = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(now.getTime() - (6 - i) * DAY);
        return { date: d, minutes: byDay.get(dayKey(d)) ?? 0, today: i === 6 };
      }),
    [byDay, now],
  );
  const total = week.reduce((sum, d) => sum + d.minutes, 0);
  const max = Math.max(60, ...week.map((d) => d.minutes));
  const [selected, setSelected] = useState<number | null>(null);
  const [grow] = useState(() => new Animated.Value(reducedMotion ? 1 : 0));
  useEffect(() => {
    if (reducedMotion) {
      grow.setValue(1);
      return;
    }
    Animated.spring(grow, { toValue: 1, friction: 8, tension: 40, useNativeDriver: true }).start();
  }, [grow, reducedMotion]);

  const month = useMemo(() => {
    const year = now.getFullYear();
    const m = now.getMonth();
    const days = new Date(year, m + 1, 0).getDate();
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(year, m, i + 1);
      return { day: i + 1, minutes: byDay.get(dayKey(d)) ?? 0, future: d.getTime() > now.getTime() };
    });
  }, [byDay, now]);
  const monthMax = Math.max(60, ...month.map((d) => d.minutes));
  const parkedDays = month.filter((d) => d.minutes > 0).length;
  const pick = selected != null ? week[selected] : null;

  return (
    <View style={styles.wrap} testID={testID}>
      <GlassCard padding={spacing.xl}>
        <View style={styles.readout} accessibilityLiveRegion="polite">
          <Text variant="display" testID={testID ? `${testID}-total` : undefined}>
            {formatMinutes(pick ? pick.minutes : total)}
          </Text>
          <Text variant="caption">
            {pick
              ? `${pick.today ? "Today" : `${WEEKDAY[pick.date.getDay()]} ${pick.date.getDate()}`} · parked`
              : "parked, last 7 days · tap a day"}
          </Text>
        </View>
        <View style={styles.bars}>
          {week.map((d, i) => {
            const h = Math.max(4, (d.minutes / max) * 104);
            const label = `${d.today ? "Today" : WEEKDAY[d.date.getDay()]}, ${formatMinutes(d.minutes)} parked`;
            return (
              <Pressable
                key={i}
                style={styles.barCol}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected: selected === i }}
                onPress={() => setSelected(selected === i ? null : i)}
                testID={testID ? `${testID}-day-${i}` : undefined}>
                <View style={styles.barTrack}>
                  <Animated.View
                    style={[
                      styles.bar,
                      {
                        height: h,
                        backgroundColor: d.today ? colors.data[0] : colors.foreground,
                        opacity: d.minutes > 0 ? (d.today ? 0.55 : 1) : 0.15,
                        borderWidth: selected === i ? 2 : 0,
                        borderColor: colors.primaryDeep,
                        transform: [{ scaleY: grow }],
                      },
                    ]}
                  />
                </View>
                <Text variant="micro" color={d.today ? colors.primaryDeep : colors.muted}>
                  {WEEKDAY[d.date.getDay()]!.slice(0, 1)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </GlassCard>
      <View style={[styles.month, { backgroundColor: colors.surface }]} testID={testID ? `${testID}-month` : undefined}>
        <Text variant="bodySemi">
          {now.toLocaleString("en-US", { month: "long" })}{" "}
          <Text variant="caption">· {parkedDays} {parkedDays === 1 ? "day" : "days"} parked · darker = longer</Text>
        </Text>
        <View style={styles.grid}>
          {month.map((d) => (
            <View
              key={d.day}
              accessible
              accessibilityLabel={d.future ? `${d.day}` : `${d.day}: ${d.minutes > 0 ? formatMinutes(d.minutes) : "no parking"}`}
              style={[styles.cell, { borderColor: d.future ? colors.border : "transparent" }]}>
              <View
                style={[
                  StyleSheet.absoluteFill,
                  {
                    borderRadius: 6,
                    backgroundColor: d.minutes > 0 ? colors.data[0] : colors.foreground,
                    opacity: d.future ? 0 : d.minutes > 0 ? 0.25 + 0.75 * (d.minutes / monthMax) : 0.08,
                  },
                ]}
              />
              <Text variant="micro" color={colors.muted} style={styles.cellNum}>
                {d.day}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  readout: { gap: 2, minHeight: 64 },
  bars: { flexDirection: "row", gap: 6, marginTop: spacing.md },
  barCol: { flex: 1, alignItems: "center", gap: 6, minHeight: 44 },
  barTrack: { height: 104, justifyContent: "flex-end" },
  bar: { width: 22, borderRadius: 7, transformOrigin: "bottom" },
  month: { borderRadius: radii.lg, padding: spacing.lg, gap: spacing.md },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  // Fixed squares: a percentage width with aspectRatio collapses to 0 inside a
  // wrapping row on Android.
  cell: { width: 26, height: 26, borderRadius: 6, borderWidth: 1, borderStyle: "dashed", overflow: "hidden" },
  cellNum: { position: "absolute", left: 3, top: 1, fontSize: 9 },
});
