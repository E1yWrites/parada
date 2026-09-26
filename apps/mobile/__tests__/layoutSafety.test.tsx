import { fireEvent, render, screen } from "@/src/test/utils";
import {
  ActiveSessionBanner,
  Button,
  Input,
  ReservationCard,
  SessionCard,
  ZoneCard,
} from "@/src/components";
import type { PublicZone, SessionDto } from "@/lib/api/client";
import { layout, tabClearance } from "@/src/theme";
import type { ReservationResponse } from "@parada/types";

/**
 * Phase 9.9 layout-safety regression tests.
 *
 * These guard against text overflow regressions: dynamic text (zone names,
 * plates, button titles, errors) must reflow rather than being squeezed onto
 * one line or colliding with a sibling, while the 44pt touch-target and
 * accessibility contracts stay intact. Where a card caps its height, the cap
 * is asserted explicitly (2 lines) rather than left implicit. Colors/themes
 * are not asserted here; existing suites cover semantics.
 */

function flattenStyle(style: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value && typeof value === "object") {
      Object.assign(out, value);
    }
  };
  visit(style);
  return out;
}

const LONG_ZONE_NAME =
  "Riverside Commercial Market South Wing Reserved Zone Alpha";

function makeZone(overrides: Partial<PublicZone> = {}): PublicZone {
  return {
    id: "z1",
    name: LONG_ZONE_NAME,
    code: "RIV-A",
    description: null,
    capacity: 20,
    occupiedCount: 8,
    availableCount: 12,
    status: "ACTIVE",
    availability: "AVAILABLE",
    navigationLat: null,
    navigationLng: null,
    ...overrides,
  };
}

describe("ZoneCard: long content", () => {
  it("renders a very long zone name fully with a 2-line cap", () => {
    render(<ZoneCard zone={makeZone()} onPress={jest.fn()} testID="zone" />);
    const name = screen.getByText(LONG_ZONE_NAME);
    expect(name).toBeOnTheScreen();
    // Two lines is the deliberate cap: dynamic text reflows rather than
    // being squeezed onto one line, but a card cannot grow without bound.
    expect(name.props.numberOfLines).toBe(2);
  });

  it("keeps metrics and availability visible beside a long name", () => {
    render(<ZoneCard zone={makeZone()} onPress={jest.fn()} testID="zone" />);
    expect(screen.getByTestId("zone-available")).toHaveTextContent("12");
    expect(screen.getByTestId("zone-occupancy-percent")).toHaveTextContent("8 of 20 · 40%");
    expect(screen.getByText("Available")).toBeOnTheScreen();
  });
});

describe("Button: long titles wrap instead of clipping", () => {
  const longTitle = "Reserve ABC-1234-XG in Riverside Commercial Market South Wing Reserved Zone Alpha";

  it("emits the full long title and keeps a 44pt touch target", () => {
    render(<Button testID="btn" title={longTitle} onPress={jest.fn()} />);
    expect(screen.getByText(longTitle)).toBeOnTheScreen();
    expect(screen.getByTestId("btn")).toHaveProp("accessibilityRole", "button");
    const flat = flattenStyle(screen.getByTestId("btn").props.style);
    expect(Number(flat.minHeight)).toBeGreaterThanOrEqual(44);
  });
});

describe("ReservationCard: long content", () => {
  const reservation: ReservationResponse = {
    id: "r1",
    userId: "u1",
    vehicleId: "v1",
    zoneId: "z1",
    startAt: "2026-09-06T08:00:00.000Z",
    endAt: "2026-09-06T12:00:00.000Z",
    status: "CONFIRMED",
    createdAt: "2026-09-06T07:00:00.000Z",
    updatedAt: "2026-09-06T07:00:00.000Z",
    zone: { id: "z1", name: LONG_ZONE_NAME, code: "RIV-A" },
    vehicle: { id: "v1", plateNumber: "ABC-1234-XG", vehicleType: "CAR" },
  };

  it("renders long zone name, plate and time window in full", () => {
    render(<ReservationCard reservation={reservation} testID="reservation" />);
    expect(screen.getByText(LONG_ZONE_NAME)).toBeOnTheScreen();
    expect(screen.getByText("ABC-1234-XG")).toBeOnTheScreen();
    expect(screen.getByTestId("reservation-window")).toHaveTextContent(/2026-09-06 .* – 2026-09-06 /);
    expect(screen.getByText("Confirmed")).toBeOnTheScreen();
  });
});

