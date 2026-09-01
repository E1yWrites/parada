"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api/client";
import type { SessionUser } from "@/lib/api/types";

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<SessionUser>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .me()
      .then((u) => {
        if (active) setUser(u);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setError(null);
      try {
        const u = await api.login(email, password);
        setUser(u);
        return u;
      } catch (err) {
        const message = err instanceof ApiError ? err.message : "Unable to sign in.";
        setError(message);
        throw err;
      }
    },
    []
  );

  const signOut = useCallback(async () => {
    await api.logout().catch(() => undefined);
    setUser(null);
    setError(null);
    router.replace("/login");
    router.refresh();
  }, [router]);

  const value = useMemo(
    () => ({ user, loading, error, signIn, signOut }),
    [user, loading, error, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
