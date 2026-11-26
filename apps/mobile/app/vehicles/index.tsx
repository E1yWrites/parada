import { useState } from "react";
import { useRouter } from "expo-router";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Vehicle } from "@parada/types";
import {
  AddVehicleForm,
  Button,
  Card,
  EmptyState,
  ErrorState,
  GlassCard,
  IconButton,
  LoadingState,
  PlateChip,
  Screen,
  SectionHeader,
  Text,
  VehicleCard,
} from "@/src/components";
import { api, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/query";
import { spacing } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";
import { usePopups } from "@/src/providers/PopupProvider";

export default function VehiclesScreen() {
  const colors = useColors();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const vehicles = useQuery({ queryKey: queryKeys.vehicles, queryFn: api.vehicles });
  const activeVehicles = (vehicles.data ?? []).filter((vehicle) => vehicle.status === "ACTIVE");
  const queryClient = useQueryClient();
  const { showToast } = usePopups();
  const makePrimary = useMutation({
    mutationFn: (vehicleId: string) => api.setPrimaryVehicle(vehicleId),
    onSuccess: (vehicle) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles });
      showToast({ title: "Primary vehicle changed", body: `${vehicle.plateNumber} is preselected when you park.` });
    },
  });

  const refresh = () => void vehicles.refetch();
  const refreshing = vehicles.isFetching;

  return (
    <Screen
      back
      scroll={false}
      title="Vehicles"
      subtitle="Registered plates are what gate cameras recognize"
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
            onMakePrimary={item.status === "ACTIVE" ? () => makePrimary.mutate(item.id) : undefined}
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
            activeCount={activeVehicles.length}
            primary={activeVehicles.find((vehicle) => vehicle.isPrimary) ?? null}
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

function SelectedForParking({ plate }: { plate: string }) {
  return (
    <GlassCard padding={spacing.xl} testID="vehicles-selected">
      <View style={styles.selectedRow}>
        <View style={styles.formHeading}>
          <Text variant="caption">Selected for parking</Text>
          <Text variant="bodySemi">Preselected when you go or reserve</Text>
        </View>
        <PlateChip value={plate} tone="soft" testID="vehicles-selected-plate" />
      </View>
    </GlassCard>
  );
}

function ListHeader({
  isLoading,
  count,
  activeCount,
  primary,
  open,
  onClose,
}: {
  isLoading: boolean;
  count: number;
  activeCount: number;
  primary: Vehicle | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <View style={styles.header}>
      {open ? <AddVehiclePanel onClose={onClose} isFirstVehicle={activeCount === 0} /> : null}
      {primary ? <SelectedForParking plate={primary.plateNumber} /> : null}
      {/* The list below already renders its own LoadingState; a second bare
          "Loading…" above it read like leftover scaffolding. */}
      {isLoading ? null : (
        <SectionHeader title="Your vehicles" caption={`${count} registered`} testID="vehicles-section" />
      )}
    </View>
  );
}

function AddVehiclePanel({ onClose, isFirstVehicle }: { onClose: () => void; isFirstVehicle: boolean }) {
  return (
    <Card style={styles.form} testID="vehicles-add-form">
      <View style={styles.formHeader}>
        <View style={styles.formHeading}>
          <Text variant="title">Register a vehicle</Text>
          <Text variant="caption">The camera reads this plate at the gate.</Text>
        </View>
        <IconButton icon="close" accessibilityLabel="Cancel adding vehicle" onPress={onClose} testID="vehicles-add-cancel" />
      </View>
      <AddVehicleForm isFirstVehicle={isFirstVehicle} onAdded={onClose} />
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
  selectedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
});
