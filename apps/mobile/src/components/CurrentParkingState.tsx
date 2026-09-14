import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ActiveSessionBanner } from "./ActiveSessionBanner";
import { GlassCard } from "./GlassCard";
import { PlateChip } from "./PlateChip";
import { Stamp } from "./Stamp";
import { AssignmentBadge, ReservationBadge } from "./StatusBadge";
import { ErrorState, LoadingState } from "./StateComponents";
import { NavigateButton } from "./NavigateButton";
import { Text } from "./Text";
import type { SessionDto } from "@/lib/api/client";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { type NavigationDestination } from "@/lib/navigation";
import type { ReservationResponse, ZoneAssignmentResponse } from "@parada/types";
import { colors, radii, spacing } from "@/src/theme";

type CurrentParkingStateProps = {
  /** Backend-derived current parking session (GET /sessions/active). */
  session: SessionDto | null;
  /** Newest unexpired ACTIVE assignment (see lib/current). */
  assignment: ZoneAssignmentResponse | null;
  /** Newest live reservation (see lib/current). */
  reservation: ReservationResponse | null;
  /** Establishment navigation destination (Phase 9.5); null until configured. */
  destination: NavigationDestination | null;
  /** True once the establishment query has settled (success). */
  destinationReady: boolean;
  /** Injectable clock for live elapsed rendering. */
  now: Date;
  /** Active-session query still loading. */
  activePending: boolean;
  /** Active-session query failed (unknown whether parked). */
  activeError: boolean;
  /** Friendly message for the active-session failure. */
  activeErrorMessage: string | null;
  /** Assignment/reservation queries still loading after the session resolved. */
  statePending: boolean;
  assignmentError: boolean;
  reservationError: boolean;
  onRetry: () => void;
};

const STATE_UNKNOWN_MESSAGE = "We couldn't load your current parking status.";

const currentReservationStatus = new Set<ReservationResponse["status"]>([
  "PENDING",
  "CONFIRMED",
  "ACTIVE",
]);

/**
 * The authoritative "what is happening with my parking right now" section.
 *
 * The hierarchy follows backend semantics — an active parking session is the
 * strongest state (actual parking), so it is rendered first and suppresses the
 * suggestion flows. Assignment and reservation are kept completely distinct
 * from the session and from each other: they are never merged, re-ranked, or
 * reconciled. When queries have settled and nothing is current, a clear
 * "No active parking" empty state is shown. Partial failures degrade to what
 * we still know instead of hiding the whole screen.
 */
export function CurrentParkingState({
  session,
  assignment,
  reservation,
  destination,
  destinationReady,
  now,
  activePending,
  activeError,
  activeErrorMessage,
  statePending,
  assignmentError,
  reservationError,
  onRetry,
}: CurrentParkingStateProps) {
  if (activePending) {
    return <LoadingState label="Checking your parking state…" testID="current-state-loading" />;
  }

  if (activeError) {
    return (
      <ErrorState
        message={activeErrorMessage ?? STATE_UNKNOWN_MESSAGE}
        onRetry={onRetry}
        testID="active-session-error"
      />
    );
  }

  const currentAssignment = assignment && assignment.status === "ACTIVE" ? assignment : null;
  const currentReservation =
    reservation && currentReservationStatus.has(reservation.status) ? reservation : null;

  if (session) {
    return (
      <SessionState
        session={session}
        assignment={currentAssignment}
        destination={destination}
        destinationReady={destinationReady}
        now={now}
        assignmentError={assignmentError}
      />
    );
  }

  if (statePending) {
    return <LoadingState label="Checking your parking state…" testID="current-state-loading" />;
  }

  const stateUnknown = !currentAssignment && !currentReservation && (assignmentError || reservationError);
  if (stateUnknown) {
    return (
      <ErrorState message={STATE_UNKNOWN_MESSAGE} onRetry={onRetry} testID="current-state-error" />
    );
  }

  if (currentAssignment === null && currentReservation === null) {
    return (
      <GlassCard wash={colors.muted} style={styles.pass} testID="current-state-empty">
        <Stamp label="Not parked" icon="car-outline" color={colors.muted} />
        <View style={styles.passBody}>
          <Text variant="title">No active parking</Text>
          <Text variant="body" color={colors.muted}>
            You're not parked right now. Assign a zone, make a reservation, or check the recommendation below.
          </Text>
        </View>
      </GlassCard>
    );
  }

  return (
    <View testID="current-state">
      {currentAssignment ? (
        <AssignmentState
          assignment={currentAssignment}
          destination={destination}
          destinationReady={destinationReady}
        />
      ) : null}
      {currentReservation ? (
        <ReservationState
          reservation={currentReservation}
          destination={destination}
          destinationReady={destinationReady}
        />
      ) : null}
      {assignmentError ? (
        <Text variant="caption" color={colors.danger} testID="assignment-load-note">
          We couldn't load your assignment info. Pull to refresh to try again.
        </Text>
      ) : null}
      {reservationError ? (
        <Text variant="caption" color={colors.danger} testID="reservation-load-note">
          We couldn't load your reservation info. Pull to refresh to try again.
        </Text>
      ) : null}
    </View>
  );
}

type SessionStateProps = {
  session: SessionDto;
  assignment: ZoneAssignmentResponse | null;
  destination: NavigationDestination | null;
  destinationReady: boolean;
  now: Date;
  assignmentError: boolean;
};

