import { StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Button } from "./Button";
import { Card } from "./Card";
import { FormAlert } from "./FormAlert";
import { PlateChip } from "./PlateChip";
import { SectionHeader } from "./SectionHeader";
import { Text } from "./Text";
import { VehiclePicker, useVehicleSelection } from "./VehicleSelection";
import { api, type CreateAssignmentInput, type PublicZone } from "@/lib/api/client";
import { ASSIGNMENT_TERMS, activeAssignmentFrom, upsertAssignment } from "@/lib/assignment";
import type { ZoneAssignmentResponse } from "@parada/types";
import { formatDateTime, plural } from "@/lib/format";
import { parkingErrorMessage } from "@/lib/parkingErrors";
import { queryKeys } from "@/lib/query";
import { spacing } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";

type ZoneAssignmentPanelProps = {
  /** Zone the user picked in the zones grid (live data from the zones query). */
  selectedZone: PublicZone | null;
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
export function ZoneAssignmentPanel({ selectedZone }: ZoneAssignmentPanelProps) {
  const colors = useColors();
  const router = useRouter();
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

  return (
    <View style={styles.panel} testID="assignment-panel">
      {confirmedAssignment ? (
        // An assignment is not parking and keeps no space: say exactly that.
        <FormAlert
          tone="notice"
          message={[
            `Assigned to ${confirmedAssignment.zone.name}.`,
            confirmedAssignment.expiresAt ? `Enter by ${formatDateTime(confirmedAssignment.expiresAt)}.` : null,
            "No space is kept for you.",
          ]
            .filter(Boolean)
            .join(" ")}
          testID="assignment-confirmed-notice"
        />
      ) : null}
      <SectionHeader
        title={confirmedAssignment ? "Assigned zone" : "Go to this zone"}
        caption={confirmedAssignment ? undefined : "No space is kept for you."}
        testID="assignment-header"
      />

      {confirmedAssignment ? (
        <View style={styles.assigned}>
          <Text variant="caption" color={colors.muted} testID="assignment-already-assigned">
            You already have an assigned zone. Cancel it before choosing another.
          </Text>
          <Button
            variant="secondary"
            size="sm"
            title="Open Now"
            accessibilityLabel="Open Now to see or cancel your assigned zone"
            onPress={() => router.push("/parking")}
            testID="assignment-open-now"
          />
        </View>
      ) : (
        <Card padding={spacing.xl2} style={styles.body} testID="assignment-body">
          {selectedZone === null ? (
            <Text variant="caption" color={colors.muted} testID="assignment-zone-hint">
              Choose a zone above.
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
    gap: spacing.xl,
  },
  body: {
    gap: spacing.xl,
  },
  assigned: {
    gap: spacing.md,
    alignItems: "flex-start",
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
