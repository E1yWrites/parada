import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError, type UserDto } from "@/lib/api/client";
import { clearToken, getToken, onAuthInvalidated, setToken } from "@/lib/auth/session";
import { queryClient } from "@/lib/query";

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
      } catch (err) {
        // Only an explicit 401 / UNAUTHORIZED response means the stored token
        // is dead (expired, revoked, or otherwise invalid) and must be cleared.
        // A NETWORK failure, timeout, or backend outage is NOT a revocation:
        // the token is preserved so a later launch/explicit sign-in can recover,
        // and the UI degrades to the signed-out state without destroying data.
        const unauthorized =
          err instanceof ApiError &&
          (err.status === 401 || err.code === "UNAUTHORIZED");
        if (unauthorized) {
          await clearToken();
        }
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
      queryClient.clear();
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