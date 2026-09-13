import { prisma } from "@parada/database";
import type { Notification } from "@parada/database";
import type { ParkingSessionResponse } from "@parada/types";
import type { OccupancyService } from "../domain/occupancy";
import { ZoneService } from "../domain/zones";
import type { RealtimeHub } from "./hub";

type ProcessEventResult = Awaited<ReturnType<OccupancyService["processEvent"]>>;

/**
 * The pipeline's `notifications` list exists only so routes can publish it
 * over realtime; it is never part of an HTTP response. Returns the result
 * without that key (the SIMULATOR guest path returns a bare event and is
 * passed through unchanged).
 */
export function withoutNotifications<T extends ProcessEventResult>(
  result: T
): T extends { notifications: unknown } ? Omit<T, "notifications"> : T {
  if (typeof result === "object" && result !== null && "notifications" in result) {
    const { notifications: _notifications, ...rest } = result;
    return rest as never;
  }
  return result as never;
}

const sessionInclude = {
  zone: { select: { id: true, name: true, code: true } },
  vehicle: { select: { id: true, plateNumber: true, vehicleType: true } },
  entryEvent: { select: { id: true, detectedAt: true } },
  exitEvent: { select: { id: true, detectedAt: true } },
} as const;

/**
 * Publishes the realtime consequences of one committed occupancy event, in the
 * same shapes the user-initiated session routes already emit. Called by the
 * camera-ingestion route and the admin guest-admission route only AFTER
 * `OccupancyService.processEvent` has resolved (i.e. its transaction
 * committed) — a rejected event never reaches here, so nothing is published
 * for rolled-back state.
 *
 * Everything published is read back from the database, never derived from
 * the mutation's own return value, so a client that invalidates on an event
 * always refetches the committed row.
 *
 *  - ZONE_OCCUPANCY_UPDATED (PUBLIC): the zone's committed occupancy.
 *  - PARKING_SESSION_STARTED / PARKING_SESSION_COMPLETED (USER): the
 *    registered vehicle's session opened/closed by this event, addressed to
 *    its owner. Guest sessions have no user and publish nothing here.
 *  - VIOLATION_CREATED (USER): a wrong-zone escalation, to the driver.
 *  - GUEST_ADMISSION_ISSUE (ADMIN): the guest admission decision.
 *  - NOTIFICATION_CREATED: every Notification row the pipeline wrote —
 *    USER-targeted ones go to that user, ADMIN-targeted ones to admins.
 */
export async function publishOccupancyOutcome(
  hub: RealtimeHub,
  zoneId: string,
  result: ProcessEventResult,
  zones: ZoneService = new ZoneService()
): Promise<void> {
  const occurredAt = new Date().toISOString();

  await publishZoneSnapshot(hub, zoneId, zones, occurredAt);

  if ("event" in result) {
    const { event, violation } = result;
    // The session this event opened (ENTRY) or closed (EXIT). An EXIT with no
    // active session records an anomaly and has nothing to publish.
    const session = await prisma.parkingSession.findFirst({
      where: event.eventType === "ENTRY" ? { entryEventId: event.id } : { exitEventId: event.id },
      include: sessionInclude,
    });
    if (session && session.userId) {
      hub.publish(
        {
          type: event.eventType === "ENTRY" ? "PARKING_SESSION_STARTED" : "PARKING_SESSION_COMPLETED",
          occurredAt,
          payload: toSessionResponse(session),
        },
        { audience: "USER", userId: session.userId }
      );
    }
    if (violation) {
      hub.publish(
        { type: "VIOLATION_CREATED", occurredAt, payload: violation as never },
        { audience: "USER", userId: violation.userId }
      );
    }
  } else if ("admitted" in result) {
    hub.publish(
      {
        type: "GUEST_ADMISSION_ISSUE",
        occurredAt,
        payload: {
          zoneId,
          admitted: result.admitted,
          deniedReason: result.deniedReason,
          anomalyType: result.anomalyType,
        },
      },
      { audience: "ADMIN" }
    );
  }

  const notifications: Notification[] = "notifications" in result ? result.notifications : [];
  for (const notification of notifications) {
    hub.publish(
      {
        type: "NOTIFICATION_CREATED",
        occurredAt,
        payload: {
          id: notification.id,
          zoneId: notification.zoneId,
          userId: notification.userId,
          type: notification.type,
          message: notification.message,
          targetRole: notification.targetRole,
          createdAt: notification.createdAt.toISOString(),
        },
      },
      notification.targetRole === "USER" && notification.userId
        ? { audience: "USER", userId: notification.userId }
        : { audience: "ADMIN" }
    );
  }
}

/**
 * Publishes the zone's committed occupancy/availability snapshot (PUBLIC).
 * Used after anything that changes what `GET /zones` would return for the
 * zone: an occupancy event, a simulator run, or an admin capacity/status edit.
 */
export async function publishZoneSnapshot(
  hub: RealtimeHub,
  zoneId: string,
  zones: ZoneService = new ZoneService(),
  occurredAt: string = new Date().toISOString()
): Promise<void> {
  const zone = await zones.getById(zoneId);
  hub.publish(
    {
      type: "ZONE_OCCUPANCY_UPDATED",
      occurredAt,
      payload: {
        zoneId: zone.id,
        name: zone.name,
        code: zone.code,
        capacity: zone.capacity,
        occupiedCount: zone.occupiedCount,
        availableCount: zone.availableCount,
        status: zone.status,
      },
    },
    { audience: "PUBLIC" }
  );
}

function toSessionResponse(session: {
  id: string;
  zoneId: string;
  userId: string | null;
  vehicleId: string | null;
  entryEventId: string;
  exitEventId: string | null;
  enteredAt: Date;
  exitedAt: Date | null;
  durationSeconds: number | null;
  feeAmount: number | null;
  status: "ACTIVE" | "COMPLETED";
  zone: ParkingSessionResponse["zone"];
  vehicle: ParkingSessionResponse["vehicle"];
  entryEvent: { id: string; detectedAt: Date } | null;
  exitEvent: { id: string; detectedAt: Date } | null;
}): ParkingSessionResponse {
  return {
    ...session,
    enteredAt: session.enteredAt.toISOString(),
    exitedAt: session.exitedAt?.toISOString() ?? null,
    entryEvent: session.entryEvent
      ? { ...session.entryEvent, detectedAt: session.entryEvent.detectedAt.toISOString() }
      : null,
    exitEvent: session.exitEvent
      ? { ...session.exitEvent, detectedAt: session.exitEvent.detectedAt.toISOString() }
      : null,
  };
}
