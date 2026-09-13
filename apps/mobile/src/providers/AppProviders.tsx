import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider, useSession } from "./SessionProvider";
import { queryClient } from "@/lib/query";
import { useRealtime } from "@/src/lib/realtime";

function RealtimeConnection() {
  useRealtime();
  return null;
}

/**
 * The realtime stream is a bearer-authenticated connection, so it must follow
 * the signed-in user: it is opened only once a user is present (the token is
 * read at connect time), re-opened for a different account, and closed on
 * sign-out. Mounting it unconditionally would capture a missing/stale token
 * at app start and keep reconnecting with it forever.
 */
function RealtimeMount() {
  const { user } = useSession();
  return user ? <RealtimeConnection key={user.id} /> : null;
}

/** App-wide providers: React Query + PARADA session. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <RealtimeMount />
        {children}
      </SessionProvider>
    </QueryClientProvider>
  );
}
