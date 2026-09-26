import type {
  AdminAnomaly,
  AdminCamera,
  AdminDashboard,
  AdminSession,
  AdminSlot,
  AdminUser,
  AdminVehicle,
  AdminZone,
  AdminZoneDetail,
  AdminReservation,
  AdminViolation,
  AdminAppeal,
  AdminAnalytics,
  ApiErrorBody,
  AuthResult,
  NotificationList,
  SessionUser,
  SimulatorResult,
  SimulatorStatus,
  ZoneHistory,
  ZoneOccupancy,
  GuestAdmitRequest,
  GuestAdmitResult,
  EstablishmentSettings,
} from "./types";
import type {
  AdminCameraInput,
  AdminCameraUpdateInput,
  AdminZoneCreateInput,
  AdminZoneUpdateInput,
} from "./types";

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

const PROXY_BASE = "/api/proxy";

/**
 * Profile-picture URL for an `<img>`: goes through the same cookie-authenticated
 * proxy as every other request (the API endpoint is owner-or-admin only). The
 * stamp query busts the browser cache on replacement.
 */
export function avatarSrc(user: { id: string; avatarUpdatedAt?: string | null } | null | undefined): string | null {
  if (!user || !user.avatarUpdatedAt) return null;
  return `${PROXY_BASE}/users/${encodeURIComponent(user.id)}/avatar?v=${encodeURIComponent(user.avatarUpdatedAt)}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${PROXY_BASE}/${path}`, init);
  } catch {
    throw new ApiError("NETWORK", "Unable to load parking data. Check your connection and try again.", 0);
  }

  let body: ({ data?: T } & ApiErrorBody) | null = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") {
      window.location.assign("/login");
    }
    const code = body?.error?.code ?? "ERROR";
    const message = body?.error?.message ?? `Request failed (${res.status}).`;
    throw new ApiError(code, message, res.status);
  }

  return (body?.data ?? undefined) as T;
}

function jsonInit(method: string, body?: unknown): RequestInit {
  const init: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return init;
}

export interface ApiClient {
  me(): Promise<SessionUser>;
  login(email: string, password: string): Promise<SessionUser>;
  logout(): Promise<void>;

  dashboard(): Promise<AdminDashboard>;

  zones(): Promise<AdminZoneDetail[]>;
  zoneOccupancy(zoneId: string): Promise<ZoneOccupancy>;
  createZone(payload: AdminZoneCreateInput): Promise<AdminZone>;
  updateZone(zoneId: string, payload: AdminZoneUpdateInput): Promise<AdminZone>;
  zoneSlots(zoneId: string): Promise<AdminSlot[]>;
  setZoneSlots(zoneId: string, slotCodes: string[]): Promise<AdminSlot[]>;

  cameras(): Promise<AdminCamera[]>;
  createCamera(payload: AdminCameraInput): Promise<AdminCamera>;
  updateCamera(cameraId: string, payload: AdminCameraUpdateInput): Promise<AdminCamera>;

  sessions(): Promise<AdminSession[]>;
  users(): Promise<AdminUser[]>;
  vehicles(): Promise<AdminVehicle[]>;

  notifications(): Promise<NotificationList>;
  markNotificationRead(id: string): Promise<unknown>;
  guestAdmit(payload: GuestAdmitRequest): Promise<GuestAdmitResult>;
  config(): Promise<EstablishmentSettings>;
  updateConfig(payload: EstablishmentSettings): Promise<EstablishmentSettings>;
  reservations(): Promise<AdminReservation[]>;
  cancelReservation(id: string): Promise<AdminReservation>;
  violations(): Promise<AdminViolation[]>;
  updateViolationStatus(id: string, status: string): Promise<AdminViolation>;
  appeals(): Promise<AdminAppeal[]>;
  updateAppealStatus(id: string, status: "APPROVED" | "REJECTED"): Promise<AdminAppeal>;
  analytics(params?: { from?: string; to?: string }): Promise<AdminAnalytics>;

  anomalies(): Promise<AdminAnomaly[]>;
  /** Open anomalies only (GET /admin/anomalies?resolved=false), newest first, capped at the API maximum of 500. */
  unresolvedAnomalies(): Promise<AdminAnomaly[]>;

  history(zoneId: string, params?: { from?: string; to?: string; limit?: number }): Promise<ZoneHistory>;

  simulatorStatus(): Promise<SimulatorStatus>;
  simulatorRun(payload: Record<string, unknown>): Promise<SimulatorResult>;
}

