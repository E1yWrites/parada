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
  /** The input the backend rejected (`error.details.field`), when it names one. */
  readonly field?: string;

  constructor(code: string, message: string, status: number, field?: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.field = field;
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

/** Full-page redirect to the login screen. An object so tests can spy on it (jsdom's location is unforgeable). */
export const navigation = {
  toLogin(): void {
    // A full page load on purpose: it drops every cached query of the ended session.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  },
};

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
      navigation.toLogin();
    }
    const code = body?.error?.code ?? "ERROR";
    const message = body?.error?.message ?? `Request failed (${res.status}).`;
    const field = body?.error?.details?.field;
    throw new ApiError(code, message, res.status, typeof field === "string" ? field : undefined);
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

/** Typed calls to the API through the same-origin proxy (`/api/proxy/*`). */
export const api = {
  async me(): Promise<SessionUser> {
    const res = await fetch("/api/auth/me");
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new ApiError(body?.error?.code ?? "UNAUTHORIZED", body?.error?.message ?? "Not authenticated.", res.status);
    }
    return body.data as SessionUser;
  },

  async login(email: string, password: string): Promise<SessionUser> {
    const res = await fetch("/api/auth/login", jsonInit("POST", { email, password }));
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new ApiError(body?.error?.code ?? "UNAUTHORIZED", body?.error?.message ?? "Login failed.", res.status);
    }
    const result = body.data as AuthResult;
    return result.user;
  },

  async logout(): Promise<void> {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
  },

  dashboard: () => request<AdminDashboard>("admin/dashboard"),

  zones: () => request<AdminZoneDetail[]>("admin/zones"),

  createZone: (payload: AdminZoneCreateInput) => request<AdminZone>("admin/zones", jsonInit("POST", payload)),

  updateZone: (zoneId: string, payload: AdminZoneUpdateInput) =>
    request<AdminZone>(`admin/zones/${encodeURIComponent(zoneId)}`, jsonInit("PATCH", payload)),

  zoneSlots: (zoneId: string) =>
    request<AdminSlot[]>(`admin/zones/${encodeURIComponent(zoneId)}/slots`),

  setZoneSlots: (zoneId: string, slotCodes: string[]) =>
    request<AdminSlot[]>(
      `admin/zones/${encodeURIComponent(zoneId)}/slots`,
      jsonInit("POST", { slotCodes })
    ),

  cameras: () => request<AdminCamera[]>("admin/cameras"),

  createCamera: (payload: AdminCameraInput) => request<AdminCamera>("admin/cameras", jsonInit("POST", payload)),

  updateCamera: (cameraId: string, payload: AdminCameraUpdateInput) =>
    request<AdminCamera>(`admin/cameras/${encodeURIComponent(cameraId)}`, jsonInit("PATCH", payload)),

  sessions: () => request<AdminSession[]>("admin/sessions"),

  users: () => request<AdminUser[]>("admin/users"),

  vehicles: () => request<AdminVehicle[]>("admin/vehicles"),

  notifications: () => request<NotificationList>("admin/notifications"),

  markNotificationRead: (id: string) =>
    request(`admin/notifications/${encodeURIComponent(id)}/read`, jsonInit("PATCH")),

  markAllNotificationsRead: () =>
    request<{ updated: number }>("admin/notifications/read-all", jsonInit("PATCH")),

  guestAdmit: (payload: GuestAdmitRequest) => request<GuestAdmitResult>("admin/guest-admit", jsonInit("POST", payload)),

  config: () => request<EstablishmentSettings>("admin/config"),

  updateConfig: (payload: EstablishmentSettings) => request<EstablishmentSettings>("admin/config", jsonInit("PUT", payload)),

  reservations: () => request<AdminReservation[]>("admin/reservations"),

  cancelReservation: (id: string) => request<AdminReservation>(`admin/reservations/${encodeURIComponent(id)}/cancel`, jsonInit("PATCH")),

  violations: () => request<AdminViolation[]>("admin/violations"),

  updateViolationStatus: (id: string, status: string) => request<AdminViolation>(`admin/violations/${encodeURIComponent(id)}/status`, jsonInit("PATCH", { status })),

  appeals: () => request<AdminAppeal[]>("admin/appeals"),

  updateAppealStatus: (id: string, status: "APPROVED" | "REJECTED") => request<AdminAppeal>(`admin/appeals/${encodeURIComponent(id)}/status`, jsonInit("PATCH", { status })),

  async analytics(params?: { from?: string; to?: string }) {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return request<AdminAnalytics>(`admin/analytics${suffix}`);
  },

  anomalies: () => request<AdminAnomaly[]>("admin/anomalies"),

  resolveAnomaly: (id: string) =>
    request<AdminAnomaly>(`admin/anomalies/${encodeURIComponent(id)}/resolve`, jsonInit("PATCH")),

  async history(zoneId: string, params?: { from?: string; to?: string; limit?: number }) {
    const q = new URLSearchParams();
    if (params?.from) q.set("from", params.from);
    if (params?.to) q.set("to", params.to);
    if (params?.limit) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<ZoneHistory>(`admin/zones/${encodeURIComponent(zoneId)}/history${suffix}`);
  },

  simulatorStatus: () => request<SimulatorStatus>("simulator/status"),

  simulatorRun: (payload: Record<string, unknown>) => request<SimulatorResult>("simulator/run", jsonInit("POST", payload)),
};
