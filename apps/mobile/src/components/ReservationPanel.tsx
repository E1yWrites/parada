import { StyleSheet, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "./Button";
import { Card } from "./Card";
import { MascotCallout } from "./MascotCallout";
import { PlateChip } from "./PlateChip";
import { SectionHeader } from "./SectionHeader";
import { Text } from "./Text";
import { VehiclePicker, useVehicleSelection } from "./VehicleSelection";
import { api, ApiError, type PublicZone } from "@/lib/api/client";
import { upsertReservation } from "@/lib/current";
import type { ReservationResponse } from "@parada/types";
import { queryKeys } from "@/lib/query";
import { spacing } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";

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
  const colors = useColors();
  const queryClient = useQueryClient();
  const selection = useVehicleSelection();

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

  const { activeVehicles, selectedVehicle } = selection;

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

  return (
    <View style={styles.panel} testID="reservation-panel">
      {create.isSuccess && create.data ? (
        <MascotCallout
          variant="park"
          text={`Reserved ${create.data.zone.name} for you!`}
          testID="reservation-confirmed-mascot"
        />
      ) : null}
      <SectionHeader
        title="Reserve a spot"
        caption="Hold a zone for your arrival with a reservation"
        testID="reservation-header"
      />

      <Card style={styles.body} testID="reservation-body">
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

        <VehiclePicker
          selection={selection}
          testIDPrefix="reservation"
          chooseLabel="CHOOSE VEHICLE"
          chooseHint="Choose a vehicle to reserve with."
          emptyPrompt="Add a vehicle first to make a reservation."
        />

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
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.md,
  },
  body: {
    gap: spacing.lg,
  },
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
});
