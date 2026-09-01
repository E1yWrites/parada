import { NextResponse } from "next/server";
import { apiBaseUrl, getSessionToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function proxy(req: Request, params: { path: string[] }) {
  const token = getSessionToken();
  if (!token) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Not authenticated." } },
      { status: 401 }
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
