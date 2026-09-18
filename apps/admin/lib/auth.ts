import { cookies } from "next/headers";

export const AUTH_COOKIE = "parada_admin_token";

export async function getSessionToken(): Promise<string | null> {
  return (await cookies()).get(AUTH_COOKIE)?.value ?? null;
}

export async function setSessionToken(token: string): Promise<void> {
  (await cookies()).set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearSessionToken(): Promise<void> {
  (await cookies()).delete(AUTH_COOKIE);
}

export async function authCookieHeader(): Promise<Record<string, string> | null> {
  const token = await getSessionToken();
  if (!token) return null;
  return { Authorization: `Bearer ${token}` };
}

export function apiBaseUrl(): string {
  return process.env["API_BASE_URL"] ?? "http://localhost:4100";
}
