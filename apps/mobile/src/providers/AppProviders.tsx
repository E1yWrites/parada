import { useEffect, type ReactNode } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { QueryClientProvider, focusManager } from "@tanstack/react-query";
import { SessionProvider, useSession } from "./SessionProvider";
import { queryClient } from "@/lib/query";
import { RealtimeConnection, RealtimeStatusProvider } from "./RealtimeStatusProvider";

/**
 * The realtime stream is a bearer-authenticated connection, so it must follow
 * the signed-in user: it is opened only once a user is present (the token is
 * read at connect time), re-opened for a different account, and closed on
 * sign-out. Mounting it unconditionally would capture a missing/stale token
 * at app start and keep reconnecting with it forever.
 */
function RealtimeMount() {
  const { user, token } = useSession();
  // Keyed on the token too: a password change hands this device a fresh
  // token and the server drops the stream opened with the old one, so the
  // connection must be re-established with the new credential.
  return user ? <RealtimeConnection key={`${user.id}:${token ?? ""}`} /> : null;
}

/**
 * React Query's focus detection is browser-only; without this its
 * `refetchOnWindowFocus` setting does nothing on a device, and a screen that
 * was backgrounded through a gate entry/exit keeps rendering stale state.
 */
function useAppStateFocus() {
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next: AppStateStatus) => {
      focusManager.setFocused(next === "active");
    });
    return () => subscription.remove();
  }, []);
}

/** App-wide providers: React Query + PARADA session. */
export function AppProviders({ children }: { children: ReactNode }) {
  useAppStateFocus();
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <RealtimeStatusProvider>
          <RealtimeMount />
          {children}
        </RealtimeStatusProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
