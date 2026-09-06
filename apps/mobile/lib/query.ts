import { QueryClient } from "@tanstack/react-query";

export const queryKeys = {
  account: ["account"] as const,
  zones: ["zones"] as const,
  zoneOccupancy: (zoneId: string) => ["zones", zoneId, "occupancy"] as const,
  recommendation: ["zones", "recommendation"] as const,
  establishment: ["zones", "establishment"] as const,
  assignments: ["assignments"] as const,
  reservations: ["reservations"] as const,
  vehicles: ["vehicles"] as const,
  sessions: ["sessions"] as const,
  activeSession: ["sessions", "active"] as const,
};

/** Shared React Query configuration for PARADA mobile. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 15_000,
        refetchOnWindowFocus: "always",
        refetchOnReconnect: true,
      },
    },
  });
}

/** Process-wide query client (created once; used by providers and screens). */
export const queryClient = createQueryClient();