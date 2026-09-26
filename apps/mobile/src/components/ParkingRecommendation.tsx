import { StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Button } from "./Button";
import { CapacityBar } from "./CapacityBar";
import { Card } from "./Card";
import { Metric } from "./Metric";
import { NavigateButton } from "./NavigateButton";
import { PlateChip } from "./PlateChip";
import { SectionHeader } from "./SectionHeader";
import { Stamp } from "./Stamp";
import { ReservationBadge } from "./StatusBadge";
import { EmptyState, ErrorState, LoadingState } from "./StateComponents";
import { Text } from "./Text";
import { VehiclePicker, useVehicleSelection } from "./VehicleSelection";
import { api, ApiError, type CreateReservationInput } from "@/lib/api/client";
import { currentReservationFrom, upsertReservation } from "@/lib/current";
import type { ReservationResponse } from "@parada/types";
import { formatDateTime, plural } from "@/lib/format";
import { ZONE_NAVIGATION_UNCONFIGURED, type NavigationDestination } from "@/lib/navigation";
import { queryKeys } from "@/lib/query";
import { radii, spacing } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";
import { withAlpha } from "@/src/theme/colors";

/**
 * Recommended-zone + accept-recommendation flow (Phase 9.2).
 *
 * The recommendation comes straight from the backend (GET /zones/recommendation)
 * and is NOT a reservation: the user must explicitly accept it, which triggers
 * POST /reservations{zoneId,vehicleId,startAt} — a capacity-protected hold,
 * matching the intended Recommendation → Reservation workflow (Recommendation ≠
 * Assignment ≠ Reservation ≠ Session; see CLAUDE.md). Reserved state is only
 * ever shown after the backend confirms the reservation (mutation result) or a
 * live reservation already exists in the reservations list. A driver who does
 * not want the recommended zone can back out to the Park tab's own zone rail
 * and reservation flow instead ("Choose another zone").
 */
/**
 * The backend returns `{ recommendedZone: null }` when nothing is suitable.
 * Older builds answered 409 instead, and the client is deployed independently
 * of the API, so both shapes resolve to the same friendly empty state.
 */
function isConflictError(err: unknown): boolean {
  return err instanceof ApiError && (err.code === "CONFLICT" || err.status === 409);
}

type ParkingRecommendationProps = {
  /** Per-zone destination resolver from the parent's zones query (null = not configured). */
  destinationFor?: (zoneId: string) => NavigationDestination | null;
  /** False while the zones query is still loading — the navigate action is withheld. */
  destinationReady?: boolean;
};

