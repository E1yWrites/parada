import { useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import type { VehicleType } from "@parada/types";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  SectionHeader,
  Text,
  VehicleCard,
} from "@/src/components";
import { api, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/query";
import { normalizePlateInput } from "@/lib/format";
import { colors, radii, spacing, tabClearance, touchTarget } from "@/src/theme";

const VEHICLE_TYPES: VehicleType[] = ["CAR", "MOTORCYCLE", "VAN", "TRUCK", "OTHER"];

export default function VehiclesScreen() {
  const insets = useSafeAreaInsets();
  const vehicles = useQuery({ queryKey: queryKeys.vehicles, queryFn: api.vehicles });

  const refresh = () => void vehicles.refetch();
  const refreshing = vehicles.isFetching;

  return (
    <SafeAreaView edges={["top"]} style={styles.flex}>
      <FlatList
        data={vehicles.data ?? []}
        keyExtractor={(vehicle) => vehicle.id}
        renderItem={({ item }) => <VehicleCard vehicle={item} testID={`vehicle-${item.plateNumber}`} />}
        contentContainerStyle={[styles.listContent, { paddingBottom: tabClearance(insets.bottom) }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={
          <ListHeader isLoading={vehicles.isPending} count={(vehicles.data ?? []).length} />
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
              icon="car-outline"
              title="No vehicles registered"
              description="Add your first vehicle to use PARADA parking."
              testID="vehicles-empty"
            />
          )
        }
        testID="vehicles-list"
      />
    </SafeAreaView>
  );
}

function ListHeader({ isLoading, count }: { isLoading: boolean; count: number }) {
  return (
    <View style={styles.header}>
      <Text variant="micro">PARKING ACCESS</Text>
      <View style={styles.titleRow}>
        <Text variant="hero">Vehicles</Text>
        {!isLoading ? (
          <AddVehicleButton />
        ) : (
          <Text testID="vehicles-header-state" variant="caption">
            Loading…
          </Text>
        )}
      </View>
      <SectionHeader
        title="Your vehicles"
        caption={`${count} registered`}
        testID="vehicles-section"
      />
    </View>
  );
}

function AddVehicleButton() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const [plate, setPlate] = useState("");
  const [type, setType] = useState<VehicleType>("CAR");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: ({ plateNumber, vehicleType }: { plateNumber: string; vehicleType: VehicleType }) =>
      api.createVehicle(plateNumber, vehicleType),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles });
      setPlate("");
      setType("CAR");
      setError(null);
      setOpen(false);
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
    mutation.mutate({ plateNumber: cleaned, vehicleType: type });
  };

  if (!open) {
    return (
      <Button
        testID="vehicles-add-button"
        title="Add Vehicle"
        variant="secondary"
        icon={<Ionicons name="add" size={18} color={colors.primary} />}
        onPress={() => setOpen(true)}
      />
    );
  }

  return (
    <Card style={styles.form} testID="vehicles-add-form">
      <View style={styles.formHeader}>
        <Text variant="title">Register vehicle</Text>
        <Pressable
          testID="vehicles-add-cancel"
          accessibilityRole="button"
          accessibilityLabel="Cancel adding vehicle"
          onPress={() => {
            setOpen(false);
            setError(null);
            setPlate("");
          }}
          hitSlop={8}>
          <Ionicons name="close" size={22} color={colors.muted} />
        </Pressable>
      </View>
      <Input
        testID="vehicle-plate"
        label="Plate number"
        value={plate}
        onChangeText={setPlate}
        placeholder="e.g. ABC-1234"
        variant="mono"
        autoCapitalize="characters"
        error={error}
        onSubmit={submit}
        returnKeyType="done"
      />
      <View>
        <Text variant="micro">VEHICLE TYPE</Text>
        <View style={styles.typeRow}>
          {VEHICLE_TYPES.map((t) => {
            const selected = t === type;
            return (
              <Pressable
                key={t}
                testID={`vehicle-type-${t}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setType(t)}
                style={[styles.typeChip, selected ? styles.typeChipSelected : undefined]}>
                <Text
                  variant="micro"
                  color={selected ? colors.onAccent : colors.muted}
                  style={styles.typeLabel}>
                  {t}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <Button
        testID="vehicle-submit"
        title={mutation.isPending ? "Registering…" : "Register"}
        loading={mutation.isPending}
        onPress={submit}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  listContent: {
    padding: spacing.xl3,
    gap: spacing.lg,
    flexGrow: 1,
  },
  separator: { height: spacing.lg },
  header: {
    gap: spacing.xl,
    marginBottom: spacing.lg,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xl,
  },
  form: {
    gap: spacing.xl,
  },
  formHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  typeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  typeChip: {
    minHeight: touchTarget,
    minWidth: 84,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.lg,
  },
  typeChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  typeLabel: {
    letterSpacing: 0.6,
  },
});