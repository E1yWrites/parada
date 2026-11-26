import { act, render, screen } from "@testing-library/react";
import type { RealtimeEvent } from "@parada/types";
import { GATE_QUIET_MS, GateTicker } from "@/components/GateTicker";
import { STALE_AFTER_MS } from "@/components/Toaster";

let emit: (event: RealtimeEvent) => void = () => {};
jest.mock("@/lib/realtime", () => ({
  subscribeRealtimeEvents: (listener: (event: RealtimeEvent) => void) => {
    emit = listener;
    return () => {
      emit = () => {};
    };
  },
}));
jest.mock("next/link", () => {
  return ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>;
});

const NOW = Date.parse("2026-11-25T02:42:00.000Z");
let seq = 0;

function gate(
  type: "PARKING_SESSION_STARTED" | "PARKING_SESSION_COMPLETED",
  plate: string | null,
  zone = "Gym Annex",
  occurredAt = NOW
): RealtimeEvent {
  return {
    type,
    seq: ++seq,
    occurredAt: new Date(occurredAt).toISOString(),
    payload: {
      zone: { id: "z2", name: zone, code: "GA" },
      vehicle: plate ? { id: "v1", plateNumber: plate, vehicleType: "CAR" } : null,
    },
  } as RealtimeEvent;
}
const entry = (plate: string | null, zone?: string, at?: number) => gate("PARKING_SESSION_STARTED", plate, zone, at);
const exit = (plate: string | null, zone?: string) => gate("PARKING_SESSION_COMPLETED", plate, zone);
const ticker = () => screen.getByTestId("gate-ticker");

describe("GateTicker", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });
  afterEach(() => jest.useRealTimers());

  it("shows a single entry, then hides after a quiet spell", () => {
    render(<GateTicker />);
    expect(screen.queryByTestId("gate-ticker")).not.toBeInTheDocument();
    act(() => emit(entry("ABC-1234")));
    expect(ticker()).toHaveTextContent("ABC-1234 · Gym Annex entered");
    expect(ticker()).toHaveAttribute("href", "/sessions");
    act(() => {
      jest.advanceTimersByTime(GATE_QUIET_MS);
    });
    expect(screen.queryByTestId("gate-ticker")).not.toBeInTheDocument();
  });

  it("shows a single exit", () => {
    render(<GateTicker />);
    act(() => emit(exit("XYZ-9", "Main Loop")));
    expect(ticker()).toHaveTextContent("XYZ-9 · Main Loop left");
  });

  it("folds a mixed burst into one pill with in and out counts", () => {
    render(<GateTicker />);
    act(() => {
      for (let i = 0; i < 25; i++) emit(entry(`CAR-${i}`));
      emit(exit("OUT-1"));
      emit(exit(null, "Main Loop"));
    });
    expect(screen.getAllByTestId("gate-ticker")).toHaveLength(1);
    expect(ticker()).toHaveTextContent("25 in · 2 out · latest a vehicle left Main Loop");
  });

  it("omits a zero count, keeps showing while traffic continues, and restarts after quiet", () => {
    render(<GateTicker />);
    act(() => {
      emit(exit("A-1"));
      emit(exit("A-2"));
    });
    expect(ticker()).toHaveTextContent("2 out · latest A-2 left Gym Annex");
    expect(ticker()).not.toHaveTextContent(/in ·/);

    act(() => {
      jest.advanceTimersByTime(GATE_QUIET_MS - 1);
      emit(entry("LATE-1"));
      jest.advanceTimersByTime(GATE_QUIET_MS - 1);
    });
    expect(ticker()).toHaveTextContent("1 in · 2 out · latest LATE-1 entered Gym Annex");

    act(() => {
      jest.advanceTimersByTime(1);
      emit(entry("NEW-1"));
    });
    expect(ticker()).toHaveTextContent("NEW-1 · Gym Annex entered");
  });

  it("ignores replayed, stale and unrelated events, and is not a live region", () => {
    const { container } = render(<GateTicker />);
    const first = entry("ABC-1234");
    act(() => {
      emit(first);
      emit(first);
      emit(entry("OLD-1", "Gym Annex", NOW - STALE_AFTER_MS - 1));
      emit({ ...entry("R-1"), type: "RESERVATION_CREATED" } as RealtimeEvent);
    });
    expect(ticker()).toHaveTextContent("ABC-1234 · Gym Annex entered");
    expect(container.firstChild).toHaveAttribute("aria-live", "off");
  });
});
