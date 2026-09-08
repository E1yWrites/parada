import type {
  CameraStatus,
  GateType,
  OccupancySource,
  OccupancyEventType,
  ParkingSessionStatus,
  Role,
  SlotStatus,
  UserStatus,
  VehicleType,
  ZoneStatus,
} from "@parada/types";
import type { EstablishmentSettings } from "@parada/types";
import type {
  AdminCameraInput,
  AdminCameraUpdateInput,
  AdminZoneCreateInput,
  AdminZoneSlotsInput,
  AdminZoneUpdateInput,
} from "@parada/types";

export type { ParkingSessionStatus } from "@parada/types";
export type { EstablishmentSettings } from "@parada/types";
export type {
  AdminCameraInput,
  AdminCameraUpdateInput,
  AdminZoneCreateInput,
  AdminZoneSlotsInput,
  AdminZoneUpdateInput,
} from "@parada/types";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  createdAt: string;
}

export interface AuthResult {
  user: SessionUser;
  token?: string;
}

export type Availability = "AVAILABLE" | "LOW_AVAILABILITY" | "FULL" | "OFFLINE";

export interface AdminZone {
  id: string;
  name: string;
  code: string;
  description: string | null;
  capacity: number;
  occupiedCount: number;
  availableCount: number;
  occupancyPct: number;
  status: ZoneStatus;
  availability: Availability;
}

export interface AdminZoneDetail extends AdminZone {
  cameras: {
    id: string;
    identifier: string;
    name: string;
    gateType: GateType;
    status: CameraStatus;
  }[];
  entryCamera: { id: string; identifier: string; name: string } | null;
  exitCamera: { id: string; identifier: string; name: string } | null;
  physicalInventory: { total: number; active: number };
}

export interface AdminSlot {
  id: string;
  zoneId: string;
  slotCode: string;
  label: string;
  positionX: number | null;
  positionY: number | null;
  status: SlotStatus;
}

export interface ZoneOccupancy {
  zoneId: string;
  name: string;
  code: string;
  capacity: number;
  occupiedCount: number;
  availableCount: number;
  status: string;
}

export interface AdminCameraEvent {
  id: string;
  cameraId: string | null;
  eventType: OccupancyEventType;
  detectedPlate: string | null;
  detectedAt: string;
}

export interface AdminCamera {
  id: string;
  identifier: string;
  name: string;
  location: string | null;
  gateType: GateType;
  status: CameraStatus;
  zone: { id: string; name: string; code: string };
  recentEvents: AdminCameraEvent[];
}

export interface AdminSession {
  id: string;
  userId: string | null;
  vehicleId: string | null;
  status: ParkingSessionStatus;
  enteredAt: string;
  exitedAt: string | null;
  durationSeconds: number | null;
  user: { id: string; name: string; email: string } | null;
  zone: { id: string; name: string; code: string };
  vehicle: { id: string; plateNumber: string; vehicleType: VehicleType } | null;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  createdAt: string;
  _count: { vehicles: number; sessions: number };
}

export interface AdminVehicle {
  id: string;
  plateNumber: string;
  normalizedPlate: string;
  vehicleType: VehicleType;
  status: string;
  user: { id: string; name: string; email: string; role: Role };
}

export interface AdminNotification {
  id: string;
  zoneId: string | null;
  type:
    | "ZONE_FULL"
    | "ZONE_LOW_AVAILABILITY"
    | "RESERVATION_EXPIRING"
    | "GUEST_ADMISSION_ISSUE"
    | "WRONG_ZONE_WARNING"
    | "VIOLATION_ISSUED"
    | "VIOLATION_APPEAL_SUBMITTED"
    | "VIOLATION_APPEAL_RESULT";
  message: string;
  targetRole: Role;
  read: boolean;
  createdAt: string;
  zone: { id: string; name: string; code: string } | null;
}

export interface NotificationList {
  notifications: AdminNotification[];
  unreadCount: number;
}

export type AnomalyType =
  | "UNREGISTERED_PLATE"
  | "LOW_CONFIDENCE_PLATE"
  | "EXIT_WITHOUT_ACTIVE_SESSION"
  | "DUPLICATE_SESSION"
  | "GUEST_DENIED"
  | "GUEST_ADMITTED"
  | "GUEST_ADMIN_OVERRIDE"
  | "GUEST_EXIT_WITHOUT_SESSION"
  | "GUEST_EXIT_WRONG_ZONE"
  | "WRONG_ZONE_WARNING";