function SessionState({
  session,
  assignment,
  destination,
  destinationReady,
  now,
  assignmentError,
}: SessionStateProps) {
  const plate = session.vehicle?.plateNumber ?? "guest";
  const summary = [
    `Active parking in ${session.zone.name}.`,
    `Vehicle ${plate}.`,
    `Started ${formatDateTime(session.enteredAt)}.`,
    assignment ? `Assigned zone ${assignment.zone.name}.` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" ");

  return (
    <View testID="current-state">
      <ActiveSessionBanner session={session} now={now} testID="active-banner">
        <View testID="session-context" style={styles.contextBlock}>
          <View accessible accessibilityLabel={summary} testID="session-summary" style={styles.facts}>
            <View style={styles.factRow}>
              <View style={styles.fact}>
                <Text variant="micro">SESSION STARTED</Text>
                <Text variant="bodySemi" testID="session-started">
                  {formatDateTime(session.enteredAt)}
                </Text>
              </View>
              {session.feeAmount != null ? (
                <View style={styles.fact}>
                  <Text variant="micro">SESSION FEE</Text>
                  <Text variant="monoBold" color={colors.highlight} testID="session-fee">
                    {formatCurrency(session.feeAmount)}
                  </Text>
                </View>
              ) : null}
            </View>
            {assignment ? (
              <View style={styles.inlineRow}>
                <Ionicons name="location" size={14} color={colors.primary} />
                <Text variant="caption" testID="session-assignment" style={styles.inlineText}>
                  Assigned zone: {assignment.zone.name} ({assignment.zone.code})
                </Text>
              </View>
            ) : null}
            {assignmentError && !assignment ? (
              <Text variant="caption" testID="session-assignment-note">
                Couldn't load your assignment info.
              </Text>
            ) : null}
          </View>
          {destinationReady ? (
            <NavigateButton
              destination={destination}
              label="Navigate to parking"
              primary
              testID="current-state-navigate"
            />
          ) : null}
        </View>
      </ActiveSessionBanner>
    </View>
  );
}

type AssignmentStateProps = {
  assignment: ZoneAssignmentResponse;
  destination: NavigationDestination | null;
  destinationReady: boolean;
};

function AssignmentState({ assignment, destination, destinationReady }: AssignmentStateProps) {
  const summary = [
    `Assigned to ${assignment.zone.name}.`,
    `Vehicle ${assignment.vehicle.plateNumber}.`,
    assignment.expiresAt ? `Valid until ${formatDateTime(assignment.expiresAt)}.` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" ");

  return (
    <GlassCard style={styles.pass} testID="assignment-current">
      <View style={styles.headerRow}>
        <Stamp label="ZONE ASSIGNED" icon="location" color={colors.primary} />
        <AssignmentBadge status={assignment.status} testID="assignment-current-badge" />
      </View>
      <View accessible accessibilityLabel={summary} testID="assignment-summary" style={styles.passBody}>
        <Text variant="hero" numberOfLines={2} testID="assignment-current-zone">
          {assignment.zone.name}
        </Text>
        <View style={styles.plateRow}>
          <PlateChip value={assignment.zone.code} tone="soft" size="sm" />
          <Text variant="plate" testID="assignment-current-vehicle">
            {assignment.vehicle.plateNumber}
          </Text>
        </View>
        {assignment.expiresAt ? (
          <View style={styles.inlineRow}>
            <Ionicons name="time-outline" size={14} color={colors.muted} />
            <Text variant="caption" testID="assignment-current-validity">
              Valid until {formatDateTime(assignment.expiresAt)}
            </Text>
          </View>
        ) : null}
      </View>
      {destinationReady ? (
        <NavigateButton
          destination={destination}
          label="Navigate to assigned zone"
          primary
          testID="assignment-navigate"
        />
      ) : null}
    </GlassCard>
  );
}

type ReservationStateProps = {
  reservation: ReservationResponse;
  destination: NavigationDestination | null;
  destinationReady: boolean;
};

function ReservationState({ reservation, destination, destinationReady }: ReservationStateProps) {
  const summary = [
    `Reserved ${reservation.zone.name}.`,
    `Vehicle ${reservation.vehicle.plateNumber}.`,
    `Start ${formatDateTime(reservation.startAt)}. End ${formatDateTime(reservation.endAt)}.`,
  ].join(" ");

  return (
    <GlassCard style={styles.pass} wash={colors.success} testID="reservation-current">
      <View style={styles.headerRow}>
        <Stamp label="RESERVED" icon="calendar" color={colors.success} />
        <ReservationBadge status={reservation.status} testID="reservation-current-badge" />
      </View>
      <View accessible accessibilityLabel={summary} testID="reservation-summary" style={styles.passBody}>
        <Text variant="hero" numberOfLines={2} testID="reservation-current-zone">
          {reservation.zone.name}
        </Text>
        <View style={styles.plateRow}>
          <PlateChip value={reservation.zone.code} tone="soft" size="sm" />
          <Text variant="plate" testID="reservation-current-vehicle">
            {reservation.vehicle.plateNumber}
          </Text>
        </View>
        <View style={styles.windowBox}>
          <Ionicons name="time-outline" size={14} color={colors.success} />
          <Text variant="caption" color={colors.foreground} style={styles.inlineText} testID="reservation-current-window">
            Start {formatDateTime(reservation.startAt)} · End {formatDateTime(reservation.endAt)}
          </Text>
        </View>
      </View>
      {destinationReady ? (
        <NavigateButton
          destination={destination}
          label="Navigate to parking"
          primary
          testID="reservation-navigate"
        />
      ) : null}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  pass: {
    gap: spacing.xl2,
  },
  passBody: {
    gap: spacing.lg,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  plateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  inlineText: {
    flexShrink: 1,
  },
  windowBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    borderRadius: radii.sm,
    padding: spacing.lg,
  },
  contextBlock: {
    gap: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: "rgba(15, 27, 45, 0.08)",
  },
  facts: {
    gap: spacing.md,
  },
  factRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.xl,
  },
  fact: {
    gap: spacing.xs,
  },
});
