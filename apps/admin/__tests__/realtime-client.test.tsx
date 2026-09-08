import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRealtime } from "@/lib/realtime";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  listeners = new Map<string, (ev: MessageEvent) => void>();
  closed = false;
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, cb: (ev: MessageEvent) => void) {
    this.listeners.set(type, cb);
  }
  close() {
    this.closed = true;
  }
  emitOpen() {
    this.onopen?.();
  }
  emitError() {
    this.onerror?.();
  }
  emit(type: string, data: unknown) {
    this.listeners.get(type)?.({ data: JSON.stringify(data) } as MessageEvent);
  }
}

beforeEach(() => {
  FakeEventSource.instances = [];
  (global as unknown as { EventSource: unknown }).EventSource = FakeEventSource;
});

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useRealtime (admin)", () => {
  it("connects to the same-origin relay and reports CONNECTED on open", async () => {
    const qc = new QueryClient();
    const { result } = renderHook(() => useRealtime(), { wrapper: wrapper(qc) });

    expect(FakeEventSource.instances[0]?.url).toBe("/api/realtime");
    FakeEventSource.instances[0]!.emitOpen();

    await waitFor(() => expect(result.current.status).toBe("CONNECTED"));
  });

  it("invalidates the zones query on ZONE_OCCUPANCY_UPDATED", async () => {
    const qc = new QueryClient();
    const spy = jest.spyOn(qc, "invalidateQueries");
    renderHook(() => useRealtime(), { wrapper: wrapper(qc) });

    FakeEventSource.instances[0]!.emit("ZONE_OCCUPANCY_UPDATED", {
      type: "ZONE_OCCUPANCY_UPDATED",
      occurredAt: "2026-09-08T00:00:00.000Z",
      payload: { zoneId: "z1", name: "A", code: "A", capacity: 5, occupiedCount: 1, availableCount: 4, status: "ACTIVE" },
    });

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["zones"] }));
  });

  it("does not clear the query cache or invalidate auth on a connection error", async () => {
    const qc = new QueryClient();
    const clearSpy = jest.spyOn(qc, "clear");
    const { result } = renderHook(() => useRealtime(), { wrapper: wrapper(qc) });

    FakeEventSource.instances[0]!.emitError();

    await waitFor(() => expect(result.current.status).toBe("DISCONNECTED"));
    expect(clearSpy).not.toHaveBeenCalled();
  });

  it("re-invalidates core queries on reconnect (open after a prior error)", async () => {
    const qc = new QueryClient();
    const spy = jest.spyOn(qc, "invalidateQueries");
    renderHook(() => useRealtime(), { wrapper: wrapper(qc) });

    FakeEventSource.instances[0]!.emitOpen();
    spy.mockClear();
    FakeEventSource.instances[0]!.emitError();
    FakeEventSource.instances[0]!.emitOpen();

    await waitFor(() => expect(spy).toHaveBeenCalled());
  });

  it("a stale event only triggers a refetch — it never sets cache data directly, so a stale ACTIVE cannot revert a COMPLETED session in the UI", async () => {
    const qc = new QueryClient();
    const setSpy = jest.spyOn(qc, "setQueryData");
    renderHook(() => useRealtime(), { wrapper: wrapper(qc) });

    // An out-of-order PARKING_SESSION_STARTED arriving after the real
    // COMPLETED must not matter: the hook only ever calls invalidateQueries,
    // never setQueryData, so the next fetch reads whatever the DB actually
    // holds regardless of event arrival order.
    FakeEventSource.instances[0]!.emit("PARKING_SESSION_STARTED", {
      type: "PARKING_SESSION_STARTED",
      occurredAt: "2020-01-01T00:00:00.000Z",
      payload: { id: "s1", status: "ACTIVE" },
    });

    expect(setSpy).not.toHaveBeenCalled();
  });

  it("does not clear the query cache when the connection error looks like a network/429 failure, not an auth failure", async () => {
    const qc = new QueryClient();
    const clearSpy = jest.spyOn(qc, "clear");
    const { result } = renderHook(() => useRealtime(), { wrapper: wrapper(qc) });

    // EventSource surfaces every transport failure (timeout, 429, DNS, TLS)
    // through the same onerror callback with no status code attached — the
    // hook's contract is that NONE of them ever call queryClient.clear() or
    // touch admin auth, only the existing REST 401 path does that.
    FakeEventSource.instances[0]!.emitError();

    await waitFor(() => expect(result.current.status).toBe("DISCONNECTED"));
    expect(clearSpy).not.toHaveBeenCalled();
  });
});
