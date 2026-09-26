import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Button } from "./Button";
import { Card } from "./Card";
import { ChoiceChip } from "./ChoiceChip";
import { FormAlert } from "./FormAlert";
import { PlateChip } from "./PlateChip";
import { SectionHeader } from "./SectionHeader";
import { Text } from "./Text";
import { VehiclePicker, useVehicleSelection } from "./VehicleSelection";
import { api, type PublicZone } from "@/lib/api/client";
import { upsertReservation } from "@/lib/current";
import type { ReservationResponse } from "@parada/types";
import { formatClockTime, formatDateTime, plural } from "@/lib/format";
import { parkingErrorMessage } from "@/lib/parkingErrors";
import { queryKeys } from "@/lib/query";
import { spacing } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";

type ReservationPanelProps = {
  /** Zone the user picked on the grid (live data from the zones query). */
  selectedZone: PublicZone | null;
};

/**
 * When the driver will arrive. The API accepts any `startAt`
 * (services/api/src/routes/reservations.ts) and derives `endAt` from the
 * configured window, so the app offers a few honest presets instead of always
 * sending "now" under a "for later" label. No date-picker dependency.
 */
export const START_PRESETS = [
  { minutes: 0, label: "Now", testID: "reservation-start-now" },
  { minutes: 30, label: "In 30 min", testID: "reservation-start-30" },
  { minutes: 60, label: "In 1 hour", testID: "reservation-start-60" },
] as const;

/**
 * "Reserve a space" (Phase 9.4). The driver picks a vehicle and an arrival
 * time, then POST /reservations creates a reservation that protects one space
 * in the zone for its window. A reservation never assigns, starts a session or
 * changes occupancy. Everything shown after submit comes from the backend
 * response (its own startAt/endAt); nothing is optimistic.
 */
export function ReservationPanel({ selectedZone }: ReservationPanelProps) {
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const selection = useVehicleSelection();
  const [startInMinutes, setStartInMinutes] = useState<number>(0);

  const create = useMutation({
    // Only startAt is sent: the backend owns the window length (endAt).
    mutationFn: (input: { zoneId: string; vehicleId: string; startInMinutes: number }) =>
      api.createReservation({
        zoneId: input.zoneId,
        vehicleId: input.vehicleId,
        startAt: new Date(Date.now() + input.startInMinutes * 60_000).toISOString(),
      }),
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
    create.mutate({ zoneId: selectedZone.id, vehicleId: selectedVehicle.id, startInMinutes });
  }

  const createError = create.isError ? parkingErrorMessage(create.error, "reserve", selectedZone?.name) : null;
  const startPreview =
    startInMinutes === 0
      ? "A space is kept for you from now."
      : `A space is kept for you from ${formatClockTime(Date.now() + startInMinutes * 60_000)}.`;

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
        <View style={styles.confirmed}>
          <FormAlert
            tone="notice"
            message={`Reserved ${create.data.zone.name}. Space kept ${formatDateTime(create.data.startAt)} – ${formatDateTime(create.data.endAt)}.`}
            testID="reservation-confirmed-notice"
          />
          <Button
            variant="secondary"
            size="sm"
            title="Open Now"
            accessibilityLabel="Open Now to navigate to or cancel this reservation"
            onPress={() => router.push("/parking")}
            testID="reservation-open-now"
          />
        </View>
      ) : null}
      <SectionHeader
        title="Reserve a space"
        caption="Keeps one space for you from your arrival time."
        testID="reservation-header"
      />

      <Card style={styles.body} testID="reservation-body">
        {selectedZone === null ? (
          <Text variant="caption" color={colors.muted} testID="reservation-zone-hint">
            Choose a zone above to reserve a space.
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
              <Text variant="caption">{plural(selectedZone.availableCount, "space")} available</Text>
            </View>
          </Card>
        )}

        <View style={styles.start} testID="reservation-start">
          <Text variant="micro">ARRIVE</Text>
          <View style={styles.startRow} accessibilityRole="radiogroup">
            {START_PRESETS.map((preset) => (
              <ChoiceChip
                key={preset.minutes}
                label={preset.label}
                selected={startInMinutes === preset.minutes}
                accessibilityLabel={`Arrive ${preset.label.toLowerCase()}`}
                onPress={() => setStartInMinutes(preset.minutes)}
                testID={preset.testID}
              />
            ))}
          </View>
          <Text variant="caption" color={colors.muted} testID="reservation-start-preview">
            {startPreview}
          </Text>
        </View>

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
    gap: spacing.xl,
  },
  body: {
    gap: spacing.lg,
  },
  confirmed: {
    gap: spacing.md,
    alignItems: "flex-start",
  },
  start: {
    gap: spacing.sm,
  },
  startRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
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
