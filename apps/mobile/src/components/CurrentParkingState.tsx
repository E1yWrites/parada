import { StyleSheet, View } from "react-native";
import { ActiveSessionBanner } from "./ActiveSessionBanner";
import { Card } from "./Card";
import { AssignmentBadge, ReservationBadge } from "./StatusBadge";
import { EmptyState, ErrorState, LoadingState } from "./StateComponents";
import { NavigateButton } from "./NavigateButton";
import { Text } from "./Text";
import type { SessionDto } from "@/lib/api/client";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { type NavigationDestination } from "@/lib/navigation";
import type { ReservationResponse, ZoneAssignmentResponse } from "@parada/types";
import { colors, spacing } from "@/src/theme";

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
      <EmptyState
        icon="car-outline"
        title="No active parking"
        description="You're not parked right now. Assign a zone, make a reservation, or check the recommendation below."
        testID="current-state-empty"
      />
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
      <ActiveSessionBanner session={session} now={now} testID="active-banner" />
      <Card testID="session-context">
        <View accessible accessibilityLabel={summary} testID="session-summary">
          <View style={styles.factRow}>
            <View style={styles.fact}>
              <Text variant="micro" color={colors.muted}>
                SESSION STARTED
              </Text>
              <Text variant="body" testID="session-started">
                {formatDateTime(session.enteredAt)}
              </Text>
            </View>
            {session.feeAmount != null ? (
              <View style={styles.fact}>
                <Text variant="micro" color={colors.muted}>
                  SESSION FEE
                </Text>
                <Text variant="body" color={colors.gold} testID="session-fee">
                  {formatCurrency(session.feeAmount)}
                </Text>
              </View>
            ) : null}
          </View>
          {assignment ? (
            <Text variant="caption" color={colors.muted} testID="session-assignment">
              Assigned zone: {assignment.zone.name} ({assignment.zone.code})
            </Text>
          ) : null}
          {assignmentError && !assignment ? (
            <Text variant="caption" color={colors.muted} testID="session-assignment-note">
              Couldn't load your assignment info.
            </Text>
          ) : null}
        </View>
        {destinationReady ? (
          <NavigateButton
            destination={destination}
            label="Navigate to parking"
            testID="current-state-navigate"
          />
        ) : null}
      </Card>
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
    <Card accent={colors.gold} testID="assignment-current">
      <View style={styles.headerRow}>
        <Text variant="micro" color={colors.gold}>
          ZONE ASSIGNED
        </Text>
        <AssignmentBadge status={assignment.status} testID="assignment-current-badge" />
      </View>
      <View accessible accessibilityLabel={summary} testID="assignment-summary">
        <Text variant="title" testID="assignment-current-zone">
          {assignment.zone.name}
        </Text>
        <Text variant="mono" color={colors.muted}>
          {assignment.zone.code}
        </Text>
        <Text variant="caption" color={colors.muted} testID="assignment-current-vehicle">
          Vehicle {assignment.vehicle.plateNumber}
        </Text>
        {assignment.expiresAt ? (
          <Text variant="caption" color={colors.muted} testID="assignment-current-validity">
            Valid until {formatDateTime(assignment.expiresAt)}
          </Text>
        ) : null}
      </View>
      {destinationReady ? (
        <NavigateButton
          destination={destination}
          label="Navigate to assigned zone"
          testID="assignment-navigate"
        />
      ) : null}
    </Card>
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
    <Card accent={colors.orange} testID="reservation-current">
      <View style={styles.headerRow}>
        <Text variant="micro" color={colors.orange}>
          RESERVED
        </Text>
        <ReservationBadge status={reservation.status} testID="reservation-current-badge" />
      </View>
      <View accessible accessibilityLabel={summary} testID="reservation-summary">
        <Text variant="title" testID="reservation-current-zone">
          {reservation.zone.name}
        </Text>
        <Text variant="mono" color={colors.muted}>
          {reservation.zone.code}
        </Text>
        <Text variant="caption" color={colors.muted} testID="reservation-current-vehicle">
          Vehicle {reservation.vehicle.plateNumber}
        </Text>
        <Text variant="caption" testID="reservation-current-window">
          Start {formatDateTime(reservation.startAt)} · End {formatDateTime(reservation.endAt)}
        </Text>
      </View>
      {destinationReady ? (
        <NavigateButton
          destination={destination}
          label="Navigate to parking"
          testID="reservation-navigate"
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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