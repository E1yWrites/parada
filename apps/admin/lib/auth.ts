import { cookies } from "next/headers";

export const AUTH_COOKIE = "parada_admin_token";

export function getSessionToken(): string | null {
  return cookies().get(AUTH_COOKIE)?.value ?? null;
}

export function setSessionToken(token: string): void {
  cookies().set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
}

export function clearSessionToken(): void {
  cookies().delete(AUTH_COOKIE);
}

export function authCookieHeader(): Record<string, string> | null {
  const token = getSessionToken();
  if (!token) return null;
  return { Authorization: `Bearer ${token}` };
}

export function apiBaseUrl(): string {
  return process.env["API_BASE_URL"] ?? "http://localhost:4000";
}
