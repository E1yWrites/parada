import type {
  CameraStatus,
  GateType,
  OccupancySource,
  OccupancyEventType,
  ParkingSessionStatus,
  Role,
  UserStatus,
  VehicleType,
  ZoneStatus,
} from "@parada/types";

export type { ParkingSessionStatus } from "@parada/types";

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
  status: ParkingSessionStatus;
  enteredAt: string;
  exitedAt: string | null;
  durationSeconds: number | null;
  user: { id: string; name: string; email: string };
  zone: { id: string; name: string; code: string };
  vehicle: { id: string; plateNumber: string; vehicleType: VehicleType };
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
  type: "ZONE_FULL" | "ZONE_LOW_AVAILABILITY";
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
  | "DUPLICATE_SESSION";

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
