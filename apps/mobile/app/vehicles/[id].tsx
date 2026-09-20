import { useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Vehicle, VehicleType, VehicleUpdateInput } from "@parada/types";
import { Button, Card, ChoiceChip, EmptyState, ErrorState, Input, LoadingState, Screen, Text } from "@/src/components";
import { api, ApiError } from "@/lib/api/client";
import { formatVehicleType, normalizePlateInput } from "@/lib/format";
import { queryKeys } from "@/lib/query";
import { spacing } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";
import type { ColorTokens } from "@/src/theme/colors";

const VEHICLE_TYPES: VehicleType[] = ["CAR", "MOTORCYCLE", "VAN", "TRUCK", "OTHER"];

/**
 * Edit / unregister a registered vehicle. Plate changes and unregistration
 * are refused by the API while the vehicle is parked, assigned or reserved;
 * the message from the server is shown as-is.
 */
export default function VehicleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const vehicles = useQuery({ queryKey: queryKeys.vehicles, queryFn: api.vehicles });
  const vehicle = vehicles.data?.find((v) => v.id === id) ?? null;

  return (
    <Screen back keyboard title={vehicle?.plateNumber ?? "Vehicle"} subtitle="Edit details or unregister" testID="vehicle-detail-screen">
      {vehicles.isPending ? (
        <LoadingState label="Loading vehicle…" testID="vehicle-detail-loading" />
      ) : vehicles.isError ? (
        <ErrorState
          message={vehicles.error instanceof ApiError ? vehicles.error.message : "Couldn't load this vehicle."}
          onRetry={() => void vehicles.refetch()}
          testID="vehicle-detail-error"
        />
      ) : vehicle ? (
        <VehicleForm
          vehicle={vehicle}
          onSaved={(next) => {
            queryClient.setQueryData(queryKeys.vehicles, (old: Vehicle[] | undefined) =>
              (old ?? []).map((v) => (v.id === next.id ? next : v)),
            );
            void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles });
          }}
          onUnregistered={() => {
            queryClient.setQueryData(queryKeys.vehicles, (old: Vehicle[] | undefined) =>
              (old ?? []).filter((v) => v.id !== vehicle.id),
            );
            void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles });
            void queryClient.invalidateQueries({ queryKey: queryKeys.assignments });
            void queryClient.invalidateQueries({ queryKey: queryKeys.reservations });
            router.back();
          }}
        />
      ) : (
        // Not an error to retry — the vehicle is simply gone, so the only
        // honest action is going back, and it must not be labelled "Try again".
        <EmptyState
          illustration="vehicle"
          title="Vehicle not found"
          description="This vehicle is no longer registered."
          testID="vehicle-detail-missing">
          <Button
            variant="secondary"
            title="Back to vehicles"
            onPress={() => router.back()}
            testID="vehicle-detail-missing-back"
          />
        </EmptyState>
      )}
    </Screen>
  );
}

