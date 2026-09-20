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
  const paidFees = (sessions.data ?? []).filter(
    (s): s is SessionDto & { feeAmount: number } => s.feeAmount != null && s.feeAmount > 0,
  );

  return (
    <Screen
      back
      title="Payments"
      subtitle="Fees, fines and payment history"
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
          <Card testID="payments-outstanding">
            <Text variant="caption" color={colors.muted}>
              Outstanding balance
            </Text>
            <Text variant="display" style={styles.balance} testID="payments-outstanding-total">
              {formatCurrency(outstandingTotal)}
            </Text>
            <Text variant="caption" color={colors.muted}>
              {outstanding.length === 0
                ? "Nothing due right now."
                : `${outstanding.length} unpaid violation${outstanding.length === 1 ? "" : "s"}`}
            </Text>
          </Card>

          <SectionHeader title="Unpaid violations" testID="payments-outstanding-header" />
          {outstanding.length === 0 ? (
            <EmptyState
              illustration="shield"
              title="Nothing due"
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

          <SectionHeader title="Session fees" caption="Charged when a session ends over the free window" testID="payments-fees-header" />
          {paidFees.length === 0 ? (
            <Text variant="caption" color={colors.muted}>
              No session fees yet.
            </Text>
          ) : (
            <Card padding={0} testID="payments-fees-list">
              {paidFees.map((s, i) => (
                <View key={s.id} style={[styles.row, i > 0 ? styles.rowDivider : undefined]}>
                  <View style={styles.rowText}>
                    <Text variant="bodySemi">Parking fee · Zone {s.zone.code}</Text>
                    <Text variant="caption" color={colors.muted}>
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
        </View>
      )}
    </Screen>
  );
}

function buildStyles(colors: ColorTokens) {
  return StyleSheet.create({
    content: {
      gap: spacing.lg,
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