function buildClient(): ApiClient {
  return {
    async me() {
      const res = await fetch("/api/auth/me");
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new ApiError(body?.error?.code ?? "UNAUTHORIZED", body?.error?.message ?? "Not authenticated.", res.status);
      }
      return body.data as SessionUser;
    },

    async login(email, password) {
      const res = await fetch("/api/auth/login", jsonInit("POST", { email, password }));
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new ApiError(body?.error?.code ?? "UNAUTHORIZED", body?.error?.message ?? "Login failed.", res.status);
      }
      const result = body.data as AuthResult;
      return result.user;
    },

    async logout() {
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    },

    dashboard: () => request<AdminDashboard>("admin/dashboard"),

    zones: () => request<AdminZoneDetail[]>("admin/zones"),

    zoneOccupancy: (zoneId) =>
      request<ZoneOccupancy>(`zones/${encodeURIComponent(zoneId)}/occupancy`),

    createZone: (payload) => request<AdminZone>("admin/zones", jsonInit("POST", payload)),

    updateZone: (zoneId, payload) =>
      request<AdminZone>(`admin/zones/${encodeURIComponent(zoneId)}`, jsonInit("PATCH", payload)),

    zoneSlots: (zoneId) =>
      request<AdminSlot[]>(`admin/zones/${encodeURIComponent(zoneId)}/slots`),

    setZoneSlots: (zoneId, slotCodes) =>
      request<AdminSlot[]>(
        `admin/zones/${encodeURIComponent(zoneId)}/slots`,
        jsonInit("POST", { slotCodes })
      ),

    cameras: () => request<AdminCamera[]>("admin/cameras"),

    createCamera: (payload) => request<AdminCamera>("admin/cameras", jsonInit("POST", payload)),

    updateCamera: (cameraId, payload) =>
      request<AdminCamera>(`admin/cameras/${encodeURIComponent(cameraId)}`, jsonInit("PATCH", payload)),

    sessions: () => request<AdminSession[]>("admin/sessions"),

    users: () => request<AdminUser[]>("admin/users"),

    vehicles: () => request<AdminVehicle[]>("admin/vehicles"),

    notifications: () => request<NotificationList>("admin/notifications"),

    markNotificationRead: (id) =>
      request(`admin/notifications/${encodeURIComponent(id)}/read`, jsonInit("PATCH")),

    guestAdmit: (payload) => request<GuestAdmitResult>("admin/guest-admit", jsonInit("POST", payload)),

    config: () => request<EstablishmentSettings>("admin/config"),

    updateConfig: (payload) => request<EstablishmentSettings>("admin/config", jsonInit("PUT", payload)),

    reservations: () => request<AdminReservation[]>("admin/reservations"),

    cancelReservation: (id) => request<AdminReservation>(`admin/reservations/${encodeURIComponent(id)}/cancel`, jsonInit("PATCH")),

    violations: () => request<AdminViolation[]>("admin/violations"),

    updateViolationStatus: (id, status) => request<AdminViolation>(`admin/violations/${encodeURIComponent(id)}/status`, jsonInit("PATCH", { status })),

    appeals: () => request<AdminAppeal[]>("admin/appeals"),

    updateAppealStatus: (id, status) => request<AdminAppeal>(`admin/appeals/${encodeURIComponent(id)}/status`, jsonInit("PATCH", { status })),

    async analytics(params) {
      const query = new URLSearchParams();
      if (params?.from) query.set("from", params.from);
      if (params?.to) query.set("to", params.to);
      const suffix = query.toString() ? `?${query.toString()}` : "";
      return request<AdminAnalytics>(`admin/analytics${suffix}`);
    },

    anomalies: () => request<AdminAnomaly[]>("admin/anomalies"),

    unresolvedAnomalies: () => request<AdminAnomaly[]>("admin/anomalies?resolved=false&limit=500"),

    async history(zoneId, params) {
      const q = new URLSearchParams();
      if (params?.from) q.set("from", params.from);
      if (params?.to) q.set("to", params.to);
      if (params?.limit) q.set("limit", String(params.limit));
      const suffix = q.toString() ? `?${q.toString()}` : "";
      return request<ZoneHistory>(`admin/zones/${encodeURIComponent(zoneId)}/history${suffix}`);
    },

    simulatorStatus: () => request<SimulatorStatus>("simulator/status"),

    simulatorRun: (payload) => request<SimulatorResult>("simulator/run", jsonInit("POST", payload)),
  };
}

export const api = buildClient();