export function ParkingRecommendation({
  destinationFor = () => null,
  destinationReady = true,
}: ParkingRecommendationProps = {}) {
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const selection = useVehicleSelection();

  const reservations = useQuery({ queryKey: queryKeys.reservations, queryFn: api.reservations });
  const recommendation = useQuery({
    queryKey: queryKeys.recommendation,
    queryFn: api.recommendedZone,
    refetchInterval: 30_000,
  });

  const create = useMutation({
    mutationFn: (input: CreateReservationInput) => api.createReservation(input),
    onSuccess: (confirmed) => {
      // The POST response is backend-confirmed state. Writing it into the
      // reservations cache makes current-state resolution see it immediately,
      // so the screen never shows a contradictory "no current parking" empty
      // state while this reservation is real.
      void queryClient.setQueryData(queryKeys.reservations, (old: ReservationResponse[] | undefined) =>
        upsertReservation(old, confirmed),
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.recommendation });
      void queryClient.invalidateQueries({ queryKey: queryKeys.zones });
      void queryClient.invalidateQueries({ queryKey: queryKeys.reservations });
    },
  });

  const recommended = recommendation.data?.recommendedZone ?? null;
  const confirmedReservation =
    create.data ?? currentReservationFrom(reservations.data);
  // Directions target the reserved zone's own admin-configured coordinates.
  const navigationDestination = confirmedReservation ? destinationFor(confirmedReservation.zoneId) : null;

  const { activeVehicles, selectedVehicle } = selection;

  const hasCapacity =
    recommended !== null &&
    Number.isFinite(recommended.capacity) &&
    recommended.capacity > 0;
  const percent =
    hasCapacity && recommended !== null
      ? Math.round((recommended.occupiedCount / recommended.capacity) * 100)
      : 0;
  const summary = recommended
    ? `Least busy zone: ${recommended.name}. ${plural(recommended.availableCount, "space")} available. ${percent} percent occupied.`
    : "Least busy zone unavailable.";

  const retryRecommendation = () => {
    void recommendation.refetch();
  };

  const isUnavailable = isConflictError(recommendation.error);

  function handleAccept() {
    if (!recommended || !selectedVehicle) {
      return;
    }
    create.mutate({ zoneId: recommended.id, vehicleId: selectedVehicle.id, startAt: new Date().toISOString() });
  }

  function handleChooseAnother() {
    router.push("/(tabs)/park");
  }

  return (
    <View style={styles.section} testID="parking-recommendation">
      <SectionHeader
        // The pick is global — the active zone with the lowest occupied/capacity
        // ratio (services/api/src/domain/zones.ts) — not personal, not daily.
        title={confirmedReservation ? "Your reservation" : "Least busy zone"}
        caption={confirmedReservation ? "Confirmed by the parking service" : "Lowest occupancy right now"}
        testID="recommendation-header"
      />

      {confirmedReservation ? (
        <Card padding={spacing.xl2} style={styles.card} testID="reservation-confirmed">
          <View style={styles.headerRow}>
            <Stamp label="RESERVED" icon="calendar" color={colors.success} />
            <ReservationBadge status={confirmedReservation.status} testID="reservation-confirmed-badge" />
          </View>
          <Text variant="hero" numberOfLines={2} testID="reservation-confirmed-zone">
            {confirmedReservation.zone.name}
          </Text>
          <View style={styles.plateRow}>
            <PlateChip value={confirmedReservation.zone.code} tone="soft" size="sm" testID="reservation-confirmed-zone-code" />
            <Text variant="plate" testID="reservation-confirmed-vehicle">
              {confirmedReservation.vehicle.plateNumber}
            </Text>
          </View>
          <View style={[styles.windowBox, { backgroundColor: withAlpha(colors.surface, 0.7) }]}>
            <Ionicons name="time-outline" size={14} color={colors.success} />
            <Text variant="caption" color={colors.foreground} style={styles.inlineText} testID="reservation-confirmed-window">
              Space kept {formatDateTime(confirmedReservation.startAt)} – {formatDateTime(confirmedReservation.endAt)}
            </Text>
          </View>
          {!destinationReady ? null : (
            <NavigateButton
              destination={navigationDestination}
              label={`Navigate to ${confirmedReservation.zone.name}`}
              primary
              unavailableMessage={ZONE_NAVIGATION_UNCONFIGURED}
              testID="reservation-confirmed-navigate"
            />
          )}
        </Card>
      ) : recommendation.isPending ? (
        <LoadingState label="Loading…" testID="recommendation-loading" />
      ) : recommendation.isError && !isUnavailable ? (
        <ErrorState
          message={
            recommendation.error instanceof ApiError
              ? recommendation.error.message
              : "Couldn't load zone availability."
          }
          onRetry={retryRecommendation}
          testID="recommendation-error"
        />
      ) : isUnavailable || recommended === null ? (
        <EmptyState
          illustration="zones"
          title="No zones available"
          description="Every active zone is full, or no zone is open."
          testID="recommendation-empty">
          <Button
            variant="secondary"
            title="Retry"
            accessibilityLabel="Retry loading zone availability."
            onPress={retryRecommendation}
            testID="recommendation-empty-retry"
          />
        </EmptyState>
      ) : (
        <Card padding={spacing.xl2} style={styles.card} testID="recommendation-card">
          <View accessible accessibilityLabel={summary} testID="recommendation-zone" style={styles.zoneBlock}>
            <View style={styles.zoneRow}>
              <View style={styles.zoneText}>
                <Text variant="hero" numberOfLines={2}>
                  {recommended.name}
                </Text>
                <PlateChip value={recommended.code} tone="soft" />
              </View>
              <Metric
                label="Available"
                value={String(recommended.availableCount)}
                accent={colors.success}
                size="lg"
                testID="recommendation-available"
              />
            </View>
          </View>
          <CapacityBar
            occupied={recommended.occupiedCount}
            capacity={recommended.capacity}
            color={colors.success}
            testID="recommendation-occupancy"
          />

          <VehiclePicker
            selection={selection}
            testIDPrefix="recommendation"
            chooseLabel="CHOOSE VEHICLE"
            chooseHint="Choose a vehicle to reserve with."
            emptyPrompt="Add a vehicle first to reserve a space."
            chipTestID={(vehicleId) => `vehicle-choice-${vehicleId}`}
          />

          {create.isError ? (
            <Text variant="body" color={colors.danger} testID="reservation-error">
              {create.error instanceof ApiError
                ? create.error.message
                : "We couldn't reserve this zone."}
            </Text>
          ) : null}

          {activeVehicles.length > 0 ? (
            <View style={styles.actions}>
              <Button
                title={`Reserve a space in ${recommended.name}`}
                onPress={handleAccept}
                loading={create.isPending}
                disabled={selectedVehicle === null}
                testID="accept-recommendation"
              />
              <Button
                variant="ghost"
                title="See all zones"
                onPress={handleChooseAnother}
                testID="recommendation-choose-other"
              />
            </View>
          ) : null}
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.xl2,
  },
  card: {
    gap: spacing.xl,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  zoneBlock: {
    gap: spacing.md,
  },
  zoneRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.xl,
  },
  zoneText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.md,
  },
  plateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  windowBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radii.sm,
    borderTopRightRadius: radii.cut,
    padding: spacing.lg,
  },
  inlineText: {
    flexShrink: 1,
  },
  actions: {
    gap: spacing.md,
  },
});
