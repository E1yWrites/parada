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
  instances: {
    url: string;
    options: { headers?: Record<string, string> };
    listeners: Map<string, (ev: { data: string }) => void>;
    emit: (type: string, data: unknown) => void;
  }[];
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

function sessionCompleted(seq: number) {
  return {
    type: "PARKING_SESSION_COMPLETED",
    occurredAt: "2026-09-08T00:00:00.000Z",
    seq,
    payload: { id: "s1", status: "COMPLETED" },
  };
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

    MockES.instances[0]!.emit("PARKING_SESSION_COMPLETED", sessionCompleted(1));

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["sessions", "active"] }));
  });

  it("recovers missed events on reconnect by invalidating core queries, not by trusting event continuity", async () => {
    const qc = new QueryClient();
    const spy = jest.spyOn(qc, "invalidateQueries");
    renderHook(() => useRealtime(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(MockES.instances.length).toBe(1));

    const source = MockES.instances[0]!;
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

    MockES.instances[0]!.listeners.get("error")?.({ data: "" });

    expect(notifySpy).not.toHaveBeenCalled();
  });

  describe("stale and out-of-order frames", () => {
    it("ignores a replayed event whose seq it has already acted on", async () => {
      const qc = new QueryClient();
      const spy = jest.spyOn(qc, "invalidateQueries");
      renderHook(() => useRealtime(), { wrapper: wrapper(qc) });
      await waitFor(() => expect(MockES.instances.length).toBe(1));

      MockES.instances[0]!.emit("PARKING_SESSION_COMPLETED", sessionCompleted(7));
      spy.mockClear();
      MockES.instances[0]!.emit("PARKING_SESSION_COMPLETED", sessionCompleted(7));

      expect(spy).not.toHaveBeenCalled();
    });

    it("ignores an out-of-order event that arrives behind a newer one", async () => {
      const qc = new QueryClient();
      const spy = jest.spyOn(qc, "invalidateQueries");
      renderHook(() => useRealtime(), { wrapper: wrapper(qc) });
      await waitFor(() => expect(MockES.instances.length).toBe(1));

      MockES.instances[0]!.emit("PARKING_SESSION_COMPLETED", sessionCompleted(7));
      spy.mockClear();
      MockES.instances[0]!.emit("PARKING_SESSION_STARTED", {
        type: "PARKING_SESSION_STARTED",
        occurredAt: "2020-01-01T00:00:00.000Z",
        seq: 3,
        payload: { id: "s1", status: "ACTIVE" },
      });

      expect(spy).not.toHaveBeenCalled();
    });

    it("keeps its cursor across a reconnect, so a replayed duplicate is still dropped", async () => {
      const qc = new QueryClient();
      const spy = jest.spyOn(qc, "invalidateQueries");
      renderHook(() => useRealtime(), { wrapper: wrapper(qc) });
      await waitFor(() => expect(MockES.instances.length).toBe(1));

      const source = MockES.instances[0]!;
      source.listeners.get("open")?.({ data: "" });
      source.emit("PARKING_SESSION_COMPLETED", sessionCompleted(7));
      // Drop and come back; the backend replays from the cursor and may resend
      // seq 7 if the connection died mid-frame.
      source.listeners.get("error")?.({ data: "" });
      source.listeners.get("open")?.({ data: "" });
      spy.mockClear();
      source.emit("PARKING_SESSION_COMPLETED", sessionCompleted(7));

      expect(spy).not.toHaveBeenCalled();
    });

    it("ignores a frame with no seq — an unsequenced frame cannot be placed in order", async () => {
      const qc = new QueryClient();
      const spy = jest.spyOn(qc, "invalidateQueries");
      renderHook(() => useRealtime(), { wrapper: wrapper(qc) });
      await waitFor(() => expect(MockES.instances.length).toBe(1));

      const { seq: _seq, ...unsequenced } = sessionCompleted(1);
      MockES.instances[0]!.emit("PARKING_SESSION_COMPLETED", unsequenced);

      expect(spy).not.toHaveBeenCalled();
    });

    it("ignores a malformed frame without throwing", async () => {
      const qc = new QueryClient();
      const spy = jest.spyOn(qc, "invalidateQueries");
      renderHook(() => useRealtime(), { wrapper: wrapper(qc) });
      await waitFor(() => expect(MockES.instances.length).toBe(1));

      const listener = MockES.instances[0]!.listeners.get("PARKING_SESSION_COMPLETED");
      expect(() => listener?.({ data: "{not json" })).not.toThrow();
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe("SYNC recovery frame", () => {
    it("refetches core queries when the backend reports an unrecoverable gap", async () => {
      const qc = new QueryClient();
      const spy = jest.spyOn(qc, "invalidateQueries");
      renderHook(() => useRealtime(), { wrapper: wrapper(qc) });
      await waitFor(() => expect(MockES.instances.length).toBe(1));

      MockES.instances[0]!.emit("SYNC", { reason: "GAP", sinceSeq: 0, headSeq: 40 });

      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: queryKeys.activeSession }));
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: queryKeys.zones }));
    });

    it("never writes cache data from a SYNC frame — it carries no parking state", async () => {
      const qc = new QueryClient();
      const setSpy = jest.spyOn(qc, "setQueryData");
      renderHook(() => useRealtime(), { wrapper: wrapper(qc) });
      await waitFor(() => expect(MockES.instances.length).toBe(1));

      MockES.instances[0]!.emit("SYNC", { reason: "GAP", sinceSeq: 0, headSeq: 40 });

      expect(setSpy).not.toHaveBeenCalled();
    });
  });
});
