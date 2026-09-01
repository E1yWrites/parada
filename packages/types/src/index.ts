export type Role = "USER" | "ADMIN";
export type UserStatus = "ACTIVE" | "INACTIVE";
export type ZoneStatus = "ACTIVE" | "INACTIVE";
export type SlotStatus = "ACTIVE" | "INACTIVE";
export type CameraStatus = "ONLINE" | "OFFLINE";
export type GateType = "ENTRY" | "EXIT" | "BIDIRECTIONAL";
export type OccupancyEventType = "ENTRY" | "EXIT";
export type OccupancySource = "CAMERA" | "SIMULATOR" | "MANUAL";
export type ParkingSessionStatus = "ACTIVE" | "COMPLETED";
export type NotificationType = "ZONE_FULL" | "ZONE_LOW_AVAILABILITY";
export type VehicleType = "CAR" | "MOTORCYCLE" | "VAN" | "TRUCK" | "OTHER";
export type VehicleStatus = "ACTIVE" | "INACTIVE";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ParkingZone {
  id: string;
  name: string;
  code: string;
  description: string | null;
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
  slotCode: string;
  label: string;
  positionX: number | null;
  positionY: number | null;
  status: SlotStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface Vehicle {
  id: string;
  userId: string;
  plateNumber: string;
  normalizedPlate: string;
  vehicleType: VehicleType;
  status: VehicleStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface Camera {
  id: string;
  zoneId: string;
  name: string;
  identifier: string;
  location: string | null;
  gateType: GateType;
  status: CameraStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface OccupancyEvent {
  id: string;
  zoneId: string;
  cameraId: string | null;
  vehicleId: string | null;
  eventType: OccupancyEventType;
  previousOccupied: number;
  newOccupied: number;
  availableCount: number;
  source: OccupancySource;
  sourceEventId: string | null;
  detectedPlate: string | null;
  normalizedPlate: string | null;
  ocrConfidence: number | null;
  plateMatched: boolean | null;
  detectedAt: Date;
  processedAt: Date;
  createdAt: Date;
}

export interface OccupancyHistory {
  id: string;
  zoneId: string;
  occupiedCount: number;
  availableCount: number;
  occurredAt: Date;
}

export interface ParkingSession {
  id: string;
  zoneId: string;
  userId: string;
  vehicleId: string;
  entryEventId: string;
  exitEventId: string | null;
  enteredAt: Date;
  exitedAt: Date | null;
  durationSeconds: number | null;
  status: ParkingSessionStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface Notification {
  id: string;
  zoneId: string;
  type: NotificationType;
  message: string;
  targetRole: Role;
  read: boolean;
  createdAt: Date;
}
