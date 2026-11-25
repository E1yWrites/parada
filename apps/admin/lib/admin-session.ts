import { NextResponse } from "next/server";
import { apiBaseUrl, clearSessionToken, getSessionToken } from "@/lib/auth";

function error(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * Resolves the cookie session to an ADMIN's bearer token, or the response to
 * send instead. Shared by the REST proxy and the SSE relay. The outcomes stay
 * distinct because the browser reacts differently: only an explicit backend
 * 401 (expired/revoked token) clears the cookie and returns to sign-in; a
 * valid non-admin token is a 403 and a backend outage a 503, and neither may
 * drop the session.
 */
export async function requireAdminToken(): Promise<string | NextResponse> {
  const token = await getSessionToken();
  if (!token) return error(401, "UNAUTHORIZED", "Not authenticated.");

  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    return error(503, "NETWORK", "Unable to reach the PARADA API.");
  }
  if (res.status === 401) {
    await clearSessionToken();
    return error(401, "UNAUTHORIZED", "Your session has expired. Sign in again.");
  }
  if (!res.ok) return error(503, "NETWORK", "Unable to reach the PARADA API.");
  const body = await res.json().catch(() => null);
  if (body?.data?.role !== "ADMIN") return error(403, "FORBIDDEN", "Administrator access required.");
  return token;
}
