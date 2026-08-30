import type {
  User,
  ParkingZone,
  Vehicle,
  Camera,
  OccupancyEvent,
  ParkingSession,
  Notification,
  OccupancyAnomaly,
  AdminCamera,
  AdminDashboard,
  AdminZoneSummary,
  AdminNotification,
  AdminAnomaly,
} from "@parada/types";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: "USER" | "ADMIN";
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
}

export interface ApiError {
  code: string;
  message: string;
  status: number;
}

export interface AuthResult {
  user: SessionUser;
}

export interface NotificationList {
  notifications: AdminNotification[];
  unreadCount: number;
}

export interface AdminSession {
  id: string;
  zoneId: string;
  userId: string;
  vehicleId: string;
  entryEventId: string;
  exitEventId: string | null;
  enteredAt: string;
  exitedAt: string | null;
  durationSeconds: number | null;
  status: "ACTIVE" | "COMPLETED";
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string; email: string };
  zone: { id: string; name: string; code: string };
  vehicle: { id: string; plateNumber: string; vehicleType: string };
  entryEvent: { id: string; detectedAt: string };
  exitEvent: { id: string; detectedAt: string } | null;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: "USER" | "ADMIN";
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  _count: { vehicles: number; sessions: number };
}

export interface AdminZoneDetail extends AdminZoneSummary {
  cameras: {
    id: string;
    identifier: string;
    name: string;
    gateType: "ENTRY" | "EXIT" | "BIDIRECTIONAL";
    status: "ONLINE" | "OFFLINE";
  }[];
  entryCamera: {
    id: string;
    identifier: string;
    name: string;
    gateType: "ENTRY" | "EXIT" | "BIDIRECTIONAL";
    status: "ONLINE" | "OFFLINE";
  } | null;
  exitCamera: {
    id: string;
    identifier: string;
    name: string;
    gateType: "ENTRY" | "EXIT" | "BIDIRECTIONAL";
    status: "ONLINE" | "OFFLINE";
  } | null;
}

export interface ZoneHistory {
  zone: { id: string; name: string; code: string; capacity: number };
  from: string | null;
  to: string | null;
  limit: number;
  entries: {
    id: string;
    occurredAt: string;
    occupiedCount: number;
    availableCount: number;
  }[];
}

export interface SimulatorStatus {
  runs: number;
  eventsProcessed: number;
  lastRunAt: string | null;
  scenarios: string[];
}

export interface SimulatorResult {
  scenario: string;
  zone: { id: string; name: string; code: string; capacity: number };
  events: Record<string, unknown>[];
  rejects: { sourceEventId: string; message: string }[];
  occupancy: { occupiedCount: number; availableCount: number };
}

export type {
  User,
  ParkingZone,
  Vehicle,
  Camera,
  OccupancyEvent,
  ParkingSession,
  Notification,
  OccupancyAnomaly,
  AdminCamera,
  AdminDashboard,
  AdminZoneSummary,
  AdminAnomaly,
  AdminNotification,
};
