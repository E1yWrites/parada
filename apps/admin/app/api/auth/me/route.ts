import { NextResponse } from "next/server";
import { apiBaseUrl, getSessionToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Not authenticated." } },
      { status: 401 }
    );
  }

  try {
    const backend = await fetch(`${apiBaseUrl()}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await backend.json().catch(() => null);

    if (!backend.ok) {
      const status = backend.status;
      return NextResponse.json(
        { error: data?.error ?? { code: "UNAUTHORIZED", message: "Not authenticated." } },
        { status }
      );
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: { code: "NETWORK", message: "Unable to reach the PARADA API." } },
      { status: 503 }
    );
  }
}
