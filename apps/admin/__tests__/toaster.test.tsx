import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { RealtimeEvent } from "@parada/types";
import { INFO_HIDE_MS, STALE_AFTER_MS, TOAST_EXIT_MS, Toaster, toastFor } from "@/components/Toaster";

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

function notification(type: string, over: Record<string, unknown> = {}): RealtimeEvent {
  return {
    type: "NOTIFICATION_CREATED",
    seq: ++seq,
    occurredAt: new Date(NOW).toISOString(),
    payload: {
      id: `n${seq}`,
      zoneId: "z2",
      userId: null,
      type,
      message: "Zone is FULL (20/20 occupied).",
      targetRole: "ADMIN",
      createdAt: new Date(NOW).toISOString(),
      ...over,
    },
  } as RealtimeEvent;
}

function guest(admitted: boolean): RealtimeEvent {
  return {
    type: "GUEST_ADMISSION_ISSUE",
    seq: ++seq,
    occurredAt: new Date(NOW).toISOString(),
    payload: { zoneId: "z2", admitted, deniedReason: admitted ? null : "ZONE_FULL", anomalyType: null },
  } as RealtimeEvent;
}

function client() {
  const c = new QueryClient();
  c.setQueryData(["dashboard"], { zones: [{ id: "z2", name: "Gym Annex" }] });
  return c;
}

describe("toastFor — which realtime events pop", () => {
  it("pops a full zone as critical, named from the cached zone list, with the server's message", () => {
    const toast = toastFor(notification("ZONE_FULL"), client(), NOW);
    expect(toast).toMatchObject({ severity: "critical", title: "Gym Annex is full", body: "Zone is FULL (20/20 occupied)." });
    expect(toast?.actions[0]).toEqual({ label: "Open zone", href: "/zones/z2" });
  });

  it("pops low availability and appeals as info", () => {
    expect(toastFor(notification("ZONE_LOW_AVAILABILITY"), client(), NOW)?.severity).toBe("info");
    expect(toastFor(notification("VIOLATION_APPEAL_SUBMITTED"), client(), NOW)?.title).toBe("Appeal submitted");
  });

  it("pops a denied guest as critical, but never an admitted one", () => {
    expect(toastFor(guest(false), client(), NOW)).toMatchObject({ severity: "critical", title: "Guest entry denied" });
    expect(toastFor(guest(true), client(), NOW)).toBeNull();
  });

  it("reports an unmatched guest EXIT as info, never as an entry denial", () => {
    const exit = guest(false);
    (exit.payload as { deniedReason: string }).deniedReason = "GUEST_EXIT_WITHOUT_SESSION";
    const toast = toastFor(exit, client(), NOW);
    expect(toast).toMatchObject({ severity: "info", title: "Guest exit not matched" });
    expect(toast?.actions).toEqual([{ label: "Open anomalies", href: "/anomalies" }]);
  });

  it("never pops driver-targeted notifications, gate events, or events older than 10 minutes", () => {
    expect(toastFor(notification("ZONE_FULL", { targetRole: "USER" }), client(), NOW)).toBeNull();
    const entry = { type: "PARKING_SESSION_STARTED", seq: ++seq, occurredAt: new Date(NOW).toISOString(), payload: {} } as RealtimeEvent;
    expect(toastFor(entry, client(), NOW)).toBeNull();
    expect(toastFor(notification("ZONE_FULL"), client(), NOW + STALE_AFTER_MS + 1)).toBeNull();
  });

  it("falls back to a neutral zone name when no zone list is cached", () => {
    expect(toastFor(notification("ZONE_FULL"), new QueryClient(), NOW)?.title).toBe("A zone is full");
  });
});

describe("Toaster", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });
  afterEach(() => jest.useRealTimers());

  const mount = () =>
    render(
      <QueryClientProvider client={client()}>
        <Toaster />
      </QueryClientProvider>
    );

  it("hides info pop-ups after 8 seconds and keeps critical ones until dismissed", () => {
    mount();
    act(() => {
      emit(notification("ZONE_FULL"));
      emit(notification("ZONE_LOW_AVAILABILITY", { message: "Zone availability is low (6/30 available)." }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Gym Annex is full");
    expect(screen.getByRole("status")).toHaveTextContent("Gym Annex is filling up");

    act(() => {
      jest.advanceTimersByTime(INFO_HIDE_MS);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss: Gym Annex is full" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("drops a dismissed pop-up from the accessibility tree at once and from the DOM after its exit", () => {
    mount();
    act(() => emit(notification("ZONE_FULL")));
    const card = screen.getByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss: Gym Annex is full" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(card).toBeInTheDocument();
    expect(card).toHaveAttribute("aria-hidden", "true");
    act(() => {
      jest.advanceTimersByTime(TOAST_EXIT_MS);
    });
    expect(card).not.toBeInTheDocument();
  });

  it("pauses the info countdown while hovered", () => {
    mount();
    act(() => emit(notification("VIOLATION_APPEAL_SUBMITTED", { message: "A driver appealed a WRONG_ZONE violation." })));
    fireEvent.mouseEnter(screen.getByRole("status"));
    act(() => {
      jest.advanceTimersByTime(INFO_HIDE_MS * 2);
    });
    expect(screen.getByRole("status")).toHaveTextContent("Appeal submitted");
  });

  it("shows at most three and folds the rest into +N more", () => {
    mount();
    act(() => {
      for (let i = 0; i < 4; i++) emit(guest(false));
    });
    expect(screen.getAllByRole("alert")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "+1 more in notifications" })).toHaveAttribute("href", "/notifications");
  });

  it("ignores a replayed event it already shows", () => {
    mount();
    const event = guest(false);
    act(() => {
      emit(event);
      emit(event);
    });
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });
});
