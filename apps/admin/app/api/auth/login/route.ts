import { NextResponse } from "next/server";
import { apiBaseUrl, setSessionToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Invalid JSON body." } },
      { status: 400 }
    );
  }

  const email = body.email;
  const password = body.password;
  if (typeof email !== "string" || email.trim().length === 0) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Email is required." } },
      { status: 400 }
    );
  }
  if (typeof password !== "string" || password.length === 0) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Password is required." } },
      { status: 400 }
    );
  }

  try {
    const backend = await fetch(`${apiBaseUrl()}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password }),
    });
    const data = await backend.json().catch(() => null);

    if (!backend.ok) {
      const status = backend.status;
      return NextResponse.json(
        { error: data?.error ?? { code: "UNAUTHORIZED", message: "Login failed." } },
        { status }
      );
    }

    if (data?.data?.user?.role !== "ADMIN") {
      // Never mint an operations-console session for a non-admin account.
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "This account does not have administrator access." } },
        { status: 403 }
      );
    }

    const token = data?.data?.token;
    if (typeof token !== "string") {
      return NextResponse.json(
        { error: { code: "INTERNAL", message: "Login did not return a token." } },
        { status: 500 }
      );
    }

    await setSessionToken(token);
    return NextResponse.json({ data: { user: data.data.user } });
  } catch {
    return NextResponse.json(
      { error: { code: "NETWORK", message: "Unable to reach the PARADA API." } },
      { status: 503 }
    );
  }
}
