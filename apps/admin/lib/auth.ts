import { cookies } from "next/headers";

export const AUTH_COOKIE = "parada_admin_token";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: "USER" | "ADMIN";
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
}

export function getSessionToken(): string | null {
  const store = cookies();
  return store.get(AUTH_COOKIE)?.value ?? null;
}

export function setSessionToken(token: string): void {
  const store = cookies();
  store.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

export function clearSessionToken(): void {
  const store = cookies();
  store.set(AUTH_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function authCookieHeader(): string {
  const parts = ["Path=/", "HttpOnly", "SameSite=Lax"];
  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function apiBaseUrl(): string {
  return process.env.API_BASE_URL ?? "http://localhost:4000";
}