function VehicleForm({
  vehicle,
  onSaved,
  onUnregistered,
}: {
  vehicle: Vehicle;
  onSaved: (next: Vehicle) => void;
  onUnregistered: () => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => buildStyles(colors), [colors]);
  const [plate, setPlate] = useState(vehicle.plateNumber);
  const [type, setType] = useState<VehicleType>(vehicle.vehicleType);
  const [make, setMake] = useState(vehicle.make ?? "");
  const [model, setModel] = useState(vehicle.model ?? "");
  const [color, setColor] = useState(vehicle.color ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setPlate(vehicle.plateNumber);
    setType(vehicle.vehicleType);
    setMake(vehicle.make ?? "");
    setModel(vehicle.model ?? "");
    setColor(vehicle.color ?? "");
  }, [vehicle]);

  const save = useMutation({
    mutationFn: (input: VehicleUpdateInput) => api.updateVehicle(vehicle.id, input),
    onSuccess: (next) => {
      setError(null);
      setSaved(true);
      onSaved(next);
    },
    onError: (err) => {
      setSaved(false);
      setError(err instanceof ApiError ? err.message : "We couldn't save this vehicle. Please try again.");
    },
  });
  const unregister = useMutation({
    mutationFn: () => api.unregisterVehicle(vehicle.id),
    onSuccess: onUnregistered,
    onError: (err) => setError(err instanceof ApiError ? err.message : "We couldn't unregister this vehicle. Please try again."),
  });
  const makePrimary = useMutation({
    mutationFn: () => api.setPrimaryVehicle(vehicle.id),
    onSuccess: (next) => {
      setError(null);
      onSaved(next);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "We couldn't set this as your primary vehicle."),
  });

  const cleanedPlate = normalizePlateInput(plate);
  const dirty =
    cleanedPlate !== normalizePlateInput(vehicle.plateNumber) ||
    type !== vehicle.vehicleType ||
    (make.trim() || null) !== (vehicle.make ?? null) ||
    (model.trim() || null) !== (vehicle.model ?? null) ||
    (color.trim() || null) !== (vehicle.color ?? null);

  function submit() {
    if (!cleanedPlate) {
      setError("Enter a plate number.");
      return;
    }
    const input: VehicleUpdateInput = {
      vehicleType: type,
      make: make.trim() || null,
      model: model.trim() || null,
      color: color.trim() || null,
    };
    if (cleanedPlate !== normalizePlateInput(vehicle.plateNumber)) {
      input.plateNumber = plate.trim();
    }
    save.mutate(input);
  }

  function confirmUnregister() {
    Alert.alert(
      "Unregister vehicle?",
      `${vehicle.plateNumber} will no longer be recognised at the gate. Your parking history is kept.`,
      [
        { text: "Keep vehicle", style: "cancel" },
        { text: "Unregister", style: "destructive", onPress: () => unregister.mutate() },
      ],
    );
  }

  return (
    <>
      <Card style={styles.form} testID="vehicle-edit-form">
        <Input
          testID="vehicle-edit-plate"
          label="Plate number"
          value={plate}
          onChangeText={(v) => {
            setPlate(v);
            setSaved(false);
          }}
          placeholder="ABC-1234"
          variant="mono"
          autoCapitalize="characters"
          hint="The camera matches this plate at the gate. It can't change while the vehicle is parked, assigned or reserved."
          error={error}
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
                onPress={() => {
                  setType(t);
                  setSaved(false);
                }}
                testID={`vehicle-edit-type-${t}`}
              />
            ))}
          </View>
        </View>
        <Input testID="vehicle-edit-make" label="Make" value={make} onChangeText={(v) => { setMake(v); setSaved(false); }} placeholder="Toyota" autoCapitalize="words" maxLength={40} />
        <Input testID="vehicle-edit-model" label="Model" value={model} onChangeText={(v) => { setModel(v); setSaved(false); }} placeholder="Vios" autoCapitalize="words" maxLength={40} />
        <Input testID="vehicle-edit-color" label="Color" value={color} onChangeText={(v) => { setColor(v); setSaved(false); }} placeholder="Silver" autoCapitalize="words" maxLength={30} />
        {saved && !error ? (
          <Text variant="caption" color={colors.success} testID="vehicle-edit-saved">
            Vehicle saved.
          </Text>
        ) : null}
        <Button
          testID="vehicle-edit-save"
          title={save.isPending ? "Saving…" : "Save changes"}
          loading={save.isPending}
          disabled={!dirty || save.isPending}
          onPress={submit}
          accessibilityLabel="Save vehicle changes"
        />
      </Card>
      {vehicle.status === "ACTIVE" ? (
        <View style={styles.primaryBlock}>
          {vehicle.isPrimary ? (
            <Text variant="caption" color={colors.muted} testID="vehicle-is-primary">
              This is your primary vehicle.
            </Text>
          ) : (
            <>
              <Text variant="caption" color={colors.muted}>
                Your primary vehicle is preselected when you start parking.
              </Text>
              <Button
                testID="vehicle-make-primary"
                variant="secondary"
                title={makePrimary.isPending ? "Setting…" : "Set as primary"}
                loading={makePrimary.isPending}
                onPress={() => makePrimary.mutate()}
                accessibilityLabel={`Set ${vehicle.plateNumber} as primary vehicle`}
              />
            </>
          )}
        </View>
      ) : null}
      <View style={styles.danger}>
        <Text variant="caption" color={colors.muted}>
          Unregistering keeps your past sessions, fees and violations. A vehicle that is parked, assigned or reserved can't be
          unregistered until that ends.
        </Text>
        <Button
          testID="vehicle-unregister"
          variant="danger"
          title={unregister.isPending ? "Unregistering…" : "Unregister vehicle"}
          loading={unregister.isPending}
          onPress={confirmUnregister}
          accessibilityLabel={`Unregister ${vehicle.plateNumber}`}
        />
      </View>
    </>
  );
}

function buildStyles(colors: ColorTokens) {
  return StyleSheet.create({
    form: { gap: spacing.xl },
    typeBlock: { gap: spacing.md },
    primaryBlock: { gap: spacing.md, marginTop: spacing.xl },
    typeRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
    danger: {
      gap: spacing.md,
      marginTop: spacing.xl,
      paddingTop: spacing.xl2,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
  });
}
