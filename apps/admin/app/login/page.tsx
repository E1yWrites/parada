"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AlertCircle, LockKeyhole, Mail } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function LoginPage() {
  const router = useRouter();
  const { signIn, signOut } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await signIn(email, password);
      if (user.role !== "ADMIN") {
        await signOut();
        setError("This account does not have administrator access.");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Form column */}
      <div className="flex w-full flex-col items-center justify-center px-4 py-10 lg:w-1/2">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-4 lg:hidden">
            {/* The canonical PARADA logo, unmodified, mounted on its own light
                plate — the source asset is black ink on a transparent field
                and would disappear directly on the dark ground. Fixed neutral
                white by design (intentionally theme-independent). */}
            <div className="inline-flex shrink-0 items-center rounded-xl rounded-tr-[3px] border border-line bg-white px-3 py-2.5 shadow-card">
              <Image src="/brand/parada-logo.webp" alt="PARADA" width={132} height={17} priority />
            </div>
            <p className="text-xs font-semibold text-muted">Operations console</p>
          </div>

          <Card className="p-6 sm:p-8">
            <div className="mb-6">
              <h1 className="font-display text-2xl font-black tracking-tight text-charcoal">Sign in</h1>
              <p className="mt-1.5 text-sm text-muted">Administrator accounts only.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <div>
                <label htmlFor="email" className="label">
                  Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    className="input pl-11"
                    placeholder="admin@parada.local"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="label">
                  Password
                </label>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    className="input pl-11"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>

              {error ? (
                <div role="alert" className="alert-danger">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  {error}
                </div>
              ) : null}

              <Button variant="primary" type="submit" disabled={submitting} className="w-full">
                {submitting ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </Card>

          <p className="mt-6 text-center text-xs font-semibold text-muted">
            Sessions are kept in an HttpOnly cookie and end when you sign out.
          </p>
        </div>
      </div>

      {/* Brand column — hidden below lg, matches the console's desktop-first posture */}
      <div className="relative hidden w-1/2 flex-col items-center justify-center overflow-hidden border-l border-line bg-card lg:flex">
        {/* The two ambient washes from `.parada-background::before`, inlined
            rather than reusing that class — `.parada-background` itself sets
            `position: relative` as an unlayered rule, which beats the
            `absolute` utility in the cascade and turns this into an in-flow
            box (min-height: 100vh) that pushed all real content down a full
            viewport height. */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(720px 400px at 92% -10%, rgb(var(--brand) / 0.06), transparent 70%), radial-gradient(640px 360px at -6% 104%, rgb(var(--success) / 0.05), transparent 70%)",
          }}
          aria-hidden="true"
        />
        <div className="relative z-10 flex flex-col items-center gap-6 px-12 text-center">
          <Image
            src="/mascot/parada-mascot.webp"
            alt=""
            width={168}
            height={168}
            className="h-[168px] w-[168px] object-contain"
          />
          <div className="inline-flex shrink-0 items-center rounded-xl rounded-tr-[3px] border border-line bg-white px-4 py-3 shadow-card">
            <Image src="/brand/parada-logo.webp" alt="PARADA" width={176} height={23} priority />
          </div>
          <p className="max-w-xs font-display text-xl font-bold leading-snug text-charcoal">
            Guiding every vehicle to its zone.
          </p>
        </div>
      </div>
    </div>
  );
}
