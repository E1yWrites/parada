import type {
  AuthUser,
  LoginResponse,
  NotificationResponse,
  ParkingSessionResponse,
  RegisterResponse,
  ReservationResponse,
  Vehicle,
  VehicleCreateInput,
  VehicleUpdateInput,
  VerificationChallenge,
  ViolationAppealResponse,
  ViolationResponse,
  ZoneAssignmentResponse,
  ZoneRecommendation,
} from "@parada/types";
import { getToken, notifyAuthInvalidated } from "@/lib/auth/session";

/** Public zone availability exposed by GET /zones (backend contract). */
export type ZoneAvailability = "AVAILABLE" | "LOW_AVAILABILITY" | "FULL" | "OFFLINE";

/** Public zone payload (backend adds status + availability in Phase 8). */
export type PublicZone = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  capacity: number;
  occupiedCount: number;
  availableCount: number;
  status: "ACTIVE" | "INACTIVE";
  availability: ZoneAvailability;
  /** Admin-configured turn-by-turn destination for this zone; null until set. */
  navigationLat: number | null;
  navigationLng: number | null;
};

/** GET /zones/:zoneId/occupancy payload (backend returns `zoneId`, not `id`). */
export type ZoneOccupancy = Pick<
  PublicZone,
  "name" | "code" | "capacity" | "occupiedCount" | "availableCount"
> & {
  zoneId: string;
  status: "ACTIVE" | "INACTIVE";
  availability: ZoneAvailability;
};

/** Enriched session DTO as returned by /sessions and /sessions/active. */
export type SessionDto = ParkingSessionResponse;

/** Input for POST /assignments (backend requires an owned vehicle). */
export type CreateAssignmentInput = { zoneId: string; vehicleId: string };

/** Input for POST /reservations. `startAt`/`endAt` are optional ISO strings;
 *  the backend defaults to an immediate arrival window. */
export type CreateReservationInput = {
  zoneId: string;
  vehicleId: string;
  startAt?: string;
  endAt?: string;
};

/** GET /notifications payload: `{ notifications, unreadCount }`. */
export type NotificationsPayload = { notifications: NotificationResponse[]; unreadCount: number };

/** Account shape returned by /auth/me and embedded in auth responses. */
export type UserDto = AuthUser;

/** Auth response from /auth/login and /auth/password. */
export type AuthResponse = LoginResponse;

/** Where the API serves a user's profile picture (authenticated; owner or admin). */
export function avatarUrl(user: Pick<AuthUser, "id" | "avatarUpdatedAt"> | null | undefined): string | null {
  if (!user || !user.avatarUpdatedAt) {
    return null;
  }
  return `${API_ROOT}/users/${encodeURIComponent(user.id)}/avatar?v=${encodeURIComponent(user.avatarUpdatedAt)}`;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Raw bytes (profile picture upload); sent with `contentType` instead of JSON. */
  rawBody?: Blob;
  contentType?: string;
  /** Skip Authorization header (public routes like /zones, /auth/login). */
  public?: boolean;
  /** Skip global 401 session invalidation (login/register handle their own). */
  invalidateOnUnauthorized?: boolean;
};

const API_ROOT = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4100").replace(/\/+$/, "");
const REQUEST_TIMEOUT_MS = 20_000;

