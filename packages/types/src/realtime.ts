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

export type RealtimeEvent =
  | { type: "ZONE_OCCUPANCY_UPDATED"; occurredAt: string; payload: ZoneOccupancyPayload }
  | { type: "PARKING_SESSION_STARTED"; occurredAt: string; payload: ParkingSessionResponse }
  | { type: "PARKING_SESSION_COMPLETED"; occurredAt: string; payload: ParkingSessionResponse }
  | { type: "RESERVATION_CREATED"; occurredAt: string; payload: ReservationResponse }
  | { type: "RESERVATION_CANCELLED"; occurredAt: string; payload: ReservationResponse }
  | { type: "ASSIGNMENT_CREATED"; occurredAt: string; payload: ZoneAssignmentResponse }
  | { type: "VIOLATION_CREATED"; occurredAt: string; payload: ViolationResponse }
  | { type: "GUEST_ADMISSION_ISSUE"; occurredAt: string; payload: GuestAdmissionPayload }
  | { type: "NOTIFICATION_CREATED"; occurredAt: string; payload: NotificationCreatedPayload };

export type RealtimeEventType = RealtimeEvent["type"];

const EVENT_TYPES: readonly RealtimeEventType[] = [
  "ZONE_OCCUPANCY_UPDATED",
  "PARKING_SESSION_STARTED",
  "PARKING_SESSION_COMPLETED",
  "RESERVATION_CREATED",
  "RESERVATION_CANCELLED",
  "ASSIGNMENT_CREATED",
  "VIOLATION_CREATED",
  "GUEST_ADMISSION_ISSUE",
  "NOTIFICATION_CREATED",
];

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
    typeof v["payload"] === "object" &&
    v["payload"] !== null
  );
}
