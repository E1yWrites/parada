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
  | "GUEST_ADMISSION_ISSUE"
  | "WRONG_ZONE_WARNING"
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
export type ZoneAssignmentStatus = "ACTIVE" | "EXPIRED" | "REVOKED" | "CANCELLED";

export interface User {
  id: string;
  name: string;
  email: string;
  username: string | null;
  phone: string | null;
  role: Role;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  pendingEmail: string | null;
  pendingPhone: string | null;
  passwordChangedAt: Date | null;
  tokenVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The account as every API response exposes it (never includes the password
 * hash). `avatarUpdatedAt` is null while no profile picture is stored; when
 * set, the picture is served by GET /users/:id/avatar.
 */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  username: string | null;
  phone: string | null;
  role: Role;
  status: UserStatus;
  emailVerifiedAt: string | null;
  pendingEmail: string | null;
  pendingPhone: string | null;
  avatarUpdatedAt: string | null;
  createdAt: string;
}

/** When a freshly issued code/token expires and when a new one may be requested. */
export interface VerificationChallenge {
  expiresAt: string;
  resendAvailableAt: string;
}

/** POST /auth/register: the account exists but cannot sign in until verified. */
export interface RegisterResponse {
  user: AuthUser;
  verification: VerificationChallenge;
}

/** POST /auth/login and POST /auth/password: a usable bearer token. */
export interface LoginResponse {
  user: AuthUser;
  token: string;
}

/**
 * Error `details` carried by the EMAIL_NOT_VERIFIED (403) login refusal so the
 * client can continue verification without registering again. `verification`
 * is null when the resend cooldown blocked issuing a fresh code.
 */
export interface EmailNotVerifiedDetails {
  email: string;
  verification: VerificationChallenge | null;
}

export interface VerifyEmailInput {
  email: string;
  code: string;
}

export interface ResendVerificationInput {
  email: string;
}

export interface ForgotPasswordInput {
  email: string;
}

