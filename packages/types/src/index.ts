export type Role = "USER" | "ADMIN";
export type UserStatus = "ACTIVE" | "INACTIVE";
export type ZoneStatus = "ACTIVE" | "INACTIVE";
export type SlotStatus = "ACTIVE" | "INACTIVE";
export type CameraStatus = "ONLINE" | "OFFLINE";
export type GateType = "ENTRY" | "EXIT" | "BIDIRECTIONAL";
export type OccupancyEventType = "ENTRY" | "EXIT";
export type OccupancySource = "CAMERA" | "SIMULATOR" | "MANUAL";
export type ParkingSessionStatus = "ACTIVE" | "COMPLETED";
export type NotificationType =
  | "ZONE_FULL"
  | "ZONE_LOW_AVAILABILITY"
  | "RESERVATION_EXPIRING"
  | "VIOLATION_ISSUED"
  | "VIOLATION_APPEAL_SUBMITTED"
  | "VIOLATION_APPEAL_RESULT";
export type VehicleType = "CAR" | "MOTORCYCLE" | "VAN" | "TRUCK" | "OTHER";
export type VehicleStatus = "ACTIVE" | "INACTIVE";
export type GuestPolicy = "PRIMARY_ZONE" | "ALLOW_OVERFLOW" | "DENY_WHEN_FULL";
export type ViolationType =
  | "WRONG_ZONE"
  | "OVERSTAY"
  | "UNAUTHORIZED"
  | "GATE_TAMPERING";
export type ViolationStatus =
  | "PENDING"
  | "APPEALED"
  | "UPHELD"
  | "DISMISSED"
  | "FINE_PAID";
export type AppealStatus = "PENDING" | "APPROVED" | "REJECTED";
export type ReservationStatus =
  | "PENDING"
  | "CONFIRMED"
  | "ACTIVE"
  | "EXPIRED"
  | "CANCELLED";
export type FeeStatus = "PENDING" | "PAID" | "WAIVED";
export type ZoneAssignmentStatus = "ACTIVE" | "EXPIRED" | "REVOKED";

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
  feeAmount: number | null;
  status: ParkingSessionStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ParkingSessionResponse {
  id: string;
  zoneId: string;
  userId: string;
  vehicleId: string;
  entryEventId: string;
  exitEventId: string | null;
  enteredAt: string;
  exitedAt: string | null;
  durationSeconds: number | null;
  feeAmount: number | null;
  status: ParkingSessionStatus;
  zone: Pick<ParkingZone, "id" | "name" | "code">;
  vehicle: Pick<Vehicle, "id" | "plateNumber" | "vehicleType">;
  entryEvent: { id: string; detectedAt: string } | null;
  exitEvent: { id: string; detectedAt: string } | null;
}

export interface Notification {
  id: string;
  zoneId: string;
  userId: string | null;
  type: NotificationType;
  message: string;
  targetRole: Role;
  read: boolean;
  createdAt: Date;
}

export interface Reservation {
  id: string;
  userId: string;
  vehicleId: string;
  zoneId: string;
  startAt: Date;
  endAt: Date;
  status: ReservationStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ZoneAssignment {
  id: string;
  userId: string;
  vehicleId: string;
  zoneId: string;
  status: ZoneAssignmentStatus;
  assignedAt: Date;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Violation {
  id: string;
  userId: string;
  vehicleId: string | null;
  zoneId: string;
  sessionId: string | null;
  violationType: ViolationType;
  description: string | null;
  fineAmount: number;
  status: ViolationStatus;
  issuedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ViolationAppeal {
  id: string;
  violationId: string;
  userId: string;
  reason: string;
  status: AppealStatus;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ParkingFee {
  id: string;
  sessionId: string;
  zoneId: string;
  userId: string;
  amount: number;
  rateBreakdown: unknown;
  paidAt: Date | null;
  status: FeeStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface GuestSession {
  id: string;
  parkingSessionId: string;
  detectedPlate: string | null;
  linkedReservationId: string | null;
  createdAt: Date;
}

/** Recommendation DTO returned by GET /zones/recommendation. A recommendation
 *  is NOT an assignment; the user must explicitly accept the zone. */
export interface ZoneRecommendation {
  recommendedZone: {
    id: string;
    name: string;
    code: string;
    capacity: number;
    occupiedCount: number;
    availableCount: number;
    status: ZoneStatus;
  } | null;
}

export interface ReservationResponse {
  id: string;
  userId: string;
  vehicleId: string;
  zoneId: string;
  startAt: string;
  endAt: string;
  status: ReservationStatus;
  createdAt: string;
  updatedAt: string;
  zone: Pick<ParkingZone, "id" | "name" | "code">;
  vehicle: Pick<Vehicle, "id" | "plateNumber" | "vehicleType">;
}

export interface ZoneAssignmentResponse {
  id: string;
  userId: string;
  vehicleId: string;
  zoneId: string;
  status: ZoneAssignmentStatus;
  assignedAt: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  zone: Pick<ParkingZone, "id" | "name" | "code">;
  vehicle: Pick<Vehicle, "id" | "plateNumber" | "vehicleType">;
}

/** Input for a user-initiated parking entry (POST /sessions/entry). */
export interface SessionEntryInput {
  vehicleId: string;
  zoneId: string;
  enteredAt?: string | null;
}

/** Input for a user-initiated parking exit (POST /sessions/:id/exit). */
export interface SessionExitInput {
  exitedAt?: string | null;
}

/** Result of a completed parking exit, including the persisted fee. */
export interface SessionExitResult {
  session: ParkingSessionResponse;
  fee: {
    id: string;
    amount: number;
    status: FeeStatus;
    rateBreakdown: unknown;
  };
}

export interface ParkingFeeConfig {
  baseFee: number;
  baseDurationHours: number;
  additionalFeePerHour: number;
}

export interface ViolationPolicyConfig {
  type: ViolationType;
  fineAmount: number;
  description: string;
}

export interface GuestPolicyConfig {
  policy: GuestPolicy;
  primaryZoneId: string | null;
  maxDurationHours: number;
  allowWhenFull: boolean;
}

export interface ZoneDefaultsConfig {
  maxReservationDurationMinutes: number;
  occupancyLowThreshold: number;
}

export interface EstablishmentSettings {
  parkingFee: ParkingFeeConfig;
  violations: ViolationPolicyConfig[];
  guestPolicy: GuestPolicyConfig;
  zoneDefaults: ZoneDefaultsConfig;
}
