import { NextResponse } from "next/server";
import { apiBaseUrl, clearSessionToken, getSessionToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

type SessionCheck = "ADMIN" | "NOT_ADMIN" | "UNAUTHENTICATED" | "UNAVAILABLE";

/** Confirms with the backend that this session belongs to an ADMIN. Duplicated
 *  from app/api/proxy/[...path]/route.ts rather than shared, matching this
 *  codebase's existing per-route-file convention (no shared route-utils module
 *  exists today). An explicit backend 401 is kept distinct from "not an admin"
 *  so an expired session is relayed as 401, never as 403. */
async function checkSession(token: string): Promise<SessionCheck> {
  try {
    const res = await fetch(`${apiBaseUrl()}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) return "UNAUTHENTICATED";
    if (!res.ok) return "UNAVAILABLE";
    const body = await res.json().catch(() => null);
    return body?.data?.role === "ADMIN" ? "ADMIN" : "NOT_ADMIN";
  } catch {
    return "UNAVAILABLE";
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
  const session = await checkSession(token);
  if (session === "UNAUTHENTICATED") {
    clearSessionToken();
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Your session has expired. Sign in again." } }, { status: 401 });
  }
  if (session === "UNAVAILABLE") {
    return NextResponse.json({ error: { code: "NETWORK", message: "Unable to reach the PARADA API." } }, { status: 503 });
  }
  if (session === "NOT_ADMIN") {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Administrator access required." } }, { status: 403 });
  }

  // The browser re-sends the last SSE `id:` it saw as Last-Event-ID when its
  // EventSource reconnects. Forward it, or the backend cannot tell this is a
  // resumed stream and the admin silently loses every event that landed while
  // the relay was down.
  const lastEventId = req.headers.get("Last-Event-ID");

  let upstream: Response;
  try {
    upstream = await fetch(`${apiBaseUrl()}/realtime/stream`, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...(lastEventId ? { "Last-Event-ID": lastEventId } : {}),
      },
      // Tie the backend connection to the browser's. Without this an admin who
      // reloads or closes the tab leaves the upstream SSE connection open, and
      // the API's hub caps a user at 5 concurrent connections — after five
      // reloads the admin is refused realtime entirely until the API restarts.
      signal: req.signal,
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
