import { NextResponse } from "next/server";
import { apiBaseUrl, clearSessionToken, getSessionToken } from "@/lib/auth";

export async function POST() {
  const token = getSessionToken();

  try {
    if (token) {
      await fetch(`${apiBaseUrl()}/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => undefined);
    }
  } finally {
    clearSessionToken();
  }

  return NextResponse.json({ data: { ok: true } });
}
