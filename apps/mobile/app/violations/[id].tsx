import { useMemo, useState } from "react";
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
  PlateChip,
  Screen,
  Text,
  ViolationBadge,
  violationStatusMeta,
} from "@/src/components";
import { api, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/query";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { fontSizes, lineHeights, radii, spacing } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";
import type { ColorTokens } from "@/src/theme/colors";

const REASON_MAX = 500;

export default function ViolationDetailScreen() {
  const colors = useColors();
  const styles = useMemo(() => buildStyles(colors), [colors]);
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
  const violationColor = violation ? violationStatusMeta(violation.status, colors).color : colors.muted;

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
          illustration="shield"
          title="Violation not found"
          description="This violation may have been removed."
          testID="violation-detail-missing"
        />
      ) : (
        <>
          <GlassCard wash={violationColor} style={styles.summary} testID="violation-summary">
            <View style={styles.summaryRow}>
              <Text variant="micro">FINE</Text>
              <ViolationBadge status={violation.status} testID="violation-summary-status" />
            </View>
            <Text variant="display" color={violationColor}>
              {formatCurrency(violation.fineAmount)}
            </Text>
            <Text variant="body" color={colors.muted}>
              {violation.violationType === "WRONG_ZONE" ? "Fine for a wrong-zone entry." : "Establishment violation fine."}
            </Text>
          </GlassCard>

          <Text variant="section">What happened</Text>
          <Card testID="violation-details-card" style={styles.details}>
            <View style={styles.detailRow}>
              <Text variant="micro">PLATE</Text>
              <Text variant="plate">{violation.vehicle?.plateNumber ?? "Unknown vehicle"}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.detailRow}>
              <Text variant="micro">ZONE</Text>
              <View style={styles.zoneRow}>
                <PlateChip value={violation.zone.code} tone="soft" size="sm" />
                <Text variant="bodySemi" style={styles.zoneName}>
                  {violation.zone.name}
                </Text>
              </View>
            </View>
            <View style={styles.divider} />
            <Text variant="body" color={colors.muted}>
              {violation.description ??
                (violation.violationType === "WRONG_ZONE"
                  ? "Your vehicle was detected outside its assigned zone."
                  : "The parking service recorded an establishment violation.")}
            </Text>
            <View style={styles.divider} />
            <Text variant="caption">Issued {formatDateTime(violation.issuedAt)}</Text>
          </Card>

          {violation.status === "PENDING" && !violation.appeal ? (
            <>
              <Text variant="section">What you can do</Text>
              <Text variant="caption" color={colors.muted}>
                Review the details below and submit an appeal if the record is incorrect.
              </Text>
            </>
          ) : null}

          <Text variant="section">History</Text>
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
            <Card style={styles.appealBox} testID="violation-appeal-form">
              <Text variant="title">Appeal this violation</Text>
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
            </Card>
          ) : violation.appeal && violation.appeal.status === "PENDING" ? (
            <Card tone="tinted" style={styles.appealBox} testID="violation-appeal-pending">
              <Text variant="title">Appeal under review</Text>
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
  const colors = useColors();
  const styles = useMemo(() => buildStyles(colors), [colors]);
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

function buildStyles(colors: ColorTokens) {
  return StyleSheet.create({
    summary: {
      gap: spacing.md,
    },
    summaryRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
    },
    details: {
      gap: spacing.lg,
    },
    detailRow: {
      gap: spacing.sm,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
    },
    zoneRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    zoneName: {
      flexShrink: 1,
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
      borderRadius: radii.full,
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
      fontSize: fontSizes.caption,
      lineHeight: lineHeights.caption,
    },
    appealBox: {
      gap: spacing.lg,
    },
    quote: {
      fontStyle: "italic",
      borderLeftWidth: 1,
      borderLeftColor: colors.border,
      paddingLeft: spacing.lg,
      borderRadius: radii.sm,
      borderTopRightRadius: radii.cut,
    },
  });
}
