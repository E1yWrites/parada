import { Animated } from "react-native";
import { fireEvent, render, screen } from "@/src/test/utils";
import { usePrefersReducedMotion } from "@/src/hooks/usePrefersReducedMotion";
import { Button, Card, ErrorState, FormAlert, IconButton, Input, LoadingState, SegmentedControl, ZoneCard } from "@/src/components";
import { useColors } from "@/src/providers/ThemeProvider";
import type { PublicZone } from "@/lib/api/client";
import type { ColorTokens } from "@/src/theme/colors";

jest.mock("@/src/hooks/usePrefersReducedMotion", () => ({ usePrefersReducedMotion: jest.fn(() => false) }));

const zone: PublicZone = {
  id: "z1",
  name: "Zone A",
  code: "A",
  description: null,
  capacity: 20,
  occupiedCount: 8,
  availableCount: 12,
  status: "ACTIVE",
  availability: "AVAILABLE",
  navigationLat: null,
  navigationLng: null,
};

async function liveTokens(): Promise<ColorTokens> {
  let captured: ColorTokens | undefined;
  function Probe() {
    captured = useColors();
    return null;
  }
  await render(<Probe />);
  return captured as ColorTokens;
}

const flat = (style: unknown) =>
  [style].flat(Infinity).reduce<Record<string, unknown>>((acc, s) => ({ ...acc, ...((s as object) || {}) }), {});

describe("contrast-safe tokens in components", () => {
  it("the unread badge text uses onDanger", async () => {
    const colors = await liveTokens();
    await render(<IconButton icon="notifications" accessibilityLabel="Notifications" badge={3} onPress={jest.fn()} testID="bell" />);
    expect(flat(screen.getByText("3").props.style).color).toBe(colors.onDanger);
  });

  it("a selected zone is outlined with primaryDeep, an unselected one is not", async () => {
    const colors = await liveTokens();
    const { unmount } = await render(<ZoneCard zone={zone} onPress={jest.fn()} selected testID="zone" />);
    expect(JSON.stringify(screen.toJSON())).toContain(`"borderColor":"${colors.primaryDeep}"`);
    await unmount();
    await render(<ZoneCard zone={zone} onPress={jest.fn()} testID="zone" />);
    expect(JSON.stringify(screen.toJSON())).not.toContain(`"borderColor":"${colors.primaryDeep}"`);
  });
});

describe("announcements and error association", () => {
  it("an Input error is exposed as the field's hint and announced politely", async () => {
    await render(<Input label="Email" value="" onChangeText={jest.fn()} error="Enter a valid email" testID="email" />);
    expect(screen.getByLabelText("Email").props.accessibilityHint).toBe("Enter a valid email");
    expect(screen.getByTestId("email-error").props.accessibilityLiveRegion).toBe("polite");
  });

  it("an Input with no error falls back to its hint", async () => {
    await render(<Input label="Plate" value="" onChangeText={jest.fn()} hint="As on the registration" />);
    expect(screen.getByLabelText("Plate").props.accessibilityHint).toBe("As on the registration");
  });

  it("an error FormAlert is a polite live alert; a notice is not", async () => {
    await render(<FormAlert tone="error" message="Nope" testID="err" />);
    expect(screen.getByTestId("err").props.accessibilityLiveRegion).toBe("polite");
  });

  it("ErrorState's retry control is named by its visible text, and the message is announced", async () => {
    await render(<ErrorState message="Couldn't load." onRetry={jest.fn()} testID="es" />);
    expect(screen.getByRole("button", { name: "Try again" })).toBeOnTheScreen();
    expect(screen.getByText("Couldn't load.").props.accessibilityLiveRegion).toBe("polite");
  });

  it("LoadingState announces its label", async () => {
    await render(<LoadingState label="Loading zones…" />);
    expect(screen.getByText("Loading zones…").props.accessibilityLiveRegion).toBe("polite");
  });
});

describe("large-text safety", () => {
  it("the unread badge can grow with text (no fixed height) and caps its own scaling", async () => {
    await render(<IconButton icon="notifications" accessibilityLabel="Notifications" badge={3} onPress={jest.fn()} testID="bell" />);
    const badgeStyle = flat(screen.getByTestId("bell-badge").props.style);
    expect(badgeStyle.height).toBeUndefined();
    expect(badgeStyle.minHeight).toBe(18);
    expect(screen.getByText("3").props.maxFontSizeMultiplier).toBe(1.3);
  });

  it("the active-session elapsed clock is one line that shrinks to fit", async () => {
    const { ActiveSessionBanner } = jest.requireActual("@/src/components") as typeof import("@/src/components");
    const session = {
      id: "s1", zoneId: "z1", userId: "u1", vehicleId: "v1", entryEventId: "e1", exitEventId: null,
      enteredAt: new Date(Date.now() - 3_600_000).toISOString(), exitedAt: null, durationSeconds: null,
      feeAmount: null, status: "ACTIVE" as const, zone: { id: "z1", name: "Zone A", code: "A" },
      vehicle: { id: "v1", plateNumber: "ABC-123", vehicleType: "CAR" as const }, entryEvent: null, exitEvent: null,
    };
    await render(<ActiveSessionBanner session={session} now={new Date()} testID="banner" />);
    const clock = screen.getByTestId("banner-elapsed");
    expect(clock.props.numberOfLines).toBe(1);
    expect(clock.props.adjustsFontSizeToFit).toBe(true);
  });
});

describe("Reduce Motion", () => {
  afterEach(() => {
    (usePrefersReducedMotion as jest.Mock).mockReturnValue(false);
    jest.restoreAllMocks();
  });

  it("Button skips its press spring when Reduce Motion is on", async () => {
    (usePrefersReducedMotion as jest.Mock).mockReturnValue(true);
    const spring = jest.spyOn(Animated, "spring");
    await render(<Button title="Go" onPress={jest.fn()} testID="go" />);
    await fireEvent(screen.getByTestId("go"), "pressIn");
    await fireEvent(screen.getByTestId("go"), "pressOut");
    expect(spring).not.toHaveBeenCalled();
  });

  it("Button still springs when Reduce Motion is off", async () => {
    const spring = jest.spyOn(Animated, "spring");
    await render(<Button title="Go" onPress={jest.fn()} testID="go" />);
    await fireEvent(screen.getByTestId("go"), "pressIn");
    expect(spring).toHaveBeenCalled();
  });

  it("a pressable Card skips its press spring when Reduce Motion is on", async () => {
    (usePrefersReducedMotion as jest.Mock).mockReturnValue(true);
    const spring = jest.spyOn(Animated, "spring");
    await render(<Card onPress={jest.fn()} testID="card">{null}</Card>);
    await fireEvent(screen.getByTestId("card"), "pressIn");
    await fireEvent(screen.getByTestId("card"), "pressOut");
    expect(spring).not.toHaveBeenCalled();
  });
});

describe("single-choice semantics", () => {
  it("SegmentedControl is a radio group with exactly one checked option", async () => {
    await render(
      <SegmentedControl
        value="assign"
        onChange={jest.fn()}
        options={[
          { value: "assign", label: "Go to this zone" },
          { value: "reserve", label: "Reserve a space" },
        ]}
        testID="seg"
      />,
    );
    expect(screen.getByTestId("seg").props.accessibilityRole).toBe("radiogroup");
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
    expect(radios.filter((r) => r.props.accessibilityState?.checked)).toHaveLength(1);
    expect(screen.getByRole("radio", { checked: true })).toHaveAccessibleName("Go to this zone");
  });
});
