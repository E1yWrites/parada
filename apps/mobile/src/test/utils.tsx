import type { ComponentProps } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider } from "@/src/providers/SessionProvider";

export * from "@testing-library/react-native";

/**
 * Exact child contract of QueryClientProvider. Uses the *resolved* React
 * types of @tanstack/react-query (react 18 typings live at the monorepo root
 * while the app itself types against react 19), so helpers stay compatible
 * with the boundary they render into — no version crosstalk.
 */
type ProviderChildren = ComponentProps<typeof QueryClientProvider>["children"];

/** Fresh QueryClient per render so tests never share query cache state. */
function createTestClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
    },
  });
}

export function renderWithProviders(ui: ProviderChildren) {
  const client = createTestClient();
  const utils = render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </SafeAreaProvider>,
  );
  return { ...utils, client };
}

/** Render within full app providers (React Query + PARADA session context). */
export function renderWithAppProviders(ui: ProviderChildren) {
  const client = createTestClient();
  const utils = render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}>
      <QueryClientProvider client={client}>
        <SessionProvider>{ui}</SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
  return { ...utils, client };
}