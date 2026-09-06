import { NextResponse } from "next/server";
import { apiBaseUrl, getSessionToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Confirms with the backend that this session belongs to an ADMIN. */
async function isAdminToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${apiBaseUrl()}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const body = await res.json().catch(() => null);
    return body?.data?.role === "ADMIN";
  } catch {
    return false;
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
  if (!(await isAdminToken(token))) {
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
