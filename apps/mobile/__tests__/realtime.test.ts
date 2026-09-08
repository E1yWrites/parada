import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useRealtime } from "@/src/lib/realtime";
import { configureSecureStore, setToken } from "@/lib/auth/session";
import * as authSessionModule from "@/lib/auth/session";
import { queryKeys } from "@/lib/query";
import MockEventSource from "react-native-sse";

// The mock class is defined *inside* the factory (rather than referenced via
// closure from an outer declaration) because babel-plugin-jest-hoist hoists
// `jest.mock()` above all top-level statements, including class declarations
// — a closure-captured class would still be `undefined` the first time the
// factory runs. Defining it inline keeps the factory self-contained. (The
// plugin's static scope check also mis-flags inline arrow-function type
// annotations inside the factory, so `FakeListener` types are kept outside.)
jest.mock("react-native-sse", () => {
  class FakeEventSource {
    static instances: FakeEventSource[] = [];
    url: string;
    options: { headers?: Record<string, string> };
    listeners = new Map();
    constructor(url: string, options: { headers?: Record<string, string> }) {
      this.url = url;
      this.options = options;
      FakeEventSource.instances.push(this);
    }
    addEventListener(type: string, cb: unknown) {
      this.listeners.set(type, cb);
    }
    removeAllEventListeners() {
      this.listeners.clear();
    }
    close() {}
    emit(type: string, data: unknown) {
      const cb = this.listeners.get(type) as Function | undefined;
      if (cb) cb({ data: JSON.stringify(data) });
    }
  }
  return { __esModule: true, default: FakeEventSource };
});

type MockEventSourceCtor = typeof MockEventSource & {
  instances: Array<{
    url: string;
    options: { headers?: Record<string, string> };
    emit: (type: string, data: unknown) => void;
  }>;
};
const MockES = MockEventSource as unknown as MockEventSourceCtor;

const memoryStore = new Map<string, string>();
beforeEach(async () => {
  MockES.instances = [];
  memoryStore.clear();
  configureSecureStore({
    getItemAsync: async (k) => memoryStore.get(k) ?? null,
    setItemAsync: async (k, v) => void memoryStore.set(k, v),
    deleteItemAsync: async (k) => void memoryStore.delete(k),
  });
  await setToken("test-jwt");
});

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useRealtime (mobile)", () => {
  it("connects with the stored bearer token as a header", async () => {
    const qc = new QueryClient();
    renderHook(() => useRealtime(), { wrapper: wrapper(qc) });

    await waitFor(() => expect(MockES.instances.length).toBe(1));
    expect(MockES.instances[0]!.options.headers?.Authorization).toBe("Bearer test-jwt");
  });

  it("invalidates the active-session query on PARKING_SESSION_COMPLETED", async () => {
    const qc = new QueryClient();
    const spy = jest.spyOn(qc, "invalidateQueries");
    renderHook(() => useRealtime(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(MockES.instances.length).toBe(1));

    MockES.instances[0]!.emit("PARKING_SESSION_COMPLETED", {
      type: "PARKING_SESSION_COMPLETED",
      occurredAt: "2026-09-08T00:00:00.000Z",
      payload: { id: "s1", status: "COMPLETED" },
    });

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["sessions", "active"] }));
  });

  it("recovers missed events on reconnect by invalidating core queries, not by trusting event continuity", async () => {
    const qc = new QueryClient();
    const spy = jest.spyOn(qc, "invalidateQueries");
    renderHook(() => useRealtime(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(MockES.instances.length).toBe(1));

    const source = MockES.instances[0]! as unknown as { listeners: Map<string, (ev: { data: string }) => void> };
    source.listeners.get("open")?.({ data: "" });
    spy.mockClear();
    // Reconnect: open fires again after the connection was already established once.
    source.listeners.get("open")?.({ data: "" });

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: queryKeys.activeSession }));
  });

  it("a realtime connection error never calls notifyAuthInvalidated — only an explicit 401 from the REST client does", async () => {
    const notifySpy = jest.spyOn(authSessionModule, "notifyAuthInvalidated");
    const qc = new QueryClient();
    renderHook(() => useRealtime(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(MockES.instances.length).toBe(1));

    (MockES.instances[0]! as unknown as { listeners: Map<string, (ev: { data: string }) => void> }).listeners.get("error")?.({ data: "" });

    expect(notifySpy).not.toHaveBeenCalled();
  });
});
