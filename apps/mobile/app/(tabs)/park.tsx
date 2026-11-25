import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormAlert,
  LoadingState,
  Screen,
  SectionHeader,
  Text,
  ZoneActionSheet,
  ZoneCard,
} from "@/src/components";
import { api, ApiError, type PublicZone } from "@/lib/api/client";
import type { ZoneAction } from "@/src/components/ZoneActionSheet";
import { activeAssignmentFrom } from "@/lib/assignment";
import { currentReservationFrom } from "@/lib/current";
import { formatDateTime, plural } from "@/lib/format";
import { queryKeys } from "@/lib/query";
import { useConnectionLabel } from "@/src/providers/RealtimeStatusProvider";
import { spacing } from "@/src/theme";

/**
 * Zones: tap a zone and a sheet rises with the whole decision — "Go to this
 * zone" (an assignment — keeps no space) or "Reserve a space" (a reservation —
 * keeps one space for its window) — and the one button that finishes it. The backend's least-occupied zone is tagged "Least busy" in the
 * list. What the driver has already committed to lives on the Now tab; zone
 * selection is gated on it (no second plan while one is current).
 */
export default function ParkScreen() {
  const router = useRouter();
  // Zone detail's "Choose this zone" opens this tab with `?zone=<id>`.
  const { zone: zoneParam, change } = useLocalSearchParams<{ zone?: string; change?: string }>();
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(
    typeof zoneParam === "string" ? zoneParam : null,
  );
  // The tab stays mounted, so a later hand-over changes the param in place:
  // adopt it during render (React's "adjust state on prop change" pattern).
  const [handedZone, setHandedZone] = useState(zoneParam);
  if (zoneParam !== handedZone) {
    setHandedZone(zoneParam);
    if (typeof zoneParam === "string") {
      setSelectedZoneId(zoneParam);
    }
  }
  // Go now is the frequent case, so it is the default (frequency of use).
  const [actionMode, setActionMode] = useState<ZoneAction>("assign");
  const zones = useQuery({
    queryKey: queryKeys.zones,
    queryFn: api.zones,
    refetchInterval: 30_000,
  });
  const connection = useConnectionLabel(zones.dataUpdatedAt);
  // Global least-occupied active zone (services/api/src/domain/zones.ts) —
  // not personal, so it is labelled "Least busy", never "recommended for you".
  const leastBusy = useQuery({
    queryKey: queryKeys.recommendation,
    queryFn: api.recommendedZone,
    refetchInterval: 30_000,
  });
  const leastBusyId = leastBusy.data?.recommendedZone?.id ?? null;
  const active = useQuery({
    queryKey: queryKeys.activeSession,
    queryFn: api.activeSession,
    refetchInterval: 15_000,
  });
  const assignmentList = useQuery({
    queryKey: queryKeys.assignments,
    queryFn: api.assignments,
  });
  const reservationList = useQuery({
    queryKey: queryKeys.reservations,
    queryFn: api.reservations,
  });

  const activeSession = active.data ?? null;
  const refreshing = zones.isFetching || active.isFetching;
  const refresh = () => {
    void zones.refetch();
    void active.refetch();
    void assignmentList.refetch();
    void reservationList.refetch();
  };

  const assignment = activeAssignmentFrom(assignmentList.data);
  const reservation = currentReservationFrom(reservationList.data);
  const hasCurrentState = activeSession !== null || assignment !== null || reservation !== null;
  // Now › Change zone opens Zones with ?change=1: while only an assignment is
  // current (no session, no reservation), zones are choosable again and the
  // sheet swaps the assignment.
  const changing = change === "1" && assignment !== null && activeSession === null && reservation === null;
  const locked = hasCurrentState && !changing;
  const finish = () => {
    setSelectedZoneId(null);
    router.setParams({ change: undefined });
    router.push("/parking");
  };
  // One plan at a time: a selection made before a plan existed must not survive it.
  const leastBusyZone =
    zones.data?.find((zone) => zone.id === leastBusyId && zone.status === "ACTIVE" && zone.availableCount > 0) ?? null;
  const selectedZone = locked
    ? null
    : (zones.data?.find((zone) => zone.id === selectedZoneId) ?? null);

  return (
    <Screen
      title="Zones"
      subtitle={connection}
      refreshing={refreshing}
      onRefresh={refresh}
      testID="park-screen">
      {changing && assignment ? (
        <View style={styles.parkingAction} testID="zones-changing">
          <FormAlert
            tone="notice"
            message={`Pick a new zone. ${assignment.zone.name} stays yours until you confirm.`}
            testID="zones-changing-notice"
          />
          <Button
            variant="secondary"
            size="sm"
            title={`Keep ${assignment.zone.name}`}
            onPress={finish}
            testID="zones-changing-keep"
          />
        </View>
      ) : null}
      {zones.data && zones.data.length > 0 ? (
        <SectionHeader
          title={`${zones.data.filter((z) => z.status === "ACTIVE" && z.availableCount > 0).length} of ${plural(zones.data.length, "zone")} open`}
          testID="zones-header"
        />
      ) : null}
      {zones.isPending ? (
        <LoadingState label="Loading zones…" testID="zones-loading" />
      ) : zones.isError ? (
        <ErrorState
          message={zones.error instanceof ApiError ? zones.error.message : "Couldn't load zone availability."}
          onRetry={refresh}
          testID="zones-error"
        />
      ) : zones.data && zones.data.length === 0 ? (
        <EmptyState
          illustration="zones"
          title="No zones yet"
          description="There are no parking zones configured."
          testID="zones-empty"
        />
      ) : (
        <View style={styles.list} testID="zones-grid">
          {leastBusyZone && !locked && selectedZoneId !== leastBusyZone.id && leastBusyZone.id !== (changing ? assignment?.zoneId : null) ? (
            <Card padding={spacing.xl} testID="zones-least-busy-card">
              <View style={styles.leastRow}>
                <View style={styles.leastText}>
                  <Text variant="caption">Least busy now</Text>
                  <Text variant="bodySemi" numberOfLines={1}>
                    {leastBusyZone.name} · {leastBusyZone.availableCount} free
                  </Text>
                </View>
                <Button
                  variant="secondary"
                  size="sm"
                  title="Choose"
                  accessibilityLabel={`Choose ${leastBusyZone.name}`}
                  onPress={() => setSelectedZoneId(leastBusyZone.id)}
                  testID="zones-least-busy-choose"
                />
              </View>
            </Card>
          ) : null}
          {(zones.data ?? []).map((zone: PublicZone) => (
            <ZoneCard
              key={zone.id}
              zone={zone}
              onPress={locked || (changing && zone.id === assignment?.zoneId) ? null : () => setSelectedZoneId(zone.id)}
              selected={!locked && selectedZoneId === zone.id}
              leastBusy={zone.id === leastBusyId}
              testID={`zone-${zone.code}`}
            />
          ))}
        </View>
      )}
      {activeSession || changing ? null : assignment || reservation ? (
        <View style={styles.parkingAction}>
          <FormAlert
            tone="notice"
            message={
              reservation
                ? `Reserved ${reservation.zone.name}. Space kept ${formatDateTime(reservation.startAt)} – ${formatDateTime(reservation.endAt)}.`
                : `You're assigned to ${assignment?.zone.name}. No space is kept. See Now to cancel.`
            }
            testID="zones-current-plan"
          />
          <Button
            variant="secondary"
            size="sm"
            title="Open Now"
            accessibilityLabel="Open Now to see or cancel your current plan"
            onPress={() => router.push("/parking")}
            testID="zones-open-now"
          />
        </View>
      ) : null}
      {/* Tap a zone → the sheet holds the whole decision: choose, finish, done. */}
      <ZoneActionSheet
        zone={selectedZone}
        mode={actionMode}
        onModeChange={setActionMode}
        onClose={() => setSelectedZoneId(null)}
        onDone={finish}
        replacing={changing ? assignment : null}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.md,
  },
  leastRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  leastText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  parkingAction: {
    gap: spacing.xl,
  },
});
