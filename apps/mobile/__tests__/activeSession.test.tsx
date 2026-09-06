import { render, screen } from "@/src/test/utils";
import { ActiveSessionBanner } from "@/src/components/ActiveSessionBanner";
import { SessionCard } from "@/src/components/SessionCard";
import type { SessionDto } from "@/lib/api/client";

const active: SessionDto = {
  id: "sa",
  zoneId: "z1",
  userId: "u1",
  vehicleId: "v1",
  entryEventId: "e1",
  exitEventId: null,
  // Local-part timestamps so elapsed/clock assertions hold in any timezone.
  enteredAt: new Date(2026, 8, 1, 10, 0, 0).toISOString(),
  exitedAt: null,
  durationSeconds: null,
  feeAmount: null,
  status: "ACTIVE",
  zone: { id: "z1", name: "Zone A", code: "A" },
  vehicle: { id: "v1", plateNumber: "ABC-1234", vehicleType: "CAR" },
  entryEvent: { id: "e1", detectedAt: new Date(2026, 8, 1, 10, 0, 0).toISOString() },
  exitEvent: null,
};

const now = new Date(2026, 8, 1, 10, 42, 0);

describe("ActiveSessionBanner", () => {
  it("renders the correct parked vehicle, zone and live elapsed time", () => {
    render(<ActiveSessionBanner session={active} now={now} testID="banner" />);

    expect(screen.getByTestId("banner-zone")).toHaveTextContent("Zone A");
    expect(screen.getByTestId("banner-plate")).toHaveTextContent("ABC-1234");
    expect(screen.getByTestId("banner-elapsed")).toHaveTextContent("42m");
    expect(screen.getByTestId("banner-badge")).toHaveTextContent(/Parked/);
  });

  it("renders GUEST identity for an account-less active session", () => {
    render(
      <ActiveSessionBanner
        session={{ ...active, userId: null, vehicleId: null, vehicle: null }}
        now={now}
        testID="banner"
      />,
    );

    expect(screen.getByTestId("banner-plate")).toHaveTextContent("GUEST");
    expect(screen.getByTestId("banner-zone")).toHaveTextContent("Zone A");
  });
});

describe("SessionCard (active)", () => {
  it("shows live elapsed for an active session", () => {
    render(<SessionCard session={active} now={now} testID="card" />);

    expect(screen.getByTestId("card-plate")).toHaveTextContent("ABC-1234");
    expect(screen.getByTestId("card-status")).toHaveTextContent(/Active/);
    expect(screen.getByTestId("card-elapsed")).toHaveTextContent("42m");
  });

  it("does not fabricate a fee for an active session without one", () => {
    render(<SessionCard session={{ ...active, feeAmount: null }} now={now} testID="card" />);

    expect(screen.getByTestId("card-plate")).toHaveTextContent("ABC-1234");
    expect(screen.queryByTestId("card-fee")).not.toBeOnTheScreen();
  });
});

describe("SessionCard (completed)", () => {
  const completed: SessionDto = {
    ...active,
    id: "sc",
    exitEventId: "e2",
    exitedAt: new Date(2026, 8, 1, 11, 51, 0).toISOString(),
    durationSeconds: 6660,
    status: "COMPLETED",
    exitEvent: { id: "e2", detectedAt: new Date(2026, 8, 1, 11, 51, 0).toISOString() },
  };

  it("shows exit time and fixed duration", () => {
    render(<SessionCard session={completed} testID="card" />);

    expect(screen.getByTestId("card-status")).toHaveTextContent(/Completed/);
    expect(screen.getByTestId("card-exited")).toHaveTextContent("2026-09-01 11:51");
    expect(screen.getByTestId("card-duration")).toHaveTextContent("1h 51m");
  });

  it("shows the backend fee for a completed session", () => {
    render(<SessionCard session={{ ...completed, feeAmount: 30 }} testID="card" />);

    expect(screen.getByTestId("card-fee")).toHaveTextContent("₱30.00");
  });

  it("does not show a fee row when feeAmount is null", () => {
    render(<SessionCard session={{ ...completed, feeAmount: null }} testID="card" />);

    expect(screen.queryByTestId("card-fee")).not.toBeOnTheScreen();
  });
});