describe("SessionCard: long content and guest", () => {
  const session: SessionDto = {
    id: "s1",
    zoneId: "z1",
    userId: "u1",
    vehicleId: "v1",
    entryEventId: "e1",
    exitEventId: null,
    enteredAt: "2026-09-06T08:00:00.000Z",
    exitedAt: null,
    durationSeconds: null,
    feeAmount: 12.5,
    status: "ACTIVE",
    zone: { id: "z1", name: LONG_ZONE_NAME, code: "RIV-A" },
    vehicle: { id: "v1", plateNumber: "ABC-1234-XG", vehicleType: "CAR" },
    entryEvent: null,
    exitEvent: null,
  };

  it("renders a long active zone name in full", () => {
    render(<SessionCard session={session} now={new Date("2026-09-06T10:00:00.000Z")} testID="session" />);
    const zoneLine = screen.getByText(`Zone ${LONG_ZONE_NAME}`);
    expect(zoneLine).toBeOnTheScreen();
    // Wraps rather than hard-clipping to a single line.
    expect(zoneLine.props.numberOfLines).toBe(2);
    expect(screen.getByTestId("session-plate")).toHaveTextContent("ABC-1234-XG");
  });

  it("shows GUEST for a vehicle-less session", () => {
    render(
      <SessionCard
        session={{ ...session, vehicle: null }}
        now={new Date("2026-09-06T10:00:00.000Z")}
        testID="session"
      />,
    );
    expect(screen.getByText("GUEST")).toBeOnTheScreen();
  });
});

describe("ActiveSessionBanner: long hero zone wraps", () => {
  it("caps the hero zone name at 2 lines but still emits full text", () => {
    const session: SessionDto = {
      id: "s1",
      zoneId: "z1",
      userId: "u1",
      vehicleId: "v1",
      entryEventId: "e1",
      exitEventId: null,
      enteredAt: "2026-09-06T08:00:00.000Z",
      exitedAt: null,
      durationSeconds: null,
      feeAmount: null,
      status: "ACTIVE",
      zone: { id: "z1", name: LONG_ZONE_NAME, code: "RIV-A" },
      vehicle: { id: "v1", plateNumber: "ABC-1234-XG", vehicleType: "CAR" },
      entryEvent: null,
      exitEvent: null,
    };
    render(
      <ActiveSessionBanner
        session={session}
        now={new Date("2026-09-06T10:00:00.000Z")}
        testID="banner"
      />,
    );
    const zone = screen.getByTestId("banner-zone");
    expect(zone).toHaveTextContent(LONG_ZONE_NAME);
    expect(zone.props.numberOfLines).toBe(2);
    expect(screen.getByTestId("banner-elapsed")).toBeOnTheScreen();
  });
});

describe("Input: long error wraps and stays alert", () => {
  it("renders a long error message in full with alert role", () => {
    render(
      <Input
        testID="email"
        label="Email"
        value=""
        onChangeText={jest.fn()}
        error="This email address is not valid because it is far too long to fit on a single narrow line."
      />,
    );
    const error = screen.getByTestId("email-error");
    expect(error).toHaveTextContent(
      "This email address is not valid because it is far too long to fit on a single narrow line.",
    );
    expect(error).toHaveProp("accessibilityRole", "alert");
  });
});

describe("Floating tab bar clearance", () => {
  it("keeps scroll content clear of the pill on any safe-area inset", () => {
    // The pill floats at insets.bottom + margin, so clearance has to grow with
    // the inset; a fixed constant hid content on tall gesture bars.
    const barTop = (inset: number) =>
      inset + layout.FLOATING_TAB_BAR_MARGIN + layout.FLOATING_TAB_BAR_HEIGHT;
    for (const inset of [0, 24, 34, 48]) {
      expect(tabClearance(inset)).toBeGreaterThan(barTop(inset));
    }
  });
});

describe("Long labels stay pressable", () => {
  it("presses a button through its full label", () => {
    const onPress = jest.fn();
    render(<Button testID="btn" title="Accept Recommendation" onPress={onPress} />);
    fireEvent.press(screen.getByText("Accept Recommendation"));
    expect(onPress).toHaveBeenCalled();
  });
});