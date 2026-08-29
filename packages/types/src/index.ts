export type Role = "USER" | "ADMIN";

export type ZoneStatus = "ACTIVE" | "INACTIVE";

export type SlotStatus = "ACTIVE" | "INACTIVE";

export type CameraStatus = "ONLINE" | "OFFLINE";

export type OccupancyEventType = "ENTRY" | "EXIT";

export type ParkingSessionStatus = "ACTIVE" | "COMPLETED";

export interface User {
  id: string;
  email: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}

export interface ParkingZone {
  id: string;
  name: string;
  capacity: number;
  occupiedCount: number;
  availableCount: number;
  status: ZoneStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ParkingSlot {
  id: string;
  zoneId: string;
  label: string;
  status: SlotStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface Camera {
  id: string;
  zoneId: string;
  name: string;
  status: CameraStatus;
  config: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface OccupancyEvent {
  id: string;
  zoneId: string;
  type: OccupancyEventType;
  occurredAt: Date;
}

export interface ParkingSession {
  id: string;
  zoneId: string;
  enteredAt: Date;
  exitedAt: Date | null;
  durationSeconds: number | null;
  status: ParkingSessionStatus;
}
