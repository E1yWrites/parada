import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "./Button";
import { ChoiceChip } from "./ChoiceChip";
import { ErrorState, LoadingState } from "./StateComponents";
import { Text } from "./Text";
import { api, ApiError } from "@/lib/api/client";
import type { Vehicle } from "@parada/types";
import { isActiveVehicle } from "@/lib/assignment";
import { queryKeys } from "@/lib/query";
import { colors, spacing } from "@/src/theme";

type VehicleSelectionContextValue = {
  selectedVehicleId: string | null;
  setSelectedVehicleId: (id: string) => void;
};

const VehicleSelectionContext = createContext<VehicleSelectionContextValue | null>(null);

/**
 * Holds the vehicle the driver picked for the current parking action.
 *
 * The choice belongs to the act of parking, not to any one panel: recommendation,
 * manual assignment and reservation are three ways to start the same thing, so a
 * plate chosen in one is the plate the others use. Before this existed each panel
 * kept its own `useState`, and a driver with two vehicles had to pick the same
 * plate again in every panel on the screen.
 */
export function VehicleSelectionProvider({ children }: { children: ReactNode }) {
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const value = useMemo(
    () => ({ selectedVehicleId, setSelectedVehicleId }),
    [selectedVehicleId]
  );
  return (
    <VehicleSelectionContext.Provider value={value}>{children}</VehicleSelectionContext.Provider>
  );
}

export type VehicleSelection = {
  activeVehicles: Vehicle[];
  /** The only active vehicle, when there is exactly one. */
  soleVehicle: Vehicle | null;
  /** What an action should submit: the sole vehicle, or the explicit pick. */
  selectedVehicle: Vehicle | null;
  /** More than one vehicle and nothing chosen yet — an action cannot proceed. */
  needsVehicleChoice: boolean;
  select: (id: string) => void;
  isPending: boolean;
  isError: boolean;
  errorMessage: string;
  retry: () => void;
};

/**
 * One vehicles query and one derivation for every parking action. A single
 * active vehicle is used automatically; the driver is only ever asked to choose
 * when the choice is real.
 */
export function useVehicleSelection(): VehicleSelection {
  const context = useContext(VehicleSelectionContext);
  if (!context) {
    throw new Error("useVehicleSelection must be used inside a VehicleSelectionProvider.");
  }
  const { selectedVehicleId, setSelectedVehicleId } = context;
  const vehicles = useQuery({ queryKey: queryKeys.vehicles, queryFn: api.vehicles });

  const activeVehicles = (vehicles.data ?? []).filter(isActiveVehicle);
  const soleVehicle = activeVehicles.length === 1 ? (activeVehicles[0] ?? null) : null;
  // The sole vehicle wins over a stale id left from when the driver had more.
  const selectedVehicle =
    soleVehicle ?? activeVehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null;

  return {
    activeVehicles,
    soleVehicle,
    selectedVehicle,
    needsVehicleChoice: activeVehicles.length > 1 && selectedVehicle === null,
    select: setSelectedVehicleId,
    isPending: vehicles.isPending,
    isError: vehicles.isError,
    errorMessage:
      vehicles.error instanceof ApiError ? vehicles.error.message : "Couldn't load your vehicles.",
    retry: () => void vehicles.refetch(),
  };
}

type VehiclePickerProps = {
  selection: VehicleSelection;
  /** Prefix for this surface's testIDs, e.g. "assignment" or "reservation". */
  testIDPrefix: string;
  /** Shown above the chips when the driver has a real choice to make. */
  chooseLabel: string;
  /** Shown when nothing is chosen yet, e.g. "Choose a vehicle to assign." */
  chooseHint: string;
  /** Shown when the driver has no vehicle to park, e.g. "…to assign a zone." */
  emptyPrompt: string;
  /** testID for the chip of each vehicle; defaults to `${prefix}-vehicle-${id}`. */
  chipTestID?: (vehicleId: string) => string;
};

/**
 * The vehicle chooser for one parking action. Rendered at the point of the
 * action rather than standing permanently on the home screen: a driver browsing
 * zone availability is not being asked which car they are in.
 */
export function VehiclePicker({
  selection,
  testIDPrefix,
  chooseLabel,
  chooseHint,
  emptyPrompt,
  chipTestID,
}: VehiclePickerProps) {
  const router = useRouter();
  const { activeVehicles, soleVehicle, selectedVehicle, needsVehicleChoice } = selection;

  if (selection.isPending) {
    return <LoadingState label="Loading your vehicles…" testID={`${testIDPrefix}-vehicles-loading`} />;
  }
  if (selection.isError) {
    return (
      <ErrorState
        message={selection.errorMessage}
        onRetry={selection.retry}
        testID={`${testIDPrefix}-vehicles-error`}
      />
    );
  }
  if (activeVehicles.length === 0) {
    return (
      <View style={styles.noVehicle} testID={`${testIDPrefix}-no-vehicle`}>
        <Text variant="body">{emptyPrompt}</Text>
        <Button
          variant="secondary"
          title="Add a vehicle"
          onPress={() => router.push("/vehicles")}
          testID={`${testIDPrefix}-add-vehicle`}
        />
      </View>
    );
  }

  return (
    <View style={styles.vehicleBlock} testID={`${testIDPrefix}-vehicles`}>
      {activeVehicles.length > 1 ? (
        <>
          <Text variant="micro">{chooseLabel}</Text>
          <View style={styles.vehicleRow}>
            {activeVehicles.map((vehicle) => (
              <ChoiceChip
                key={vehicle.id}
                label={vehicle.plateNumber}
                mono
                selected={vehicle.id === selectedVehicle?.id}
                accessibilityLabel={`Use vehicle ${vehicle.plateNumber}`}
                onPress={() => selection.select(vehicle.id)}
                testID={chipTestID ? chipTestID(vehicle.id) : `${testIDPrefix}-vehicle-${vehicle.id}`}
              />
            ))}
          </View>
          {needsVehicleChoice ? (
            <Text variant="caption" testID={`${testIDPrefix}-vehicle-hint`}>
              {chooseHint}
            </Text>
          ) : null}
        </>
      ) : (
        <Text variant="caption" color={colors.muted} testID={`${testIDPrefix}-vehicle`}>
          Vehicle {soleVehicle?.plateNumber}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
});
