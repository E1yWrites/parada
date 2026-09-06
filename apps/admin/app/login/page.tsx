"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, AlertCircle, LockKeyhole, Mail } from "lucide-react";
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
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-[1.75rem] bg-brand shadow-[0_16px_30px_-12px_rgba(202,0,19,0.6)]">
            <Activity className="h-9 w-9 text-white" aria-hidden="true" />
          </div>
          <h1 className="mt-4 font-display text-4xl font-black tracking-[-0.02em] text-charcoal">PARADA</h1>
          <p className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
            Smart Parking · Operations Console
          </p>
        </div>

        <Card className="p-6 sm:p-8">
          <div className="mb-6">
            <h2 className="font-display text-xl font-black tracking-tight text-charcoal">Administrator sign in</h2>
            <p className="mt-1 text-sm text-muted">
              Access restricted to authorized operations staff.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div>
              <label htmlFor="email" className="label">
                Email
              </label>
              <div className="relative mt-2">
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
              <div className="relative mt-2">
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
              <div
                role="alert"
                className="flex items-center gap-2 rounded-panel border border-brand/25 bg-brand-soft px-3.5 py-2.5 text-sm font-semibold text-brand"
              >
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {error}
              </div>
            ) : null}

            <Button variant="primary" type="submit" disabled={submitting} className="w-full">
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </Card>

        <p className="mt-6 text-center text-xs font-semibold text-muted">
          Protected by authentication · HttpOnly session · Administrator role required
        </p>
      </div>
    </div>
  );
}