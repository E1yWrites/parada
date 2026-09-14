import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "./Button";
import { Card } from "./Card";
import { ChoiceChip } from "./ChoiceChip";
import { PlateChip } from "./PlateChip";
import { EmptyState, ErrorState, LoadingState } from "./StateComponents";
import { SectionHeader } from "./SectionHeader";
import { Text } from "./Text";
import { ReservationCard } from "./ReservationCard";
import { api, ApiError, type PublicZone } from "@/lib/api/client";
import { isActiveVehicle } from "@/lib/assignment";
import { upsertReservation } from "@/lib/current";
import type { ReservationResponse } from "@parada/types";
import { queryKeys } from "@/lib/query";
import { colors, spacing } from "@/src/theme";

type ReservationPanelProps = {
  /** Zone the user picked on the grid (live data from the zones query). */
  selectedZone: PublicZone | null;
};

/**
 * Zone reservation (Phase 9.4). The user explicitly selects a registered
 * vehicle and confirms, then POST /reservations creates a CONFIRMED zone hold.
 * A reservation never assigns, starts a session or changes occupancy — the
 * backend tracks capacity protection. Everything shown here comes from the
 * backend response; nothing is optimistic. Cancellation is an explicit
 * two-tap acknowledgement against PATCH /reservations/:id/cancel.
 */
