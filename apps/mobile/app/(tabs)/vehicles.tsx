import { useState } from "react";
import { useRouter } from "expo-router";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { VehicleCreateInput, VehicleType } from "@parada/types";
import {
  Button,
  Card,
  ChoiceChip,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  LoadingState,
  Screen,
  SectionHeader,
  Text,
  VehicleCard,
} from "@/src/components";
import { api, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/query";
import { formatVehicleType, normalizePlateInput } from "@/lib/format";
import { colors, spacing } from "@/src/theme";

const VEHICLE_TYPES: VehicleType[] = ["CAR", "MOTORCYCLE", "VAN", "TRUCK", "OTHER"];

export default function VehiclesScreen() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const vehicles = useQuery({ queryKey: queryKeys.vehicles, queryFn: api.vehicles });

  const refresh = () => void vehicles.refetch();
  const refreshing = vehicles.isFetching;

  return (
    <Screen
      scroll={false}
      title="Vehicles"
      subtitle="Registered plates are your gate pass"
      right={
        open ? null : (
          <IconButton
            icon="add"
            size={24}
            accessibilityLabel="Add Vehicle"
            onPress={() => setOpen(true)}
            testID="vehicles-add-button"
          />
        )
      }
      testID="vehicles-screen">
      <FlatList
        data={vehicles.data ?? []}
        keyExtractor={(vehicle) => vehicle.id}
        renderItem={({ item }) => (
          <VehicleCard
            vehicle={item}
            onPress={() => router.push(`/vehicles/${item.id}`)}
            testID={`vehicle-${item.plateNumber}`}
          />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={
          <ListHeader
            isLoading={vehicles.isPending}
            count={(vehicles.data ?? []).length}
            open={open}
            onClose={() => setOpen(false)}
          />
        }
        ListEmptyComponent={
          vehicles.isPending ? (
            <LoadingState label="Loading vehicles…" testID="vehicles-loading" />
          ) : vehicles.isError ? (
            <ErrorState
              message={vehicles.error instanceof ApiError ? vehicles.error.message : "Couldn't load your vehicles."}
              onRetry={refresh}
              testID="vehicles-error"
            />
          ) : (
            <EmptyState
              illustration="vehicle"
              title="No vehicles registered"
              description="Add your first vehicle to use PARADA parking."
              testID="vehicles-empty">
              {open ? null : (
                <Button title="Add Vehicle" onPress={() => setOpen(true)} testID="vehicles-empty-add" />
              )}
            </EmptyState>
          )
        }
        testID="vehicles-list"
      />
    </Screen>
  );
}

function ListHeader({
  isLoading,
  count,
  open,
  onClose,
}: {
  isLoading: boolean;
  count: number;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <View style={styles.header}>
      {open ? <AddVehicleForm onClose={onClose} /> : null}
      {/* The list below already renders its own LoadingState; a second bare
          "Loading…" above it read like leftover scaffolding. */}
      {isLoading ? null : (
        <SectionHeader title="Your vehicles" caption={`${count} registered`} testID="vehicles-section" />
      )}
    </View>
  );
}

function AddVehicleForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [plate, setPlate] = useState("");
  const [type, setType] = useState<VehicleType>("CAR");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [color, setColor] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (input: VehicleCreateInput) => api.createVehicle(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles });
      setPlate("");
      setType("CAR");
      setMake("");
      setModel("");
      setColor("");
      setError(null);
      onClose();
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
    <Card style={styles.form} testID="vehicles-add-form">
      <View style={styles.formHeader}>
        <View style={styles.formHeading}>
          <Text variant="title">Register a vehicle</Text>
          <Text variant="caption">The camera reads this plate at the gate.</Text>
        </View>
        <IconButton
          icon="close"
          accessibilityLabel="Cancel adding vehicle"
          onPress={() => {
            onClose();
            setError(null);
            setPlate("");
          }}
          testID="vehicles-add-cancel"
        />
      </View>
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
      <Button
        testID="vehicle-submit"
        title={mutation.isPending ? "Registering…" : "Register vehicle"}
        loading={mutation.isPending}
        onPress={submit}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  listContent: {
    gap: spacing.lg,
    flexGrow: 1,
  },
  separator: { height: spacing.lg },
  header: {
    gap: spacing.xl2,
    marginBottom: spacing.md,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xl,
  },
  titleText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  form: {
    gap: spacing.xl,
  },
  formHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  formHeading: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  typeBlock: {
    gap: spacing.md,
  },
  typeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
});
