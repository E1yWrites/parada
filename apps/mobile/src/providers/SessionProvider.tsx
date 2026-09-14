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
import type { RegisterResponse } from "@parada/types";
import { clearToken, getToken, onAuthInvalidated, setToken } from "@/lib/auth/session";
import { queryClient, queryKeys } from "@/lib/query";

type SessionContextValue = {
  user: UserDto | null;
  /** In-memory copy of the stored bearer token (for authenticated image loads). */
  token: string | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /** Creates the account. No session is opened: the email must be verified first. */
  signUp: (name: string, email: string, password: string) => Promise<RegisterResponse>;
  signOut: () => Promise<void>;
  /** Replaces the cached account after a server-confirmed profile change. */
  updateUser: (user: UserDto) => void;
  /** Changes the password and swaps in the fresh token the server returns. */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
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
            setTokenState(token);
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
        setTokenState(null);
      }),
    [],
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const response = await api.login(email, password);
    await setToken(response.token);
    setTokenState(response.token);
    setUser(response.user);
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    // Registration returns no token (verification required), so nothing is
    // stored and the user stays signed out until they verify and sign in.
    return api.register(name, email, password);
  }, []);

  const updateUser = useCallback((next: UserDto) => {
    setUser(next);
    queryClient.setQueryData(queryKeys.account, next);
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const response = await api.changePassword(currentPassword, newPassword);
    // Every earlier token is now invalid server-side; keep this device signed in.
    await setToken(response.token);
    setTokenState(response.token);
    setUser(response.user);
    queryClient.setQueryData(queryKeys.account, response.user);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // A network failure must not block local sign-out.
    } finally {
      await clearToken();
      setUser(null);
      setTokenState(null);
      setReloadKey((k) => k + 1);
      // Drop cached user data so it cannot surface for the next user.
      queryClient.clear();
    }
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({ user, token, isLoading, signIn, signUp, signOut, updateUser, changePassword }),
    [user, token, isLoading, signIn, signUp, signOut, updateUser, changePassword],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/**
 * Read-only access to the signed-in user for purely decorative UI (the
 * greeting avatar). Returns null outside a SessionProvider instead of
 * throwing, so presentational screens never depend on auth wiring.
 */
export function useSessionUser(): SessionContextValue["user"] | null {
  return useContext(SessionContext)?.user ?? null;
}

/** Bearer token for authenticated image loads (null outside a session). */
export function useSessionToken(): string | null {
  return useContext(SessionContext)?.token ?? null;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return ctx;
}