import type {
  AdminAnomaly,
  AdminCamera,
  AdminDashboard,
  AdminSession,
  AdminUser,
  AdminVehicle,
  AdminZoneDetail,
  ApiErrorBody,
  AuthResult,
  NotificationList,
  SessionUser,
  SimulatorResult,
  SimulatorStatus,
  ZoneHistory,
  ZoneOccupancy,
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

  cameras(): Promise<AdminCamera[]>;

  sessions(): Promise<AdminSession[]>;
  users(): Promise<AdminUser[]>;
  vehicles(): Promise<AdminVehicle[]>;

  notifications(): Promise<NotificationList>;
  markNotificationRead(id: string): Promise<unknown>;

  anomalies(): Promise<AdminAnomaly[]>;

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
      return body.data.user as SessionUser;
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

    cameras: () => request<AdminCamera[]>("admin/cameras"),

    sessions: () => request<AdminSession[]>("admin/sessions"),

    users: () => request<AdminUser[]>("admin/users"),

    vehicles: () => request<AdminVehicle[]>("admin/vehicles"),

    notifications: () => request<NotificationList>("admin/notifications"),

    markNotificationRead: (id) =>
      request(`admin/notifications/${encodeURIComponent(id)}/read`, jsonInit("PATCH")),

    anomalies: () => request<AdminAnomaly[]>("admin/anomalies"),

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
