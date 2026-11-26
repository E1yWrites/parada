import { NextResponse } from "next/server";
import { apiBaseUrl } from "@/lib/auth";
import { requireAdminToken } from "@/lib/admin-session";

export const dynamic = "force-dynamic";

async function proxy(req: Request, params: Promise<{ path: string[] }>) {
  // The backend is the real authorization boundary, but this console is an
  // admin surface: refuse to forward a non-admin token at all rather than
  // acting as a general-purpose proxy for whoever holds the cookie.
  const token = await requireAdminToken();
  if (typeof token !== "string") return token;

  const path = (await params).path.join("/");
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

    // JSON is the norm; the avatar endpoint answers with image bytes, which
    // must reach the browser byte-for-byte with their real content type.
    const responseType = backendRes.headers.get("content-type") ?? "application/json";
    if (!responseType.startsWith("application/json")) {
      const bytes = await backendRes.arrayBuffer();
      const passthrough = new Headers({ "Content-Type": responseType });
      for (const name of ["cache-control", "etag", "last-modified"]) {
        const value = backendRes.headers.get(name);
        if (value) passthrough.set(name, value);
      }
      return new NextResponse(bytes, { status: backendRes.status, headers: passthrough });
    }
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

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, params);
}
export async function POST(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, params);
}
export async function PATCH(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, params);
}
export async function PUT(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, params);
}
export async function DELETE(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, params);
}
