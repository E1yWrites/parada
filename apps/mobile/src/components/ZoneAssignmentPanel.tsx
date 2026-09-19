import { StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "./Button";
import { Card } from "./Card";
import { PlateChip } from "./PlateChip";
import { SectionHeader } from "./SectionHeader";
import { Text } from "./Text";
import { VehiclePicker, useVehicleSelection } from "./VehicleSelection";
import { api, ApiError, type CreateAssignmentInput, type PublicZone } from "@/lib/api/client";
import { activeAssignmentFrom, upsertAssignment } from "@/lib/assignment";
import type { ZoneAssignmentResponse } from "@parada/types";
import { queryKeys } from "@/lib/query";
import { colors, spacing } from "@/src/theme";

type ZoneAssignmentPanelProps = {
  /** Zone the user picked in the zones grid (live data from the zones query). */
  selectedZone: PublicZone | null;
};

/**
 * Manual zone assignment (Phase 9.3): the user explicitly selects a zone and a
 * registered vehicle, then submits POST /assignments. Selection is local UI
 * state only — an assignment is confirmed exclusively by a backend response.
 * A full zone can never be submitted, and an existing ACTIVE assignment is
 * shown as backend-confirmed without offering another assignment request.
 */
export function ZoneAssignmentPanel({ selectedZone }: ZoneAssignmentPanelProps) {
  const queryClient = useQueryClient();
  const selection = useVehicleSelection();

  const assignments = useQuery({ queryKey: queryKeys.assignments, queryFn: api.assignments });

  const assign = useMutation({
    mutationFn: (input: CreateAssignmentInput) => api.createAssignment(input),
    onSuccess: (confirmed) => {
      // Backend-confirmed POST /assignments response → canonical cache, so the
      // screen's current-state derivation reflects it in the same commit and
      // never shows a "No active parking" empty state underneath it.
      void queryClient.setQueryData(queryKeys.assignments, (old: ZoneAssignmentResponse[] | undefined) =>
        upsertAssignment(old, confirmed),
      );
    },
    onSettled: () => {
      // Refreshes zones and (via the ["zones"] prefix) recommendations too.
      void queryClient.invalidateQueries({ queryKey: queryKeys.zones });
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments });
    },
  });

  const confirmedAssignment = assign.data ?? activeAssignmentFrom(assignments.data);

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

  let buttonTitle = "Assign to Zone";
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
    ? `Assign ${selectedVehicle?.plateNumber} to ${selectedZone?.name}.`
    : buttonTitle;

  const assignmentError = (() => {
    if (!assign.isError || !(assign.error instanceof ApiError)) {
      return assign.isError ? "We couldn't assign this zone. Please try again." : null;
    }
    if (assign.error.code === "NETWORK" || assign.error.code === "TIMEOUT") {
      return "We couldn't connect to the parking service. Please try again.";
    }
    if (assign.error.code === "CONFLICT") {
      if (assign.error.message.toLowerCase().includes("cannot accept assignments")) {
        return "This zone is no longer available. Please choose another zone.";
      }
      if (assign.error.message.toLowerCase().includes("already has an active zone assignment")) {
        return "This vehicle already has an assigned zone.";
      }
    }
    return assign.error.message;
  })();

  return (
    <View style={styles.panel} testID="assignment-panel">
      <SectionHeader
        title={confirmedAssignment ? "You have an assignment" : "Assign a vehicle"}
        caption={
          confirmedAssignment
            ? "See it under Current parking above"
            : "Select a zone, then choose a vehicle"
        }
        testID="assignment-header"
      />

      {confirmedAssignment ? (
        <Text variant="caption" color={colors.muted} testID="assignment-already-assigned">
          Cancel it from Current parking to choose a different zone.
        </Text>
      ) : (
        <Card style={styles.body} testID="assignment-body">
          {selectedZone === null ? (
            <Text variant="caption" color={colors.muted} testID="assignment-zone-hint">
              Select a parking zone above.
            </Text>
          ) : zoneUnavailable ? (
            <Text variant="body" color={colors.danger} testID="assignment-zone-full">
              This zone is now full. Please choose another zone.
            </Text>
          ) : (
            <Card tone="tinted" testID="assignment-summary" style={styles.summary}>
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
            testIDPrefix="assignment"
            chooseLabel="CHOOSE VEHICLE"
            chooseHint="Choose a vehicle to assign."
            emptyPrompt="Add a vehicle first to assign a zone."
          />

          {assign.isError ? (
            <Text variant="body" color={colors.danger} testID="assignment-error">
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
        </Card>
      )}
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
