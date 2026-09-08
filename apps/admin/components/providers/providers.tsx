"use client";

import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/query-client";
import { AuthProvider } from "./auth-provider";
import { useRealtime } from "@/lib/realtime";

function RealtimeMount() {
  useRealtime();
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => makeQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RealtimeMount />
        {children}
      </AuthProvider>
    </QueryClientProvider>
  );
}
