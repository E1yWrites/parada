"use client";

import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api/client";

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
            return false;
          }
          return failureCount < 2;
        },
        refetchOnWindowFocus: false,
        staleTime: 15_000,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
