import type {
  NotificationType,
  ParkingSessionResponse,
  ReservationResponse,
  ViolationResponse,
  ZoneAssignmentResponse,
  ZoneStatus,
} from "./index";

/** Public zone snapshot pushed on every occupancy change. Same shape GET /zones
 *  already returns for one zone — the realtime channel never invents a shape
 *  clients don't already know how to render. */
export interface ZoneOccupancyPayload {
  zoneId: string;
  name: string;
  code: string;
  capacity: number;
  occupiedCount: number;
  availableCount: number;
  status: ZoneStatus;
}

export interface GuestAdmissionPayload {
  zoneId: string;
  admitted: boolean;
  deniedReason: string | null;
  anomalyType: string | null;
}

export interface NotificationCreatedPayload {
  id: string;
  zoneId: string;
  userId: string | null;
  type: NotificationType;
  message: string;
  targetRole: "USER" | "ADMIN";
  createdAt: string;
}

interface Envelope<TType extends string, TPayload> {
  type: TType;
  occurredAt: string;
  payload: TPayload;
}

/**
 * What a producer hands the hub. Deliberately has no `seq`: only the hub may
 * assign one, so a route can never mint an ordering number and no two events
 * can claim the same position.
 */
export type RealtimeEventInput =
  | Envelope<"ZONE_OCCUPANCY_UPDATED", ZoneOccupancyPayload>
  | Envelope<"PARKING_SESSION_STARTED", ParkingSessionResponse>
  | Envelope<"PARKING_SESSION_COMPLETED", ParkingSessionResponse>
  | Envelope<"RESERVATION_CREATED", ReservationResponse>
  | Envelope<"RESERVATION_CANCELLED", ReservationResponse>
  | Envelope<"ASSIGNMENT_CREATED", ZoneAssignmentResponse>
  | Envelope<"ASSIGNMENT_CANCELLED", ZoneAssignmentResponse>
  | Envelope<"VIOLATION_CREATED", ViolationResponse>
  /** Status moved after issue — an admin dismissal, or an appeal decision. The
   *  driver's cached violation is otherwise stale until they pull to refresh. */
  | Envelope<"VIOLATION_UPDATED", ViolationResponse>
  | Envelope<"GUEST_ADMISSION_ISSUE", GuestAdmissionPayload>
  | Envelope<"NOTIFICATION_CREATED", NotificationCreatedPayload>;

/**
 * What a client receives. `seq` is the hub's monotonically increasing counter,
 * mirrored onto the SSE `id:` line so both `EventSource` implementations echo
 * it back as `Last-Event-ID` when they reconnect.
 *
 * `occurredAt` is a wall clock and is NOT an ordering key: two events can share
 * a millisecond, and clocks are not a contract. `seq` is the only ordering key.
 */
export type RealtimeEvent = RealtimeEventInput & { seq: number };

export type RealtimeEventType = RealtimeEvent["type"];

const EVENT_TYPES: readonly RealtimeEventType[] = [
  "ZONE_OCCUPANCY_UPDATED",
  "PARKING_SESSION_STARTED",
  "PARKING_SESSION_COMPLETED",
  "RESERVATION_CREATED",
  "RESERVATION_CANCELLED",
  "ASSIGNMENT_CREATED",
  "ASSIGNMENT_CANCELLED",
  "VIOLATION_CREATED",
  "VIOLATION_UPDATED",
  "GUEST_ADMISSION_ISSUE",
  "NOTIFICATION_CREATED",
];

/**
 * Control frame, sent when the hub cannot replay everything a reconnecting
 * client missed (its cursor has aged out of the replay buffer). It carries no
 * parking state — it only tells the client "your cache may be behind, refetch
 * from the authoritative REST endpoints". Deliberately outside RealtimeEvent:
 * it is transport bookkeeping, not a domain event.
 */
export const REALTIME_SYNC_EVENT = "SYNC";

export interface RealtimeSyncFrame {
  reason: "GAP";
  /** The cursor the client presented, or null when it presented none. */
  sinceSeq: number | null;
  /** The hub's current head, so the client can resume ordering from here. */
  headSeq: number;
}

/** Runtime guard for a value decoded from an SSE `data:` line. Never trust the
 *  wire without checking shape — a malformed/truncated frame must not crash
 *  the client's event handler. */
export function isRealtimeEvent(value: unknown): value is RealtimeEvent {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["type"] === "string" &&
    (EVENT_TYPES as readonly string[]).includes(v["type"]) &&
    typeof v["occurredAt"] === "string" &&
    typeof v["seq"] === "number" &&
    Number.isFinite(v["seq"]) &&
    typeof v["payload"] === "object" &&
    v["payload"] !== null
  );
}

export function isRealtimeSyncFrame(value: unknown): value is RealtimeSyncFrame {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v["reason"] === "GAP" && typeof v["headSeq"] === "number";
}
