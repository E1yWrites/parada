"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
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

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((u) => {
        if (cancelled) return;
        setUser(u);
      })
      .catch(() => {
        // No session (401) — user stays null. Other errors surface at usage.
        if (cancelled) return;
        setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
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
        const message =
          err instanceof ApiError ? err.message : "Unable to sign in. Please try again.";
        setError(message);
        throw err;
      }
    },
    []
  );

  const signOut = useCallback(async () => {
    await api.logout();
    setUser(null);
    router.replace("/login");
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, loading, error, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
