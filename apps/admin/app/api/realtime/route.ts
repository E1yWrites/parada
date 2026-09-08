import { NextResponse } from "next/server";
import { apiBaseUrl, getSessionToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Confirms with the backend that this session belongs to an ADMIN. Duplicated
 *  from app/api/proxy/[...path]/route.ts rather than shared, matching this
 *  codebase's existing per-route-file convention (no shared route-utils module
 *  exists today). */
async function isAdminToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${apiBaseUrl()}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return false;
    const body = await res.json().catch(() => null);
    return body?.data?.role === "ADMIN";
  } catch {
    return false;
  }
}

/**
 * Same-origin SSE relay. The admin browser's `EventSource` call is same-origin
 * so its httpOnly session cookie is attached automatically — this route reads
 * it server-side (exactly like the REST proxy) and opens the real, bearer-
 * authenticated connection to the backend, then streams the response body
 * straight through. The JWT never reaches browser JS.
 */
export async function GET(req: Request) {
  const token = getSessionToken();
  if (!token) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Not authenticated." } }, { status: 401 });
  }
  if (!(await isAdminToken(token))) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Administrator access required." } }, { status: 403 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${apiBaseUrl()}/realtime/stream`, {
      headers: { Authorization: `Bearer ${token}` },
      // @ts-expect-error -- Node's undici fetch supports duplex streaming responses;
      // the App Router runtime forwards this through.
      duplex: "half",
    });
  } catch {
    return NextResponse.json({ error: { code: "NETWORK", message: "Unable to reach the PARADA API." } }, { status: 503 });
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
