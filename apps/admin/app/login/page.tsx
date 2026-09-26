"use client";

import { useState } from "react";
import Image from "next/image";
import { BrandLogo } from "@/components/BrandLogo";
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
      <main className="flex w-full flex-col items-center justify-center px-4 py-10 lg:w-1/2">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-4 lg:hidden">
            <BrandLogo height={17} priority />
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

        </div>
      </main>

      {/* Brand column — hidden below lg, matches the console's desktop-first posture */}
      <aside aria-label="PARADA" className="relative hidden w-1/2 flex-col items-center justify-center overflow-hidden border-l border-line bg-card lg:flex">
        <div className="relative z-10 flex flex-col items-center gap-6 px-12 text-center">
          <Image
            src="/mascot/parada-mascot.webp"
            alt=""
            width={168}
            height={168}
            className="h-[168px] w-[168px] object-contain"
          />
          <BrandLogo height={23} />
          <p className="max-w-xs font-display text-xl font-bold leading-snug text-charcoal">
            Guiding every vehicle to its zone.
          </p>
        </div>
      </aside>
    </div>
  );
}