export function ReservationPanel({ selectedZone }: ReservationPanelProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  const vehicles = useQuery({ queryKey: queryKeys.vehicles, queryFn: api.vehicles });
  const reservations = useQuery({ queryKey: queryKeys.reservations, queryFn: api.reservations });

  const create = useMutation({
    mutationFn: (input: { zoneId: string; vehicleId: string }) =>
      api.createReservation({ ...input, startAt: new Date().toISOString() }),
    onSuccess: (confirmed) => {
      // POST /reservations is a backend-confirmed hold; write it into the
      // canonical list so the screen's current-state resolution sees it in the
      // same commit (and the reservation list below renders it exactly once —
      // the old create.data confirmation card is gone, keeping a single source
      // of truth).
      void queryClient.setQueryData(
        queryKeys.reservations,
        (old: ReservationResponse[] | undefined) => upsertReservation(old, confirmed),
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.reservations });
      // Zones refresh live availability and (via the ["zones"] prefix) the
      // recommendation card in one pass, without a duplicate refetch.
      void queryClient.invalidateQueries({ queryKey: queryKeys.zones });
    },
  });

  const cancel = useMutation({
    mutationFn: (id: string) => api.cancelReservation(id),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.reservations }),
  });

  const activeVehicles = (vehicles.data ?? []).filter(isActiveVehicle);
  const soleVehicle = activeVehicles.length === 1 ? activeVehicles[0] : null;
  const selectedVehicle =
    soleVehicle ?? activeVehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null;
  const needsVehicleChoice = activeVehicles.length > 1 && selectedVehicleId === null;

  const zoneUnavailable = selectedZone !== null && selectedZone.availableCount <= 0;
  const canCreate =
    selectedZone !== null && selectedVehicle !== null && !zoneUnavailable && !create.isPending;

  function handleCreate() {
    if (create.isPending || !selectedZone || !selectedVehicle || zoneUnavailable) {
      return;
    }
    create.mutate({ zoneId: selectedZone.id, vehicleId: selectedVehicle.id });
  }

  const createError = (() => {
    if (!create.isError || !(create.error instanceof ApiError)) {
      return create.isError ? "We couldn't make this reservation. Please try again." : null;
    }
    if (create.error.code === "NETWORK" || create.error.code === "TIMEOUT") {
      return "We couldn't connect to the parking service. Please try again.";
    }
    if (create.error.code === "CONFLICT") {
      return "This zone is no longer available for reservation. Please choose another zone.";
    }
    return "Something went wrong. Please try again.";
  })();

  const createLabel = (() => {
    if (selectedZone === null) {
      return "Select a zone";
    }
    if (zoneUnavailable) {
      return "Select another zone";
    }
    if (selectedVehicle === null) {
      return "Select a vehicle";
    }
    return `Reserve ${selectedVehicle?.plateNumber} in ${selectedZone?.name}`;
  })();

  const hasLiveReservation = (reservations.data ?? []).some(
    (reservation) =>
      reservation.status === "CONFIRMED" ||
      reservation.status === "PENDING" ||
      reservation.status === "ACTIVE",
  );

  return (
    <View testID="reservation-panel">
      <SectionHeader
        title="Reserve a spot"
        caption={
          hasLiveReservation
            ? "Secured by the parking service"
            : "Hold a zone for your arrival with a reservation"
        }
        testID="reservation-header"
      />

      {selectedZone === null ? (
        <Text variant="caption" color={colors.muted} testID="reservation-zone-hint">
          Select a parking zone above to reserve a spot.
        </Text>
      ) : zoneUnavailable ? (
        <Text variant="body" color={colors.danger} testID="reservation-zone-full">
          This zone is now full. Please choose another zone.
        </Text>
      ) : (
        <Card tone="tinted" testID="reservation-summary" style={styles.summary}>
          <PlateChip value={selectedZone.code} />
          <View style={styles.summaryText}>
            <Text variant="title" numberOfLines={2}>
              {selectedZone.name}
            </Text>
            <Text variant="caption">{selectedZone.availableCount} spaces available</Text>
          </View>
        </Card>
      )}

      {vehicles.isPending ? (
        <LoadingState label="Loading your vehicles…" testID="reservation-vehicles-loading" />
      ) : vehicles.isError ? (
        <ErrorState
          message={
            vehicles.error instanceof ApiError
              ? vehicles.error.message
              : "Couldn't load your vehicles."
          }
          testID="reservation-vehicles-error"
        />
      ) : activeVehicles.length === 0 ? (
        <View style={styles.noVehicle} testID="reservation-no-vehicle">
          <Text variant="body">Add a vehicle first to make a reservation.</Text>
          <Button
            variant="secondary"
            title="Add a vehicle"
            onPress={() => router.push("/vehicles")}
            testID="reservation-add-vehicle"
          />
        </View>
      ) : (
        <View style={styles.vehicleBlock} testID="reservation-vehicles">
          {activeVehicles.length > 1 ? (
            <>
              <Text variant="micro">CHOOSE VEHICLE</Text>
              <View style={styles.vehicleRow}>
                {activeVehicles.map((vehicle) => (
                  <ChoiceChip
                    key={vehicle.id}
                    label={vehicle.plateNumber}
                    mono
                    selected={vehicle.id === selectedVehicleId}
                    accessibilityLabel={`Use vehicle ${vehicle.plateNumber}`}
                    onPress={() => setSelectedVehicleId(vehicle.id)}
                    testID={`reservation-vehicle-${vehicle.id}`}
                  />
                ))}
              </View>
              {needsVehicleChoice ? (
                <Text variant="caption" testID="reservation-vehicle-hint">
                  Choose a vehicle to reserve with.
                </Text>
              ) : null}
            </>
          ) : (
            <Text variant="caption" color={colors.muted} testID="reservation-vehicle">
              Vehicle {soleVehicle?.plateNumber}
            </Text>
          )}
        </View>
      )}

      {create.isError ? (
        <Text variant="body" color={colors.danger} testID="reservation-error">
          {createError}
        </Text>
      ) : null}

      {activeVehicles.length > 0 ? (
        <Button
          title={create.isPending ? "Reserving…" : createLabel}
          accessibilityLabel={createLabel}
          onPress={handleCreate}
          loading={create.isPending}
          disabled={!canCreate}
          testID="reservation-create"
        />
      ) : null}

      <View style={styles.listHeader}>
        <SectionHeader title="My reservations" caption="Status from the parking service" testID="reservations-header" />
      </View>

      {reservations.isPending ? (
        <LoadingState label="Loading your reservations…" testID="reservations-loading" />
      ) : reservations.isError ? (
        <ErrorState
          message={
            reservations.error instanceof ApiError
              ? reservations.error.message
              : "Couldn't load your reservations."
          }
          onRetry={() => void reservations.refetch()}
          testID="reservations-error"
        />
      ) : reservations.data && reservations.data.length === 0 ? (
        <EmptyState
          illustration="reserve"
          title="No reservations yet"
          description="Reserve a spot above to hold capacity for your arrival."
          testID="reservations-empty"
        />
      ) : (
        <View style={styles.list} testID="reservations-list">
          {(reservations.data ?? []).map((reservation) => {
            const isCancelling = cancel.variables === reservation.id && cancel.isPending;
            return (
              <ReservationCard
                key={reservation.id}
                reservation={reservation}
                cancelling={isCancelling}
                onCancel={() => cancel.mutate(reservation.id)}
                testID={`reservation-${reservation.id}`}
              />
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  summaryText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  noVehicle: {
    gap: spacing.md,
  },
  vehicleBlock: {
    gap: spacing.md,
  },
  vehicleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  listHeader: {
    marginTop: spacing.xl,
  },
  list: {
    gap: spacing.xl,
  },
});
