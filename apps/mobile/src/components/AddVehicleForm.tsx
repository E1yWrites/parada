import { useState } from "react";
import { StyleSheet, Switch, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Vehicle, VehicleType } from "@parada/types";
import { api, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/query";
import { formatVehicleType, normalizePlateInput } from "@/lib/format";
import { spacing } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";
import { usePopups } from "@/src/providers/PopupProvider";
import { Button } from "./Button";
import { ChoiceChip } from "./ChoiceChip";
import { Input } from "./Input";
import { Text } from "./Text";

export const VEHICLE_TYPES: VehicleType[] = ["CAR", "MOTORCYCLE", "VAN", "TRUCK", "OTHER"];

type AddVehicleFormProps = {
  /** The driver has no active vehicle yet: the server makes this one primary, so the switch is on and locked. */
  isFirstVehicle: boolean;
  onAdded: (vehicle: Vehicle) => void;
  submitLabel?: string;
};

/**
 * Plate + type + optional details + the primary-vehicle switch. Creating has
 * no "primary" flag, so a switched-on later vehicle is created and then made
 * primary with the existing POST /vehicles/:id/primary.
 */
export function AddVehicleForm({ isFirstVehicle, onAdded, submitLabel = "Register vehicle" }: AddVehicleFormProps) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { showToast } = usePopups();
  const [plate, setPlate] = useState("");
  const [type, setType] = useState<VehicleType>("CAR");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [color, setColor] = useState("");
  const [makePrimary, setMakePrimary] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const primaryOn = isFirstVehicle || makePrimary;

  const mutation = useMutation({
    mutationFn: async (input: Parameters<typeof api.createVehicle>[0]) => {
      const created = await api.createVehicle(input);
      if (primaryOn && !created.isPrimary) {
        // The vehicle exists now; failing to make it primary must not turn a
        // retry into a duplicate-plate error, so report it as added.
        try {
          return { vehicle: await api.setPrimaryVehicle(created.id), primaryFailed: false };
        } catch {
          return { vehicle: created, primaryFailed: true };
        }
      }
      return { vehicle: created, primaryFailed: false };
    },
    onSuccess: ({ vehicle, primaryFailed }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles });
      setPlate("");
      setType("CAR");
      setMake("");
      setModel("");
      setColor("");
      setMakePrimary(false);
      setError(null);
      showToast({
        title: "Vehicle added",
        body: primaryFailed
          ? `Couldn't make ${vehicle.plateNumber} primary. Change it in Vehicles.`
          : vehicle.isPrimary
            ? `${vehicle.plateNumber} is your primary vehicle.`
            : undefined,
      });
      onAdded(vehicle);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Could not add vehicle.");
    },
  });

  const submit = () => {
    const cleaned = normalizePlateInput(plate);
    if (!cleaned) {
      setError("Enter a plate number.");
      return;
    }
    mutation.mutate({
      plateNumber: cleaned,
      vehicleType: type,
      make: make.trim() || null,
      model: model.trim() || null,
      color: color.trim() || null,
    });
  };

  return (
    <View style={styles.form}>
      <Input
        testID="vehicle-plate"
        label="Plate number"
        value={plate}
        onChangeText={setPlate}
        placeholder="ABC-1234"
        variant="mono"
        autoCapitalize="characters"
        error={error}
        onSubmit={submit}
        returnKeyType="done"
      />
      <View style={styles.typeBlock}>
        <Text variant="micro">VEHICLE TYPE</Text>
        <View style={styles.typeRow}>
          {VEHICLE_TYPES.map((t) => (
            <ChoiceChip
              key={t}
              label={formatVehicleType(t)}
              selected={t === type}
              accessibilityRole="button"
              onPress={() => setType(t)}
              testID={`vehicle-type-${t}`}
            />
          ))}
        </View>
      </View>
      <Input testID="vehicle-make" label="Make (optional)" value={make} onChangeText={setMake} placeholder="Toyota" autoCapitalize="words" maxLength={40} />
      <Input testID="vehicle-model" label="Model (optional)" value={model} onChangeText={setModel} placeholder="Vios" autoCapitalize="words" maxLength={40} />
      <Input testID="vehicle-color" label="Color (optional)" value={color} onChangeText={setColor} placeholder="Silver" autoCapitalize="words" maxLength={30} />
      <View style={[styles.primaryRow, { backgroundColor: colors.surfaceElevated }]}>
        <View style={styles.primaryText}>
          <Text variant="bodySemi">{isFirstVehicle ? "Primary vehicle" : "Make this my primary vehicle"}</Text>
          <Text variant="caption">
            {isFirstVehicle
              ? "Your first vehicle is primary. It's preselected whenever you park."
              : "Primary is preselected when you go or reserve."}
          </Text>
        </View>
        <Switch
          testID="vehicle-primary-switch"
          value={primaryOn}
          disabled={isFirstVehicle}
          onValueChange={setMakePrimary}
          trackColor={{ true: colors.success, false: colors.disabledSurface }}
          accessibilityLabel={isFirstVehicle ? "Primary vehicle (your first vehicle is always primary)" : "Make this my primary vehicle"}
        />
      </View>
      <Button
        testID="vehicle-submit"
        title={mutation.isPending ? "Registering…" : submitLabel}
        loading={mutation.isPending}
        onPress={submit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.xl },
  typeBlock: { gap: spacing.md },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  primaryRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg, padding: spacing.lg, borderRadius: 16 },
  primaryText: { flex: 1, minWidth: 0, gap: 2 },
});
