import { NextResponse } from "next/server";
import { apiBaseUrl, getSessionToken, type SessionUser } from "@/lib/auth";

export async function GET() {
  const token = getSessionToken();
  if (!token) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Not authenticated." } },
      { status: 401 }
    );
  }

  try {
    const res = await fetch(`${apiBaseUrl()}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const code = json?.error?.code ?? "UNAUTHORIZED";
      const message = json?.error?.message ?? "Session invalid or expired.";
      return NextResponse.json({ error: { code, message } }, { status: res.status });
    }
    const user = json?.data as SessionUser | undefined;
    if (!user) {
      return NextResponse.json(
        { error: { code: "INTERNAL", message: "Unexpected profile response." } },
        { status: 500 }
      );
    }
    return NextResponse.json({ data: { user } });
  } catch {
    return NextResponse.json(
      { error: { code: "NETWORK", message: "Unable to reach the PARADA API." } },
      { status: 503 }
    );
  }
}
