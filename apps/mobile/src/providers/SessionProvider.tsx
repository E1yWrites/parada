import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, type UserDto } from "@/lib/api/client";
import { clearToken, getToken, onAuthInvalidated, setToken } from "@/lib/auth/session";

type SessionContextValue = {
  user: UserDto | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      const token = await getToken().catch(() => null);
      if (!token) {
        if (active) {
          setUser(null);
        }
        setIsLoading(false);
        return;
      }
      try {
        const me = await api.me();
        if (active) {
          if (me.status === "ACTIVE") {
            setUser(me);
          } else {
            await clearToken();
            setUser(null);
          }
        }
      } catch {
        // Invalid token, revoked session, or offline bootstrap: treat as
        // signed-out rather than leaving the user on a dead session.
        await clearToken();
        if (active) {
          setUser(null);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  useEffect(
    () =>
      onAuthInvalidated(() => {
        setUser(null);
      }),
    [],
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const response = await api.login(email, password);
    await setToken(response.token);
    setUser(response.user);
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const response = await api.register(name, email, password);
    await setToken(response.token);
    setUser(response.user);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // A network failure must not block local sign-out.
    } finally {
      await clearToken();
      setUser(null);
      setReloadKey((k) => k + 1);
      // Drop cached user data so it cannot surface for the next user.
      await import("@/lib/query").then(({ queryClient }) => queryClient.clear());
    }
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({ user, isLoading, signIn, signUp, signOut }),
    [user, isLoading, signIn, signUp, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return ctx;
}