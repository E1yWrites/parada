import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "./SessionProvider";
import { queryClient } from "@/lib/query";
import { useRealtime } from "@/src/lib/realtime";

function RealtimeMount() {
  useRealtime();
  return null;
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