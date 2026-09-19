import { StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "./Button";
import { CapacityBar } from "./CapacityBar";
import { GlassCard } from "./GlassCard";
import { Metric } from "./Metric";
import { NavigateButton } from "./NavigateButton";
import { PlateChip } from "./PlateChip";
import { SectionHeader } from "./SectionHeader";
import { Stamp } from "./Stamp";
import { EmptyState, ErrorState, LoadingState } from "./StateComponents";
import { Text } from "./Text";
import { VehiclePicker, useVehicleSelection } from "./VehicleSelection";
import { api, ApiError, type CreateAssignmentInput } from "@/lib/api/client";
import { activeAssignmentFrom, upsertAssignment } from "@/lib/assignment";
import type { ZoneAssignmentResponse } from "@parada/types";
import { ZONE_NAVIGATION_UNCONFIGURED, type NavigationDestination } from "@/lib/navigation";
import { queryKeys } from "@/lib/query";
import { colors, spacing } from "@/src/theme";

/**
 * Recommended-zone + accept-recommendation flow (Phase 9.2).
 *
 * The recommendation comes straight from the backend (GET /zones/recommendation)
 * and is NOT an assignment: the user must explicitly accept it, which triggers
 * POST /assignments{zoneId,vehicleId}. Assigned state is only ever shown after
 * the backend confirms the assignment (mutation result) or an ACTIVE assignment
 * already exists in the assignments list.
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
  const queryClient = useQueryClient();
  const selection = useVehicleSelection();

  const assignments = useQuery({ queryKey: queryKeys.assignments, queryFn: api.assignments });
  const recommendation = useQuery({
    queryKey: queryKeys.recommendation,
    queryFn: api.recommendedZone,
    refetchInterval: 30_000,
  });

  const assign = useMutation({
    mutationFn: (input: CreateAssignmentInput) => api.createAssignment(input),
    onSuccess: (confirmed) => {
      // The POST response is backend-confirmed state. Writing it into the
      // assignments cache makes current-state resolution see it immediately,
      // so the screen never shows a contradictory "no current parking" empty
      // state while this assignment is real.
      void queryClient.setQueryData(queryKeys.assignments, (old: ZoneAssignmentResponse[] | undefined) =>
        upsertAssignment(old, confirmed),
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.recommendation });
      void queryClient.invalidateQueries({ queryKey: queryKeys.zones });
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments });
    },
  });

  const recommended = recommendation.data?.recommendedZone ?? null;
  const confirmedAssignment =
    assign.data ?? activeAssignmentFrom(assignments.data);
  // Directions target the assigned zone's own admin-configured coordinates.
  const navigationDestination = confirmedAssignment ? destinationFor(confirmedAssignment.zoneId) : null;

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
    ? `Recommended ${recommended.name}. ${recommended.availableCount} spaces available. ${percent} percent occupied.`
    : "Recommended parking zone unavailable.";

  const retryRecommendation = () => {
    void recommendation.refetch();
  };

  const isUnavailable = isConflictError(recommendation.error);

  function handleAccept() {
    if (!recommended || !selectedVehicle) {
      return;
    }
    assign.mutate({ zoneId: recommended.id, vehicleId: selectedVehicle.id });
  }

  return (
    <View testID="parking-recommendation">
      <SectionHeader
        title={confirmedAssignment ? "Your assignment" : "Recommended for you"}
        caption={
          confirmedAssignment
            ? "Confirmed by the parking service"
            : "Suggestion only - does not reserve a spot"
        }
        testID="recommendation-header"
      />

      {confirmedAssignment ? (
        <GlassCard style={styles.card} testID="assignment-confirmed">
          <Stamp label="ZONE ASSIGNED" icon="location" color={colors.primary} />
          <Text variant="hero" numberOfLines={2} testID="assignment-zone-name">
            {confirmedAssignment.zone.name}
          </Text>
          <View style={styles.plateRow}>
            <PlateChip value={confirmedAssignment.zone.code} tone="soft" size="sm" testID="assignment-zone-code" />
            <Text variant="plate" testID="assignment-vehicle">
              {confirmedAssignment.vehicle.plateNumber}
            </Text>
          </View>
          {!destinationReady ? null : (
            <NavigateButton
              destination={navigationDestination}
              label="Navigate to assigned zone"
              primary
              unavailableMessage={ZONE_NAVIGATION_UNCONFIGURED}
              testID="assignment-navigate"
            />
          )}
        </GlassCard>
      ) : recommendation.isPending ? (
        <LoadingState label="Finding the best zone…" testID="recommendation-loading" />
      ) : recommendation.isError && !isUnavailable ? (
        <ErrorState
          message={
            recommendation.error instanceof ApiError
              ? recommendation.error.message
              : "Couldn't load a parking recommendation."
          }
          onRetry={retryRecommendation}
          testID="recommendation-error"
        />
      ) : isUnavailable || recommended === null ? (
        <EmptyState
          illustration="zones"
          title="No zones available"
          description="No suitable parking zone is currently available."
          testID="recommendation-empty">
          <Button
            variant="secondary"
            title="Retry"
            accessibilityLabel="Retry loading parking recommendation."
            onPress={retryRecommendation}
            testID="recommendation-empty-retry"
          />
        </EmptyState>
      ) : (
        <GlassCard style={styles.card} wash={colors.success} testID="recommendation-card">
          <View accessible accessibilityLabel={summary} testID="recommendation-zone" style={styles.zoneBlock}>
            <Stamp label="Recommended" icon="sparkles" color={colors.success} />
            <View style={styles.zoneRow}>
              <View style={styles.zoneText}>
                <Text variant="hero" numberOfLines={2}>
                  {recommended.name}
                </Text>
                <PlateChip value={recommended.code} tone="soft" size="sm" />
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
            chooseHint="Choose a vehicle to accept."
            emptyPrompt="Add a vehicle first to accept a recommendation."
            chipTestID={(vehicleId) => `vehicle-choice-${vehicleId}`}
          />

          {assign.isError ? (
            <Text variant="body" color={colors.danger} testID="assignment-error">
              {assign.error instanceof ApiError
                ? assign.error.message
                : "We couldn't assign this zone."}
            </Text>
          ) : null}

          {activeVehicles.length > 0 ? (
            <Button
              title="Use this zone"
              accessibilityLabel={`Use recommended ${recommended.name}.`}
              onPress={handleAccept}
              loading={assign.isPending}
              disabled={selectedVehicle === null}
              testID="accept-recommendation"
            />
          ) : null}
        </GlassCard>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.xl,
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
});
