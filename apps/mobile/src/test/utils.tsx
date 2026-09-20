import type { ComponentProps, ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render as rtlRender, type RenderOptions } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider } from "@/src/providers/SessionProvider";
import { ThemeProvider } from "@/src/providers/ThemeProvider";
import { VehicleSelectionProvider } from "@/src/components/VehicleSelection";

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

/**
 * Overrides the bare `render` re-exported above: every PARADA component now
 * reads its colors from `useColors()`, so even a single-component test needs
 * a `ThemeProvider` ancestor or the hook throws. This is the minimum wrap —
 * safe area only, no query/session state — for tests that render one
 * presentational component in isolation.
 */
export function render(ui: ReactElement, options?: RenderOptions) {
  return rtlRender(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}>
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>,
    options,
  );
}

export function renderWithProviders(ui: ProviderChildren) {
  const client = createTestClient();
  const utils = rtlRender(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}>
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <VehicleSelectionProvider>{ui}</VehicleSelectionProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
  return { ...utils, client };
}

/** Render within full app providers (React Query + PARADA session context). */
export function renderWithAppProviders(ui: ProviderChildren) {
  const client = createTestClient();
  const utils = rtlRender(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}>
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <SessionProvider>
            <VehicleSelectionProvider>{ui}</VehicleSelectionProvider>
          </SessionProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
  return { ...utils, client };
}