export interface ResetPasswordInput {
  token: string;
  newPassword: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

/** PATCH /auth/me — only non-verification-sensitive fields. */
export interface ProfileUpdateInput {
  name?: string;
  /** null clears the handle. */
  username?: string | null;
}

/** POST /auth/me/email — starts an email change; confirmed with the code sent to the NEW address. */
export interface EmailChangeRequestInput {
  email: string;
}

/** POST /auth/me/phone — starts a phone change; confirmed with the code sent to the verified email. */
export interface PhoneChangeRequestInput {
  /** null clears the phone number (no verification needed). */
  phone: string | null;
}

export interface ConfirmCodeInput {
  code: string;
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
  /** Admin-configured turn-by-turn destination; null until configured. */
  navigationLat: number | null;
  navigationLng: number | null;
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
  make: string | null;
  model: string | null;
  color: string | null;
  status: VehicleStatus;
  createdAt: Date;
  updatedAt: Date;
}

/** Body of POST /vehicles. */
export interface VehicleCreateInput {
  plateNumber: string;
  vehicleType: VehicleType;
  make?: string | null;
  model?: string | null;
  color?: string | null;
}

/** Body of PATCH /vehicles/:id (partial; owner only). */
export interface VehicleUpdateInput {
  plateNumber?: string;
  vehicleType?: VehicleType;
  make?: string | null;
  model?: string | null;
  color?: string | null;
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
  /** Null only for account-less guest sessions. */
  userId: string | null;
  /** Null only for account-less guest sessions. */
  vehicleId: string | null;
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
  /** Null for account-less GUEST sessions; always set for registered sessions. */
  userId: string | null;
  vehicleId: string | null;
  entryEventId: string;
  exitEventId: string | null;
  enteredAt: string;
  exitedAt: string | null;
  durationSeconds: number | null;
  feeAmount: number | null;
  status: ParkingSessionStatus;
  zone: Pick<ParkingZone, "id" | "name" | "code">;
  vehicle: Pick<Vehicle, "id" | "plateNumber" | "vehicleType"> | null;
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
  /**
   * Null for account-less GUEST sessions, mirroring `ParkingSession.userId`.
   * The column was made nullable in migration
   * 20260906120000_fees_guests_and_integrity_indexes; this contract had not
   * followed, so a consumer could treat a guest fee's owner as guaranteed.
   */
  userId: string | null;
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
    navigationLat: number | null;
    navigationLng: number | null;
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

/** GET /notifications item: the establishment scopes it to the current user. */
export interface NotificationResponse {
  id: string;
  zoneId: string;
  type: NotificationType;
  message: string;
  read: boolean;
  createdAt: string;
  zone: Pick<ParkingZone, "id" | "name" | "code">;
}

export interface ViolationAppealSummary {
  id: string;
  status: AppealStatus;
  reason: string;
  reviewedAt: string | null;
  createdAt: string;
}

/** GET /violations item. `appeal` is null until the driver disputes it. */
export interface ViolationResponse {
  id: string;
  userId: string;
  vehicleId: string | null;
  zoneId: string;
  sessionId: string | null;
  violationType: ViolationType;
  description: string | null;
  fineAmount: number;
  status: ViolationStatus;
  issuedAt: string;
  createdAt: string;
  updatedAt: string;
  zone: Pick<ParkingZone, "id" | "name" | "code">;
  vehicle: Pick<Vehicle, "id" | "plateNumber" | "vehicleType"> | null;
  appeal: ViolationAppealSummary | null;
}

/** Response of POST /violations/:id/appeal. */
export interface ViolationAppealResponse {
  id: string;
  violationId: string;
  userId: string;
  reason: string;
  status: AppealStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
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
}

export interface ZoneDefaultsConfig {
  maxReservationDurationMinutes: number;
  occupancyLowThreshold: number;
}

/**
 * Optional establishment-level navigation location (Phase 9.5). Zones carry no
 * coordinates, so navigation targets the parking establishment. Absent until an
 * admin configures a real address/coordinates — the app never fabricates a
 * destination.
 */
export interface EstablishmentLocation {
  address: string;
  latitude: number;
  longitude: number;
}

export interface EstablishmentSettings {
  parkingFee: ParkingFeeConfig;
  violations: ViolationPolicyConfig[];
  guestPolicy: GuestPolicyConfig;
  zoneDefaults: ZoneDefaultsConfig;
  location: EstablishmentLocation | null;
}

// ---------------------------------------------------------------------------
// Phase 11A — Admin establishment configuration contracts. Zone capacity is the
// authoritative availability metric; physical slots (ParkingSlot) are pure
// inventory/layout. Cameras are zone-gate infrastructure whose status is
// ONLINE (operational) / OFFLINE (disabled); an OFFLINE camera is rejected by
// the existing camera pipeline.
// ---------------------------------------------------------------------------

/** Body of POST /admin/zones. */
export interface AdminZoneCreateInput {
  name: string;
  code: string;
  description?: string | null;
  capacity: number;
  status?: ZoneStatus;
  /** Both or neither; validated server-side to WGS84 ranges. */
  navigationLat?: number | null;
  navigationLng?: number | null;
}

/** Body of PATCH /admin/zones/:id (partial update). */
export interface AdminZoneUpdateInput {
  name?: string;
  code?: string;
  description?: string | null;
  capacity?: number;
  status?: ZoneStatus;
  navigationLat?: number | null;
  navigationLng?: number | null;
}

/** Body of POST /admin/zones/:id/slots — desired ACTIVE physical inventory. */
export interface AdminZoneSlotsInput {
  slotCodes: string[];
}

/** Body of POST /admin/cameras. */
export interface AdminCameraInput {
  zoneId: string;
  identifier: string;
  name?: string;
  location?: string | null;
  gateType: GateType;
  status?: CameraStatus;
}

/** Body of PATCH /admin/cameras/:id (partial update). */
export interface AdminCameraUpdateInput {
  zoneId?: string;
  name?: string;
  location?: string | null;
  gateType?: GateType;
  status?: CameraStatus;
}

export * from "./realtime";
