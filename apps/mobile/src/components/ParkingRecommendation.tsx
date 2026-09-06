import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "./Button";
import { CapacityBar } from "./CapacityBar";
import { GlassCard } from "./GlassCard";
import { Metric } from "./Metric";
import { NavigateButton } from "./NavigateButton";
import { SectionHeader } from "./SectionHeader";
import { EmptyState, ErrorState, LoadingState } from "./StateComponents";
import { Text } from "./Text";
import { api, ApiError, type CreateAssignmentInput } from "@/lib/api/client";
import { activeAssignmentFrom, isActiveVehicle, upsertAssignment } from "@/lib/assignment";
import type { ZoneAssignmentResponse } from "@parada/types";
import { resolveEstablishmentDestination } from "@/lib/navigation";
import { queryKeys } from "@/lib/query";
import { colors, radii, spacing, touchTarget } from "@/src/theme";

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

export function ParkingRecommendation() {
  const queryClient = useQueryClient();
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  const vehicles = useQuery({ queryKey: queryKeys.vehicles, queryFn: api.vehicles });
  const assignments = useQuery({ queryKey: queryKeys.assignments, queryFn: api.assignments });
  const recommendation = useQuery({
    queryKey: queryKeys.recommendation,
    queryFn: api.recommendedZone,
    refetchInterval: 30_000,
  });
  const establishment = useQuery({
    queryKey: queryKeys.establishment,
    queryFn: api.establishment,
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
  const navigationDestination = resolveEstablishmentDestination(establishment.data);

  const activeVehicles = (vehicles.data ?? []).filter(isActiveVehicle);
  const soleVehicle = activeVehicles.length === 1 ? activeVehicles[0] : null;
  const selectedVehicle =
    soleVehicle ?? activeVehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null;
  const needsVehicleChoice = activeVehicles.length > 1 && selectedVehicleId === null;

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
        caption="Based on current availability"
        testID="recommendation-header"
      />

      {confirmedAssignment ? (
        <GlassCard accent={colors.highlight} testID="assignment-confirmed">
          <Text variant="micro" color={colors.highlight}>
            ZONE ASSIGNED
          </Text>
          <Text variant="title" testID="assignment-zone-name">
            {confirmedAssignment.zone.name}
          </Text>
          <Text variant="mono" color={colors.muted} testID="assignment-zone-code">
            {confirmedAssignment.zone.code}
          </Text>
          <Text variant="caption" color={colors.muted} testID="assignment-vehicle">
            Vehicle {confirmedAssignment.vehicle.plateNumber}
          </Text>
          {establishment.isPending ? null : (
            <NavigateButton
              destination={navigationDestination}
              label="Navigate to assigned zone"
              testID="assignment-navigate"
            />
          )}
        </GlassCard>
      ) : recommendation.isPending ? (
        <LoadingState label="Finding the best zone…" testID="recommendation-loading" />
      ) : isUnavailable ? (
        <EmptyState
          icon="car-outline"
          title="No zones available"
          description="No suitable parking zone is currently available."
          testID="recommendation-empty">
          <Button
            variant="ghost"
            title="Retry"
            accessibilityLabel="Retry loading parking recommendation."
            onPress={retryRecommendation}
            testID="recommendation-empty-retry"
          />
        </EmptyState>
      ) : recommendation.isError ? (
        <ErrorState
          message={
            recommendation.error instanceof ApiError
              ? recommendation.error.message
              : "Couldn't load a parking recommendation."
          }
          onRetry={retryRecommendation}
          testID="recommendation-error"
        />
      ) : recommended === null ? (
        <EmptyState
          icon="car-outline"
          title="No zones available"
          description="No suitable parking zone is currently available."
          testID="recommendation-empty">
          <Button
            variant="ghost"
            title="Retry"
            accessibilityLabel="Retry loading parking recommendation."
            onPress={retryRecommendation}
            testID="recommendation-empty-retry"
          />
        </EmptyState>
      ) : (
        <GlassCard accent={colors.highlight} testID="recommendation-card">
          <View accessible accessibilityLabel={summary} testID="recommendation-zone">
            <View style={styles.zoneRow}>
              <View style={styles.zoneText}>
                <Text variant="title" numberOfLines={2}>
                  {recommended.name}
                </Text>
                <Text variant="mono" color={colors.muted}>
                  {recommended.code}
                </Text>
              </View>
              <View style={styles.percentBadge}>
                <Text variant="monoBold" color={colors.highlight}>
                  {percent}%
                </Text>
                <Text variant="micro" color={colors.muted}>
                  OCCUPIED
                </Text>
              </View>
            </View>
          </View>
          <CapacityBar
            occupied={recommended.occupiedCount}
            capacity={recommended.capacity}
            color={colors.highlight}
            testID="recommendation-occupancy"
          />
          <View style={styles.metrics}>
            <Metric
              label="Free"
              value={String(recommended.availableCount)}
              accent={colors.highlight}
              icon="car-outline"
              testID="recommendation-available"
            />
            <Metric
              label="Capacity"
              value={String(recommended.capacity)}
              accent={colors.muted}
              icon="grid-outline"
              testID="recommendation-capacity"
            />
          </View>

          {activeVehicles.length === 0 ? (
            <Text variant="caption" color={colors.muted} testID="recommendation-no-vehicle">
              Add a vehicle first to accept a recommendation.
            </Text>
          ) : activeVehicles.length > 1 ? (
            <View style={styles.vehicleBlock}>
              <Text variant="micro" style={styles.vehicleLabel}>
                ASSIGN VEHICLE
              </Text>
              <View style={styles.vehicleRow}>
                {activeVehicles.map((vehicle) => {
                  const chosen = vehicle.id === selectedVehicleId;
                  return (
                    <Pressable
                      key={vehicle.id}
                      accessibilityRole="radio"
                      accessibilityLabel={`Use vehicle ${vehicle.plateNumber}`}
                      accessibilityState={{ selected: chosen }}
                      onPress={() => setSelectedVehicleId(vehicle.id)}
                      style={[styles.vehicleChip, chosen && styles.vehicleChipSelected]}
                      testID={`vehicle-choice-${vehicle.id}`}>
                      <Text variant="mono" color={chosen ? colors.onAccent : colors.foreground}>
                        {vehicle.plateNumber}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {needsVehicleChoice ? (
                <Text variant="caption" color={colors.muted} testID="recommendation-vehicle-hint">
                  Choose a vehicle to accept.
                </Text>
              ) : null}
            </View>
          ) : (
            <Text variant="caption" color={colors.muted} testID="recommendation-vehicle">
              Vehicle {soleVehicle?.plateNumber}
            </Text>
          )}

          {assign.isError ? (
            <Text variant="body" color={colors.danger} testID="assignment-error">
              {assign.error instanceof ApiError
                ? assign.error.message
                : "We couldn't assign this zone."}
            </Text>
          ) : null}

          {activeVehicles.length > 0 ? (
            <Button
              title="Accept Recommendation"
              accessibilityLabel={`Accept recommended ${recommended.name}.`}
              onPress={handleAccept}
              loading={assign.isPending}
              disabled={needsVehicleChoice || selectedVehicle === null}
              testID="accept-recommendation"
            />
          ) : null}
        </GlassCard>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  zoneRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xl,
  },
  zoneText: {
    flex: 1,
    gap: spacing.xs,
  },
  percentBadge: {
    alignItems: "flex-end",
    gap: spacing.xs,
  },
  metrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xl2,
  },
  vehicleBlock: {
    gap: spacing.sm,
  },
  vehicleLabel: {
    letterSpacing: 0.8,
  },
  vehicleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  vehicleChip: {
    minHeight: touchTarget,
    minWidth: 88,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  vehicleChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
});