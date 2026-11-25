import { StyleSheet, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "./Button";
import { Card } from "./Card";
import { PlateChip } from "./PlateChip";
import { Text } from "./Text";
import { VehiclePicker, useVehicleSelection } from "./VehicleSelection";
import { api, type CreateAssignmentInput, type PublicZone } from "@/lib/api/client";
import { ASSIGNMENT_TERMS, upsertAssignment } from "@/lib/assignment";
import type { ZoneAssignmentResponse } from "@parada/types";
import { plural } from "@/lib/format";
import { parkingErrorMessage } from "@/lib/parkingErrors";
import { queryKeys } from "@/lib/query";
import { spacing } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";

type ZoneAssignmentPanelProps = {
  /** Zone the user picked in the zones grid (live data from the zones query). */
  selectedZone: PublicZone | null;
  /** Inside the zone sheet: no card and no zone summary (the sheet header already names the zone). */
  bare?: boolean;
  /** Change zone: release this assignment first, then assign the new zone. */
  replaceAssignmentId?: string | null;
  /** Called once the assignment is confirmed (the Zones sheet returns to Now). */
  onDone?: () => void;
};

/**
 * "Go to this zone" (POST /assignments): the driver picks a zone and a vehicle
 * and the backend records that zone as the car's destination for a short
 * window. It keeps NO space — only a reservation protects capacity
 * (services/api/src/domain/reservation.ts) — and at a camera gate, entering
 * another zone records a wrong-zone warning, then a fined violation
 * (occupancy.ts / violations.ts; the fine is establishment-configured, so no
 * amount is written here). Selection is local UI state; the assignment is
 * confirmed only by the backend response. A full zone can never be submitted.
 */
export function ZoneAssignmentPanel({ selectedZone, bare = false, replaceAssignmentId = null, onDone }: ZoneAssignmentPanelProps) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const selection = useVehicleSelection();

  const assign = useMutation({
    // Changing zone is the two existing backend calls in order — release, then
    // assign — so one plan per driver holds. If the second call fails the old
    // assignment is already released; the error says so and Now shows the truth.
    mutationFn: async (input: CreateAssignmentInput) => {
      if (replaceAssignmentId) await api.cancelAssignment(replaceAssignmentId);
      return api.createAssignment(input);
    },
    onSuccess: (confirmed) => {
      // Backend-confirmed POST /assignments response → canonical cache, so the
      // screen's current-state derivation reflects it in the same commit and
      // never shows a "No active parking" empty state underneath it.
      void queryClient.setQueryData(queryKeys.assignments, (old: ZoneAssignmentResponse[] | undefined) =>
        upsertAssignment(old, confirmed),
      );
      onDone?.();
    },
    onSettled: () => {
      // Refreshes zones and (via the ["zones"] prefix) recommendations too.
      void queryClient.invalidateQueries({ queryKey: queryKeys.zones });
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments });
    },
  });

  const { activeVehicles, selectedVehicle } = selection;

  const zoneUnavailable = selectedZone !== null && selectedZone.availableCount <= 0;
  const canSubmit =
    selectedZone !== null && selectedVehicle !== null && !zoneUnavailable && !assign.isPending;

  function handleAssign() {
    if (assign.isPending || !selectedZone || !selectedVehicle || zoneUnavailable) {
      return;
    }
    assign.mutate({ zoneId: selectedZone.id, vehicleId: selectedVehicle.id });
  }

  let buttonTitle = "Go here";
  if (selectedZone === null) {
    buttonTitle = "Select a zone";
  } else if (zoneUnavailable) {
    buttonTitle = "Select another zone";
  } else if (selectedVehicle === null) {
    buttonTitle = "Select a vehicle";
  }
  if (assign.isPending) {
    buttonTitle = "Assigning…";
  }

  const submitLabel = canSubmit
    ? `Go to ${selectedZone?.name} with ${selectedVehicle?.plateNumber}. No space is kept.`
    : buttonTitle;

  const assignmentError = assign.isError ? parkingErrorMessage(assign.error, "assign", selectedZone?.name) : null;

  const body = (
    <>
        {selectedZone === null ? (
          <Text variant="caption" color={colors.muted} testID="assignment-zone-hint">
            Choose a zone above.
          </Text>
        ) : zoneUnavailable ? (
          <Text variant="body" color={colors.danger} accessibilityLiveRegion="polite" testID="assignment-zone-full">
            This zone is now full. Please choose another zone.
          </Text>
        ) : bare ? null : (
          <Card tone="tinted" testID="assignment-summary" style={styles.summary}>
            <PlateChip value={selectedZone.code} />
            <View style={styles.summaryText}>
              <Text variant="title" numberOfLines={2}>
                {selectedZone.name}
              </Text>
              <Text variant="caption">{plural(selectedZone.availableCount, "space")} available</Text>
            </View>
          </Card>
        )}

        {selectedZone !== null && !zoneUnavailable ? (
          <Text variant="caption" color={colors.muted} testID="assignment-terms">
            {ASSIGNMENT_TERMS}
          </Text>
        ) : null}

        <VehiclePicker
          selection={selection}
          testIDPrefix="assignment"
          chooseLabel="CHOOSE VEHICLE"
          chooseHint="Choose a vehicle to assign."
          emptyPrompt="Add a vehicle first to assign a zone."
        />

        {assign.isError ? (
          <Text variant="body" color={colors.danger} accessibilityRole="alert" accessibilityLiveRegion="polite" testID="assignment-error">
            {assignmentError}
          </Text>
        ) : null}

        {activeVehicles.length > 0 ? (
          <Button
            title={buttonTitle}
            accessibilityLabel={submitLabel}
            onPress={handleAssign}
            loading={assign.isPending}
            disabled={!canSubmit}
            testID="assignment-submit"
          />
        ) : null}
    </>
  );

  return (
    <View style={styles.panel} testID="assignment-panel">

      {bare ? (
        <View style={styles.body} testID="assignment-body">{body}</View>
      ) : (
        <Card padding={spacing.xl2} style={styles.body} testID="assignment-body">{body}</Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.xl,
  },
  body: {
    gap: spacing.xl,
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
