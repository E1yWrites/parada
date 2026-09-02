import type { Vehicle, VehicleType, ParkingSessionStatus } from "@parada/types";
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
};

/** GET /zones/:id/occupancy payload. */
export type ZoneOccupancy = Pick<
  PublicZone,
  "id" | "name" | "code" | "capacity" | "occupiedCount" | "availableCount"
> & {
  status: "ACTIVE" | "INACTIVE";
  availability: ZoneAvailability;
};

export type SessionZoneRef = { id: string; name: string; code: string };
export type SessionVehicleRef = {
  id: string;
  plateNumber: string;
  vehicleType: VehicleType;
};
export type SessionEventRef = { id: string; detectedAt: string };

/** Enriched session DTO as returned by /sessions and /sessions/active. */
export type SessionDto = {
  id: string;
  zoneId: string;
  userId: string;
  vehicleId: string;
  entryEventId: string;
  exitEventId: string | null;
  enteredAt: string;
  exitedAt: string | null;
  durationSeconds: number | null;
  status: ParkingSessionStatus;
  zone: SessionZoneRef;
  vehicle: SessionVehicleRef;
  entryEvent: SessionEventRef | null;
  exitEvent: SessionEventRef | null;
};

/** Account shape returned by /auth/me and embedded in auth responses. */
export type UserDto = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
};

/** Auth response from /auth/login and /auth/register. */
export type AuthResponse = { user: UserDto; token: string };

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
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  /** Skip Authorization header (public routes like /zones, /auth/login). */
  public?: boolean;
  /** Skip global 401 session invalidation (login/register handle their own). */
  invalidateOnUnauthorized?: boolean;
};

const API_ROOT = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");
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

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method = opts.method ?? "GET";
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
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
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
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
    const message = body?.error?.message ?? `Request failed with status ${status}. Please try again.`;
    if (status === 401 && opts.invalidateOnUnauthorized !== false) {
      await notifyAuthInvalidated();
    }
    throw new ApiError(code, message, status, body?.error?.details);
  }

  const body = payload as { data?: T } | null | undefined;
  return (body?.data ?? body) as T;
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
    request<AuthResponse>("/auth/register", {
      method: "POST",
      body: { name, email, password },
      public: true,
      invalidateOnUnauthorized: false,
    }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),

  zones: () => request<PublicZone[]>("/zones", { public: true }),
  zoneOccupancy: (zoneId: string) => request<ZoneOccupancy>(`/zones/${zoneId}/occupancy`, { public: true }),

  vehicles: () => request<Vehicle[]>("/vehicles"),
  createVehicle: (plateNumber: string, vehicleType: VehicleType) =>
    request<Vehicle>("/vehicles", { method: "POST", body: { plateNumber, vehicleType } }),

  sessions: () => request<SessionDto[]>("/sessions"),
  activeSession: () => request<SessionDto | null>("/sessions/active"),
};