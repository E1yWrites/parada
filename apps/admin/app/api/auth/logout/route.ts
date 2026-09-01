import { NextResponse } from "next/server";
import { apiBaseUrl, clearSessionToken, getSessionToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const token = getSessionToken();
  if (token) {
    try {
      await fetch(`${apiBaseUrl()}/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => undefined);
    } catch {
      // best-effort: still clear the cookie locally
    }
  }
  clearSessionToken();
  return NextResponse.json({ data: { ok: true } });
}
