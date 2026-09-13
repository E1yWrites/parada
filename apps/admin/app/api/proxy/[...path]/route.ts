import { NextResponse } from "next/server";
import { apiBaseUrl, clearSessionToken, getSessionToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

type SessionCheck = "ADMIN" | "NOT_ADMIN" | "UNAUTHENTICATED" | "UNAVAILABLE";

/**
 * Confirms with the backend that this session belongs to an ADMIN. The
 * outcomes are kept distinct because the browser reacts differently to them:
 * an explicit backend 401 (expired/revoked token) must be relayed as 401 so
 * the console returns to the login page, whereas a valid non-admin token is
 * a 403 and a backend outage is a 503 — neither of those may drop the cookie.
 */
async function checkSession(token: string): Promise<SessionCheck> {
  try {
    const res = await fetch(`${apiBaseUrl()}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) return "UNAUTHENTICATED";
    if (!res.ok) return "UNAVAILABLE";
    const body = await res.json().catch(() => null);
    return body?.data?.role === "ADMIN" ? "ADMIN" : "NOT_ADMIN";
  } catch {
    return "UNAVAILABLE";
  }
}

async function proxy(req: Request, params: { path: string[] }) {
  const token = getSessionToken();
  if (!token) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Not authenticated." } },
      { status: 401 }
    );
  }

  // The backend is the real authorization boundary, but this console is an
  // admin surface: refuse to forward a non-admin token at all rather than
  // acting as a general-purpose proxy for whoever holds the cookie.
  const session = await checkSession(token);
  if (session === "UNAUTHENTICATED") {
    // Only an explicit backend 401 invalidates the console session.
    clearSessionToken();
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Your session has expired. Sign in again." } },
      { status: 401 }
    );
  }
  if (session === "UNAVAILABLE") {
    return NextResponse.json(
      { error: { code: "NETWORK", message: "Unable to reach the PARADA API." } },
      { status: 503 }
    );
  }
  if (session === "NOT_ADMIN") {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Administrator access required." } },
      { status: 403 }
    );
  }

  const path = params.path.join("/");
  const url = new URL(req.url);
  const search = url.search;
  const target = `${apiBaseUrl()}/${path}${search}`;

  const headers = new Headers();
  headers.set("Authorization", `Bearer ${token}`);
  const contentType = req.headers.get("content-type");
  if (contentType) {
    headers.set("Content-Type", contentType);
  }

  let body: BodyInit | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await req.text().catch(() => undefined);
  }

  try {
    const backendRes = await fetch(target, {
      method: req.method,
      headers,
      body,
    });
    const text = await backendRes.text();

    return new NextResponse(text, {
      status: backendRes.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return NextResponse.json(
      { error: { code: "NETWORK", message: "Unable to reach the PARADA API." } },
      { status: 503 }
    );
  }
}

export async function GET(req: Request, { params }: { params: { path: string[] } }) {
  return proxy(req, params);
}
export async function POST(req: Request, { params }: { params: { path: string[] } }) {
  return proxy(req, params);
}
export async function PATCH(req: Request, { params }: { params: { path: string[] } }) {
  return proxy(req, params);
}
export async function PUT(req: Request, { params }: { params: { path: string[] } }) {
  return proxy(req, params);
}
export async function DELETE(req: Request, { params }: { params: { path: string[] } }) {
  return proxy(req, params);
}
