"use client";

import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/query-client";
import { AuthProvider, useAuth } from "./auth-provider";
import { useRealtime } from "@/lib/realtime";

function RealtimeConnection() {
  useRealtime();
  return null;
}

/**
 * The relay (`/api/realtime`) answers 401/403 until an admin session cookie
 * exists, and a browser EventSource that receives a non-200 response fails
 * permanently — it never retries. So the stream is opened only once the
 * session resolves to an administrator, re-opened for a different account,
 * and closed on sign-out, instead of being mounted once at page load.
 */
function RealtimeMount() {
  const { user } = useAuth();
  return user && user.role === "ADMIN" ? <RealtimeConnection key={user.id} /> : null;
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
