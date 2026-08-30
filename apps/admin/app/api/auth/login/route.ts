import { NextResponse } from "next/server";
import { apiBaseUrl, setSessionToken, type SessionUser } from "@/lib/auth";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Invalid JSON body." } },
      { status: 400 }
    );
  }

  const email = (body as { email?: unknown })?.email;
  const password = (body as { password?: unknown })?.password;

  try {
    const res = await fetch(`${apiBaseUrl()}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const code = json?.error?.code ?? "UNAUTHORIZED";
      const message = json?.error?.message ?? "Login failed.";
      return NextResponse.json({ error: { code, message } }, { status: res.status });
    }

    const token = json?.data?.token as string | undefined;
    const user = json?.data?.user as SessionUser | undefined;
    if (!token || !user) {
      return NextResponse.json(
        { error: { code: "INTERNAL", message: "Unexpected login response." } },
        { status: 500 }
      );
    }

    setSessionToken(token);
    return NextResponse.json({ data: { user } });
  } catch {
    return NextResponse.json(
      { error: { code: "NETWORK", message: "Unable to reach the PARADA API." } },
      { status: 503 }
    );
  }
}
