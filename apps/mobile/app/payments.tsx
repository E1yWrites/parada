import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  SectionHeader,
  Text,
  ViolationCard,
} from "@/src/components";
import { api, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/query";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { spacing } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";
import type { ColorTokens } from "@/src/theme/colors";
import type { SessionDto } from "@/lib/api/client";

/**
 * Fees & Payments: real violation fines + completed-session fees only.
 * There is no payment endpoint or stored payment method in PARADA yet, so
 * this screen is read-only — "Pay Fine" routes to the existing violation
 * detail/appeal flow instead of a fabricated checkout.
 */
export default function PaymentsScreen() {
  const colors = useColors();
  const styles = useMemo(() => buildStyles(colors), [colors]);
  const router = useRouter();
  const violations = useQuery({ queryKey: queryKeys.violations, queryFn: api.violations });
  const sessions = useQuery({ queryKey: queryKeys.sessions, queryFn: api.sessions });

  const loading = violations.isPending || sessions.isPending;
  const error = violations.isError ? violations.error : sessions.isError ? sessions.error : null;

  const refresh = () => {
    void violations.refetch();
    void sessions.refetch();
  };

  const outstanding = (violations.data ?? []).filter((v) => v.status === "PENDING" || v.status === "UPHELD");
  const outstandingTotal = outstanding.reduce((sum, v) => sum + v.fineAmount, 0);
  const sessionFees = (sessions.data ?? []).filter(
    (s): s is SessionDto & { feeAmount: number } => s.feeAmount != null && s.feeAmount > 0,
  );
  // A session still in progress has no fee yet; say so instead of an unexplained blank.
  const inProgress = (sessions.data ?? []).filter((s) => s.status === "ACTIVE");

  return (
    <Screen
      back
      title="Payments"
      subtitle="Fees and fines"
      refreshing={violations.isFetching || sessions.isFetching}
      onRefresh={refresh}
      testID="payments-screen">
      {loading ? (
        <LoadingState label="Loading your fees…" testID="payments-loading" />
      ) : error ? (
        <ErrorState
          message={error instanceof ApiError ? error.message : "Couldn't load your fees."}
          onRetry={refresh}
          testID="payments-error"
        />
      ) : (
        <View style={styles.content}>
          {/* Session fees first: after a parking session ends, its fee is what a driver comes here to read. */}
          <SectionHeader title="Session fees" caption="Charged when a session ends, at the establishment's rates." testID="payments-fees-header" />
          {inProgress.map((s) => (
            <Text key={s.id} variant="caption" color={colors.muted} testID={`payments-in-progress-${s.id}`}>
              {`${s.vehicle?.plateNumber ?? "Your vehicle"} is parked in Zone ${s.zone.code}. Its fee is charged when the session ends.`}
            </Text>
          ))}
          {sessionFees.length === 0 ? (
            <Text variant="caption" color={colors.muted} testID="payments-fees-empty">
              No session fees yet. A fee appears here when a parking session for one of your registered plates ends.
            </Text>
          ) : (
            <Card padding={0} testID="payments-fees-list">
              {sessionFees.map((s, i) => (
                <View key={s.id} style={[styles.row, i > 0 ? styles.rowDivider : undefined]}>
                  <View style={styles.rowText}>
                    <Text variant="bodySemi">Parking fee · Zone {s.zone.code}</Text>
                    <Text variant="caption" color={colors.muted}>
                      {s.vehicle ? `${s.vehicle.plateNumber} · ` : ""}
                      {formatDateTime(s.exitedAt ?? s.enteredAt)}
                    </Text>
                  </View>
                  <Text variant="bodySemi" testID={`payments-fee-${s.id}`}>
                    {formatCurrency(s.feeAmount)}
                  </Text>
                </View>
              ))}
            </Card>
          )}

          <Card testID="payments-outstanding">
            <Text variant="caption" color={colors.muted}>
              Unpaid fines
            </Text>
            <Text variant="display" numberOfLines={1} adjustsFontSizeToFit style={styles.balance} testID="payments-outstanding-total">
              {formatCurrency(outstandingTotal)}
            </Text>
            <Text variant="caption" color={colors.muted}>
              {outstanding.length === 0
                ? "No unpaid violation fines."
                : `${outstanding.length} unpaid violation${outstanding.length === 1 ? "" : "s"}`}
            </Text>
          </Card>

          <SectionHeader title="Unpaid violations" testID="payments-outstanding-header" />
          {outstanding.length === 0 ? (
            <EmptyState
              illustration="shield"
              title="No unpaid fines"
              description="Wrong-zone fines will show up here until paid, dismissed or resolved."
              testID="payments-outstanding-empty"
            />
          ) : (
            <View style={styles.list} testID="payments-outstanding-list">
              {outstanding.map((violation) => (
                <ViolationCard
                  key={violation.id}
                  violation={violation}
                  onPress={() => router.push(`/violations/${violation.id}`)}
                  testID={`payments-violation-${violation.id}`}
                />
              ))}
            </View>
          )}
        </View>
      )}
    </Screen>
  );
}

function buildStyles(colors: ColorTokens) {
  return StyleSheet.create({
    content: {
      gap: spacing.xl,
    },
    balance: {
      marginTop: spacing.xs,
      marginBottom: spacing.xs,
    },
    list: {
      gap: spacing.xl,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.lg,
      gap: spacing.lg,
    },
    rowDivider: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    rowText: {
      flex: 1,
      minWidth: 0,
      gap: spacing.xs,
    },
  });
}
