import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  GlassCard,
  Input,
  LoadingState,
  Screen,
  Text,
  ViolationBadge,
  violationStatusMeta,
} from "@/src/components";
import { api, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/query";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { colors, spacing } from "@/src/theme";

const REASON_MAX = 500;

export default function ViolationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const violations = useQuery({ queryKey: queryKeys.violations, queryFn: api.violations });
  const [reason, setReason] = useState("");

  const appeal = useMutation({
    mutationFn: (input: { violationId: string; reason: string }) =>
      api.appealViolation(input.violationId, input.reason),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.violations }),
  });

  const violation = violations.data?.find((v) => v.id === id) ?? null;

  const appealError = (() => {
    if (!appeal.isError) {
      return null;
    }
    return appeal.error instanceof ApiError ? appeal.error.message : "We couldn't submit your appeal.";
  })();

  function handleSubmitAppeal() {
    const trimmed = reason.trim();
    if (trimmed.length === 0 || !violation) {
      return;
    }
    appeal.mutate({ violationId: violation.id, reason: trimmed });
  }

  return (
    <Screen
      back
      title="Violation details"
      refreshing={violations.isFetching}
      onRefresh={() => void violations.refetch()}
      testID="violation-detail-screen">
      {violations.isPending ? (
        <LoadingState label="Loading violation…" testID="violation-detail-loading" />
      ) : violations.isError ? (
        <ErrorState
          message={violations.error instanceof ApiError ? violations.error.message : "Couldn't load this violation."}
          onRetry={() => void violations.refetch()}
          testID="violation-detail-error"
        />
      ) : !violation ? (
        <EmptyState
          icon="shield-checkmark-outline"
          title="Violation not found"
          description="This violation may have been removed."
          testID="violation-detail-missing"
        />
      ) : (
        <>
          <GlassCard accent={violationStatusMeta(violation.status).color} testID="violation-summary">
            <ViolationBadge status={violation.status} testID="violation-summary-status" />
            <Text variant="monoBold" color={violationStatusMeta(violation.status).color} style={styles.fine}>
              {formatCurrency(violation.fineAmount)}
            </Text>
            <Text variant="caption" color={colors.muted}>
              {violation.violationType === "WRONG_ZONE" ? "Fine for a wrong-zone entry." : "Establishment violation fine."}
            </Text>
          </GlassCard>

          <Card testID="violation-details-card">
            <Text variant="micro">PLATE</Text>
            <Text variant="plate">{violation.vehicle?.plateNumber ?? "Unknown vehicle"}</Text>
            <View style={styles.zoneRow}>
              <Text variant="micro">ZONE</Text>
              <Text variant="bodySemi">
                {violation.zone.name} ({violation.zone.code})
              </Text>
            </View>
            {violation.description ? (
              <Text variant="caption" color={colors.muted}>
                {violation.description}
              </Text>
            ) : null}
            <Text variant="caption" color={colors.muted}>
              Issued {formatDateTime(violation.issuedAt)}
            </Text>
          </Card>

          <Text variant="section" style={styles.historyTitle}>
            History
          </Text>
          <Card style={styles.timeline} testID="violation-timeline">
            <TimelineItem label="Violation issued" detail={formatDateTime(violation.issuedAt)} color={colors.warning} />
            {violation.appeal ? (
              <TimelineItem
                label="Appeal submitted"
                detail={formatDateTime(violation.appeal.createdAt)}
                color={colors.muted}
              />
            ) : null}
            {violation.appeal?.reviewedAt ? (
              <TimelineItem
                label={violation.appeal.status === "APPROVED" ? "Appeal approved" : "Appeal rejected"}
                detail={formatDateTime(violation.appeal.reviewedAt)}
                color={violation.appeal.status === "APPROVED" ? colors.success : colors.danger}
                last
              />
            ) : null}
          </Card>

          {violation.status === "PENDING" && !violation.appeal ? (
            <View style={styles.appealBox} testID="violation-appeal-form">
              <Text variant="bodySemi">Appeal this violation</Text>
              <Text variant="caption" color={colors.muted}>
                You can appeal once. If you believe this was a mistake, explain what happened — our team will
                review within 2 business days.
              </Text>
              <Input
                testID="violation-appeal-reason"
                label="Reason"
                value={reason}
                onChangeText={setReason}
                placeholder="e.g. I was directed to a different zone by security staff…"
                multiline
                maxLength={REASON_MAX}
              />
              <Text variant="caption" color={colors.muted} align="right">
                {reason.length}/{REASON_MAX}
              </Text>
              {appealError ? (
                <Text variant="caption" color={colors.danger} testID="violation-appeal-error">
                  {appealError}
                </Text>
              ) : null}
              <Button
                title={appeal.isPending ? "Submitting…" : "Submit appeal"}
                loading={appeal.isPending}
                disabled={reason.trim().length === 0}
                onPress={handleSubmitAppeal}
                testID="violation-appeal-submit"
              />
            </View>
          ) : violation.appeal && violation.appeal.status === "PENDING" ? (
            <Card style={styles.appealBox} testID="violation-appeal-pending">
              <Text variant="bodySemi">Appeal under review</Text>
              <Text variant="caption" color={colors.muted}>
                We'll notify you once this is resolved. You can't submit another appeal for this violation.
              </Text>
              <Text variant="body" style={styles.quote}>
                "{violation.appeal.reason}"
              </Text>
            </Card>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function TimelineItem({
  label,
  detail,
  color,
  last = false,
}: {
  label: string;
  detail: string;
  color: string;
  last?: boolean;
}) {
  return (
    <View style={styles.timelineItem}>
      <View style={styles.timelineMarker}>
        <View style={[styles.timelineDot, { backgroundColor: color }]} />
        {last ? null : <View style={styles.timelineLine} />}
      </View>
      <View style={styles.timelineBody}>
        <Text variant="bodySemi" style={styles.timelineLabel}>
          {label}
        </Text>
        <Text variant="caption" color={colors.muted}>
          {detail}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fine: {
    fontSize: 30,
    lineHeight: 36,
  },
  zoneRow: {
    gap: spacing.xs,
  },
  historyTitle: {
    fontSize: 16,
    lineHeight: 22,
  },
  timeline: {
    gap: 0,
  },
  timelineItem: {
    flexDirection: "row",
    gap: spacing.lg,
  },
  timelineMarker: {
    width: 12,
    alignItems: "center",
  },
  timelineDot: {
    width: 11,
    height: 11,
    borderRadius: 999,
    marginTop: 4,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: colors.border,
    marginTop: 2,
  },
  timelineBody: {
    flex: 1,
    paddingBottom: spacing.xl,
  },
  timelineLabel: {
    fontSize: 13,
    lineHeight: 18,
  },
  appealBox: {
    gap: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 16,
    padding: spacing.xl,
  },
  quote: {
    fontStyle: "italic",
    borderLeftWidth: 3,
    borderLeftColor: colors.border,
    paddingLeft: spacing.lg,
  },
});
