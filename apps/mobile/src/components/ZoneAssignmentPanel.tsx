import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "./Button";
import { Card } from "./Card";
import { ErrorState, LoadingState } from "./StateComponents";
import { SectionHeader } from "./SectionHeader";
import { Text } from "./Text";
import { api, ApiError, type CreateAssignmentInput, type PublicZone } from "@/lib/api/client";
import { activeAssignmentFrom, isActiveVehicle, upsertAssignment } from "@/lib/assignment";
import type { ZoneAssignmentResponse } from "@parada/types";
import { queryKeys } from "@/lib/query";
import { colors, radii, spacing, touchTarget } from "@/src/theme";

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
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  const vehicles = useQuery({ queryKey: queryKeys.vehicles, queryFn: api.vehicles });
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

  const activeVehicles = (vehicles.data ?? []).filter(isActiveVehicle);
  const soleVehicle = activeVehicles.length === 1 ? activeVehicles[0] : null;
  const selectedVehicle =
    soleVehicle ?? activeVehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null;
  const needsVehicleChoice = activeVehicles.length > 1 && selectedVehicleId === null;

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
    <View testID="assignment-panel">
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
          You already have an assigned zone. See it under Current parking above.
        </Text>
      ) : (
        <>
          {selectedZone === null ? (
            <Text variant="caption" color={colors.muted} testID="assignment-zone-hint">
              Select a parking zone above.
            </Text>
          ) : zoneUnavailable ? (
            <Text variant="body" color={colors.danger} testID="assignment-zone-full">
              This zone is now full. Please choose another zone.
            </Text>
          ) : (
            <Card testID="assignment-summary">
              <Text variant="micro" color={colors.highlight}>
                SELECTED ZONE
              </Text>
              <Text variant="title">{selectedZone.name}</Text>
              <Text variant="mono" color={colors.muted}>
                {selectedZone.code}
              </Text>
              <Text variant="caption" color={colors.muted}>
                {selectedZone.availableCount} spaces available
              </Text>
            </Card>
          )}

          {vehicles.isPending ? (
            <LoadingState label="Loading your vehicles…" testID="assignment-vehicles-loading" />
          ) : vehicles.isError ? (
            <ErrorState
              message={
                vehicles.error instanceof ApiError
                  ? vehicles.error.message
                  : "Couldn't load your vehicles."
              }
              testID="assignment-vehicles-error"
            />
          ) : activeVehicles.length === 0 ? (
            <View style={styles.noVehicle} testID="assignment-no-vehicle">
              <Text variant="body">Add a vehicle first to assign a zone.</Text>
              <Button
                variant="secondary"
                title="Add a vehicle"
                onPress={() => router.push("/vehicles")}
                testID="assignment-add-vehicle"
              />
            </View>
          ) : (
            <View style={styles.vehicleBlock} testID="assignment-vehicles">
              {activeVehicles.length > 1 ? (
                <>
                  <Text variant="micro" style={styles.vehicleLabel}>
                    CHOOSE VEHICLE
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
                          testID={`assignment-vehicle-${vehicle.id}`}>
                          <Text
                            variant="mono"
                            color={chosen ? colors.onAccent : colors.foreground}>
                            {vehicle.plateNumber}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {needsVehicleChoice ? (
                    <Text variant="caption" color={colors.muted} testID="assignment-vehicle-hint">
                      Choose a vehicle to assign.
                    </Text>
                  ) : null}
                </>
              ) : (
                <Text variant="caption" color={colors.muted} testID="assignment-vehicle">
                  Vehicle {soleVehicle?.plateNumber}
                </Text>
              )}
            </View>
          )}

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
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  noVehicle: {
    gap: spacing.md,
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