async function fetchWithTimeout(path: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${API_ROOT}${path}`, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) {
    return err;
  }
  if (err instanceof DOMException && err.name === "AbortError") {
    return new ApiError("TIMEOUT", "The request timed out. Check your connection and try again.", 0);
  }
  return new ApiError("NETWORK", "Cannot reach the PARADA server. Check your connection and try again.", 0);
}

function isSessionResponse(value: unknown): value is SessionDto {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const session = value as Record<string, unknown>;
  const zone = session.zone;
  const vehicle = session.vehicle;
  return (
    typeof session.id === "string" &&
    typeof session.status === "string" &&
    typeof session.enteredAt === "string" &&
    typeof zone === "object" &&
    zone !== null &&
    typeof (zone as Record<string, unknown>).name === "string" &&
    // `vehicle` is null for legitimate account-less GUEST sessions; when a
    // vehicle is present it must still carry its plate (registered sessions).
    (vehicle === null ||
      (typeof vehicle === "object" &&
        typeof (vehicle as Record<string, unknown>).plateNumber === "string"))
  );
}

function requireSessionResponse(value: SessionDto | null): SessionDto | null {
  if (value === null) {
    return null;
  }
  if (!isSessionResponse(value)) {
    throw new ApiError(
      "INVALID_SESSION_RESPONSE",
      "We couldn't load your parking session.",
      502,
    );
  }
  return value;
}

function isZoneRef(value: unknown): value is ZoneAssignmentResponse["zone"] {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const ref = value as Record<string, unknown>;
  return (
    typeof ref.id === "string" &&
    typeof ref.name === "string" &&
    typeof ref.code === "string"
  );
}

function isVehicleRef(value: unknown): value is ReservationResponse["vehicle"] {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const ref = value as Record<string, unknown>;
  return (
    typeof ref.id === "string" &&
    typeof ref.plateNumber === "string" &&
    typeof ref.vehicleType === "string"
  );
}

/** GET /zones/recommendation payload: `{ recommendedZone }` where the zone may
 *  be null (the backend never returns a bare null payload). */
function isRecommendation(value: unknown): value is ZoneRecommendation {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const recommendedZone = (value as Record<string, unknown>).recommendedZone;
  if (recommendedZone === null) {
    return true;
  }
  if (typeof recommendedZone !== "object" || recommendedZone === null) {
    return false;
  }
  const zone = recommendedZone as Record<string, unknown>;
  return (
    typeof zone.id === "string" &&
    typeof zone.name === "string" &&
    typeof zone.code === "string" &&
    typeof zone.capacity === "number" &&
    typeof zone.occupiedCount === "number" &&
    typeof zone.availableCount === "number" &&
    typeof zone.status === "string"
  );
}

function isAssignmentResponse(value: unknown): value is ZoneAssignmentResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const assignment = value as Record<string, unknown>;
  return (
    typeof assignment.id === "string" &&
    typeof assignment.userId === "string" &&
    typeof assignment.vehicleId === "string" &&
    typeof assignment.zoneId === "string" &&
    typeof assignment.status === "string" &&
    typeof assignment.assignedAt === "string" &&
    (assignment.expiresAt === null || typeof assignment.expiresAt === "string") &&
    typeof assignment.createdAt === "string" &&
    isZoneRef(assignment.zone) &&
    typeof assignment.vehicle === "object" &&
    assignment.vehicle !== null &&
    isVehicleRef(assignment.vehicle)
  );
}

function isReservationResponse(value: unknown): value is ReservationResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const reservation = value as Record<string, unknown>;
  return (
    typeof reservation.id === "string" &&
    typeof reservation.userId === "string" &&
    typeof reservation.vehicleId === "string" &&
    typeof reservation.zoneId === "string" &&
    typeof reservation.startAt === "string" &&
    typeof reservation.endAt === "string" &&
    typeof reservation.status === "string" &&
    typeof reservation.createdAt === "string" &&
    isZoneRef(reservation.zone) &&
    typeof reservation.vehicle === "object" &&
    reservation.vehicle !== null &&
    isVehicleRef(reservation.vehicle)
  );
}

function isNotificationResponse(value: unknown): value is NotificationResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const n = value as Record<string, unknown>;
  return (
    typeof n.id === "string" &&
    typeof n.zoneId === "string" &&
    typeof n.type === "string" &&
    typeof n.message === "string" &&
    typeof n.read === "boolean" &&
    typeof n.createdAt === "string" &&
    isZoneRef(n.zone)
  );
}

function isNotificationsPayload(value: unknown): value is NotificationsPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.unreadCount === "number" &&
    Array.isArray(payload.notifications) &&
    payload.notifications.every(isNotificationResponse)
  );
}

function isViolationResponse(value: unknown): value is ViolationResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  const appeal = v.appeal;
  return (
    typeof v.id === "string" &&
    typeof v.zoneId === "string" &&
    typeof v.violationType === "string" &&
    typeof v.fineAmount === "number" &&
    typeof v.status === "string" &&
    typeof v.issuedAt === "string" &&
    isZoneRef(v.zone) &&
    (v.vehicle === null || (typeof v.vehicle === "object" && v.vehicle !== null && typeof (v.vehicle as Record<string, unknown>).plateNumber === "string")) &&
    (appeal === null ||
      (typeof appeal === "object" &&
        appeal !== null &&
        typeof (appeal as Record<string, unknown>).id === "string" &&
        typeof (appeal as Record<string, unknown>).status === "string"))
  );
}

function isViolationAppealResponse(value: unknown): value is ViolationAppealResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const a = value as Record<string, unknown>;
  return (
    typeof a.id === "string" &&
    typeof a.violationId === "string" &&
    typeof a.reason === "string" &&
    typeof a.status === "string" &&
    typeof a.createdAt === "string"
  );
}

function requireValidatedObject<T>(
  value: T | null,
  guard: (item: unknown) => item is T,
  code: string,
  message: string,
): T {
  if (value === null || !guard(value)) {
    throw new ApiError(code, message, 502);
  }
  return value;
}

function requireValidatedList<T>(
  value: unknown,
  guard: (item: unknown) => item is T,
  code: string,
  message: string,
): T[] {
  if (!Array.isArray(value) || !value.every(guard)) {
    throw new ApiError(code, message, 502);
  }
  return value;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method = opts.method ?? "GET";
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
  } else if (opts.rawBody !== undefined) {
    headers["Content-Type"] = opts.contentType ?? "application/octet-stream";
  }
  if (!opts.public) {
    const token = await getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(path, {
      method,
      headers,
      body: opts.body === undefined ? opts.rawBody : JSON.stringify(opts.body),
    });
  } catch (err) {
    throw toApiError(err);
  }

  let payload: { data?: T; error?: { code?: string; message?: string; details?: unknown } } | null = null;
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const body = payload as
      | { error?: { code?: string; message?: string; details?: unknown } }
      | null
      | undefined;
    const status = response.status;
    const code = body?.error?.code ?? (status === 401 ? "UNAUTHORIZED" : "REQUEST_FAILED");
    // Never surface raw HTTP status codes. Prefer the backend's human-readable
    // message; otherwise fall back to a concise, non-technical line.
    const message = body?.error?.message ?? "Something went wrong. Please try again.";
    if (status === 401 && opts.invalidateOnUnauthorized !== false) {
      await notifyAuthInvalidated();
    }
    throw new ApiError(code, message, status, body?.error?.details);
  }

  const body = payload as { data?: T } | null | undefined;
  // A `{ data: ... }` envelope is authoritative even when its value is null
  // (e.g. GET /sessions/active with no active session). Only when the payload
  // has no `data` key at all (bare responses / empty bodies) is it returned
  // directly.
  if (body != null && "data" in body) {
    return body.data as T;
  }
  return body as T;
}

/** Backend client used across the app. */
export const api = {
  me: () => request<UserDto>("/auth/me"),
  login: (email: string, password: string) =>
    request<AuthResponse>("/auth/login", {
      method: "POST",
      body: { email, password },
      public: true,
      invalidateOnUnauthorized: false,
    }),
  register: (name: string, email: string, password: string) =>
    request<RegisterResponse>("/auth/register", {
      method: "POST",
      body: { name, email, password },
      public: true,
      invalidateOnUnauthorized: false,
    }),
  verifyEmail: (email: string, code: string) =>
    request<{ user: UserDto }>("/auth/verify-email", {
      method: "POST",
      body: { email, code },
      public: true,
      invalidateOnUnauthorized: false,
    }),
  resendVerification: (email: string) =>
    request<{ verification: VerificationChallenge | null }>("/auth/resend-verification", {
      method: "POST",
      body: { email },
      public: true,
      invalidateOnUnauthorized: false,
    }),
  forgotPassword: (email: string) =>
    request<{ message: string }>("/auth/forgot-password", {
      method: "POST",
      body: { email },
      public: true,
      invalidateOnUnauthorized: false,
    }),
  resetPassword: (token: string, newPassword: string) =>
    request<{ user: UserDto }>("/auth/reset-password", {
      method: "POST",
      body: { token, newPassword },
      public: true,
      invalidateOnUnauthorized: false,
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<AuthResponse>("/auth/password", {
      method: "POST",
      body: { currentPassword, newPassword, confirmPassword: newPassword },
    }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),

  updateProfile: (input: { name?: string; username?: string | null }) =>
    request<UserDto>("/auth/me", { method: "PATCH", body: input }),
  requestEmailChange: (email: string) =>
    request<{ verification: VerificationChallenge }>("/auth/me/email", { method: "POST", body: { email } }),
  confirmEmailChange: (code: string) =>
    request<UserDto>("/auth/me/email/confirm", { method: "POST", body: { code } }),
  cancelEmailChange: () => request<UserDto>("/auth/me/email", { method: "DELETE" }),
  requestPhoneChange: (phone: string) =>
    request<{ verification: VerificationChallenge }>("/auth/me/phone", { method: "POST", body: { phone } }),
  clearPhone: () => request<{ user: UserDto }>("/auth/me/phone", { method: "POST", body: { phone: null } }),
  confirmPhoneChange: (code: string) =>
    request<UserDto>("/auth/me/phone/confirm", { method: "POST", body: { code } }),
  uploadAvatar: (image: Blob, contentType: string) =>
    request<UserDto>("/auth/me/avatar", { method: "PUT", rawBody: image, contentType }),
  removeAvatar: () => request<UserDto>("/auth/me/avatar", { method: "DELETE" }),

  zones: () => request<PublicZone[]>("/zones", { public: true }),
  zoneOccupancy: (zoneId: string) => request<ZoneOccupancy>(`/zones/${zoneId}/occupancy`, { public: true }),
  recommendedZone: async () =>
    requireValidatedObject(
      await request<ZoneRecommendation>("/zones/recommendation", { public: true }),
      isRecommendation,
      "INVALID_RECOMMENDATION_RESPONSE",
      "We couldn't load a parking recommendation.",
    ),

  assignments: async () =>
    requireValidatedList(
      await request<ZoneAssignmentResponse[]>("/assignments"),
      isAssignmentResponse,
      "INVALID_ASSIGNMENT_RESPONSE",
      "We couldn't load your zone assignment.",
    ),
  createAssignment: async (input: CreateAssignmentInput) =>
    requireValidatedObject(
      await request<ZoneAssignmentResponse>("/assignments", { method: "POST", body: input }),
      isAssignmentResponse,
      "INVALID_ASSIGNMENT_RESPONSE",
      "We couldn't confirm your zone assignment.",
    ),
  cancelAssignment: async (assignmentId: string) =>
    requireValidatedObject(
      await request<ZoneAssignmentResponse>(`/assignments/${assignmentId}/cancel`, { method: "PATCH" }),
      isAssignmentResponse,
      "INVALID_ASSIGNMENT_RESPONSE",
      "We couldn't cancel your zone assignment.",
    ),

  reservations: async () =>
    requireValidatedList(
      await request<ReservationResponse[]>("/reservations"),
      isReservationResponse,
      "INVALID_RESERVATION_RESPONSE",
      "We couldn't load your reservations.",
    ),
  createReservation: async (input: CreateReservationInput) =>
    requireValidatedObject(
      await request<ReservationResponse>("/reservations", { method: "POST", body: input }),
      isReservationResponse,
      "INVALID_RESERVATION_RESPONSE",
      "We couldn't confirm your reservation.",
    ),
  cancelReservation: async (reservationId: string) =>
    requireValidatedObject(
      await request<ReservationResponse>(`/reservations/${reservationId}/cancel`, { method: "PATCH" }),
      isReservationResponse,
      "INVALID_RESERVATION_RESPONSE",
      "We couldn't cancel your reservation.",
    ),

  vehicles: () => request<Vehicle[]>("/vehicles"),
  createVehicle: (input: VehicleCreateInput) =>
    request<Vehicle>("/vehicles", { method: "POST", body: input }),
  updateVehicle: (vehicleId: string, input: VehicleUpdateInput) =>
    request<Vehicle>(`/vehicles/${vehicleId}`, { method: "PATCH", body: input }),
  setPrimaryVehicle: (vehicleId: string) =>
    request<Vehicle>(`/vehicles/${vehicleId}/primary`, { method: "POST" }),
  unregisterVehicle: (vehicleId: string) =>
    request<Vehicle>(`/vehicles/${vehicleId}`, { method: "DELETE" }),

  sessions: async () => {
    const sessions = await request<SessionDto[]>("/sessions");
    if (!Array.isArray(sessions) || !sessions.every(isSessionResponse)) {
      throw new ApiError("INVALID_SESSION_RESPONSE", "We couldn't load your parking sessions.", 502);
    }
    return sessions;
  },
  activeSession: async () =>
    requireSessionResponse(await request<SessionDto | null>("/sessions/active")),

  notifications: async () =>
    requireValidatedObject(
      await request<NotificationsPayload>("/notifications"),
      isNotificationsPayload,
      "INVALID_NOTIFICATIONS_RESPONSE",
      "We couldn't load your notifications.",
    ),
  markNotificationRead: (id: string) =>
    request<{ id: string; read: boolean }>(`/notifications/${id}/read`, { method: "PATCH" }),

  violations: async () =>
    requireValidatedList(
      await request<ViolationResponse[]>("/violations"),
      isViolationResponse,
      "INVALID_VIOLATION_RESPONSE",
      "We couldn't load your violations.",
    ),
  appealViolation: async (violationId: string, reason: string) =>
    requireValidatedObject(
      await request<ViolationAppealResponse>(`/violations/${violationId}/appeal`, {
        method: "POST",
        body: { reason },
      }),
      isViolationAppealResponse,
      "INVALID_APPEAL_RESPONSE",
      "We couldn't submit your appeal.",
    ),
};