export interface AdminAnomaly {
  id: string;
  occupancyEventId: string | null;
  cameraId: string | null;
  vehicleId: string | null;
  detectedPlate: string | null;
  anomalyType: AnomalyType;
  description: string | null;
  resolved: boolean;
  createdAt: string;
  zoneId: string | null;
  zoneCode: string | null;
  cameraIdentifier: string | null;
  eventType: OccupancyEventType | null;
  source: OccupancySource | null;
}

export interface ZoneHistory {
  zone: { id: string; name: string; code: string; capacity: number };
  from: string | null;
  to: string | null;
  limit: number;
  entries: { id: string; occurredAt: string; occupiedCount: number; availableCount: number }[];
}

export interface AdminReservation {
  id: string;
  userId: string;
  vehicleId: string;
  zoneId: string;
  startAt: string;
  endAt: string;
  status: "PENDING" | "CONFIRMED" | "ACTIVE" | "EXPIRED" | "CANCELLED";
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string; email: string };
  zone: { id: string; name: string; code: string };
  vehicle: { id: string; plateNumber: string; vehicleType: VehicleType };
}

export interface AdminViolation {
  id: string;
  userId: string;
  vehicleId: string | null;
  zoneId: string;
  sessionId: string | null;
  violationType: string;
  description: string | null;
  fineAmount: number;
  status: string;
  issuedAt: string;
  createdAt: string;
  user: { id: string; name: string; email: string };
  vehicle: { id: string; plateNumber: string; vehicleType: VehicleType } | null;
  zone: { id: string; name: string; code: string };
  session: { id: string; zoneId: string; enteredAt: string; exitedAt: string | null; status: string } | null;
  appeal: AdminAppeal | null;
}

export interface AdminAppeal {
  id: string;
  violationId: string;
  userId: string;
  reason: string;
  status: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  user?: { id: string; name: string; email: string };
  violation?: { id: string; zone: { id: string; name: string; code: string }; vehicle: { id: string; plateNumber: string } | null };
}

export interface AdminAnalytics {
  from: string;
  to: string;
  current: { occupied: number; capacity: number };
  zones: { id: string; code: string; capacity: number; occupiedCount: number; availableCount: number }[];
  sessions: { total: number; active: number; completed: number; averageDurationSeconds: number };
  peakEntryHour: { hour: number; sessions: number } | null;
  revenue: { total: number; paid: number; fees: number };
  reservations: number;
  violations: number;
}

export interface GuestAdmitRequest {
  zoneId: string;
  cameraIdentifier: string;
  sourceEventId: string;
  detectedPlate: string | null;
}

export interface GuestAdmitResult {
  id: string;
  zoneId: string;
  eventType: "ENTRY";
  previousOccupied: number;
  newOccupied: number;
  availableCount: number;
  detectedPlate: string | null;
  normalizedPlate: string | null;
  admitted: boolean;
  deniedReason: string | null;
  anomalyType: string | null;
  guestSessionId: string | null;
}

export interface AdminDashboard {
  summary: {
    totalZones: number;
    totalCapacity: number;
    totalOccupied: number;
    totalAvailable: number;
    occupancyPct: number;
    activeSessions: number;
    onlineCameras: number;
    offlineCameras: number;
  };
  zones: AdminZone[];
  lowZones: AdminZone[];
  fullZones: AdminZone[];
  recentEvents: {
    id: string;
    zoneId: string;
    eventType: OccupancyEventType;
    detectedPlate: string | null;
    source: OccupancySource;
    detectedAt: string;
  }[];
  recentAnomalies: AdminAnomaly[];
  recentNotifications: AdminNotification[];
}

export type SimulatorScenario =
  | "SINGLE_ENTRY"
  | "SINGLE_EXIT"
  | "MULTIPLE_ENTRIES"
  | "MULTIPLE_EXITS"
  | "FILL_ZONE"
  | "UNKNOWN_VEHICLE"
  | "DUPLICATE_EVENT"
  | "COMPLETE_PARKING_LIFECYCLE";

export interface SimulatorStatus {
  runs: number;
  eventsProcessed: number;
  lastRunAt: string | null;
  scenarios: SimulatorScenario[];
}

export interface SimulatorResult {
  scenario: SimulatorScenario;
  zone: { id: string; name: string; code: string; capacity: number } | null;
  events: Record<string, unknown>[];
  rejects: { sourceEventId: string; message: string }[];
  occupancy: { occupiedCount: number; availableCount: number } | null;
}

export interface ApiErrorBody {
  error?: { code?: string; message?: string };
}
