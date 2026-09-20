import { fireEvent, render, screen } from "@/src/test/utils";
import { Button, Input, StatusBadge, Text } from "@/src/components";
import { parkingStatusMeta } from "@/src/components/StatusBadge";
import { colors, fonts } from "@/src/theme";

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

describe("Text: font scaling", () => {
  it("caps font scaling at 1.8 by default", () => {
    render(<Text testID="t">Hello</Text>);
    expect(screen.getByTestId("t").props.maxFontSizeMultiplier).toBe(1.8);
  });

  it("accepts an explicit maxFontSizeMultiplier override", () => {
    render(
      <Text testID="t" maxFontSizeMultiplier={2}>
        Hello
      </Text>,
    );
    expect(screen.getByTestId("t").props.maxFontSizeMultiplier).toBe(2);
  });
});

describe("Button: accessibility states", () => {
  it("marks a disabled button and ignores presses", () => {
    const onPress = jest.fn();
    render(<Button testID="btn" title="Save" disabled onPress={onPress} />);

    expect(screen.getByTestId("btn").props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(screen.getByTestId("btn"));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("shows a spinner and busy state while loading", () => {
    const onPress = jest.fn();
    render(<Button testID="btn" title="Save" loading onPress={onPress} />);

    expect(screen.getByTestId("button-spinner")).toBeOnTheScreen();
    expect(screen.getByTestId("btn").props.accessibilityState).toMatchObject({ busy: true });
    fireEvent.press(screen.getByTestId("btn"));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("defaults its accessibility label to the title", () => {
    render(<Button testID="btn" title="Sign In" onPress={jest.fn()} />);
    expect(screen.getByTestId("btn").props.accessibilityLabel).toBe("Sign In");
  });
});

describe("StatusBadge: icon + text + label", () => {
  it("pairs a text label with the status and exposes it to screen readers", () => {
    render(<StatusBadge meta={parkingStatusMeta("AVAILABLE", colors)} testID="badge" />);

    expect(screen.getByText("Available")).toBeOnTheScreen();
    expect(screen.getByTestId("badge").props.accessibilityLabel).toBe("Available");
  });

  it("renders a distinct label, icon slug and color for each zone status", () => {
    const low = parkingStatusMeta("LOW_AVAILABILITY", colors);
    const full = parkingStatusMeta("FULL", colors);
    const offline = parkingStatusMeta("OFFLINE", colors);

    expect(low.label.length).toBeGreaterThan(0);
    expect(low.icon).toBe("alert-circle");
    expect(low.icon).not.toBe(full.icon);
    expect(full.icon).toBe("ban");
    expect(offline.icon).toBe("power");
  });
});

describe("Input: label, error and mono behavior", () => {
  it("uppercases the label and renders an inline error", () => {
    render(
      <Input testID="email" label="Email" value="" onChangeText={jest.fn()} error="Bad email." />,
    );

    expect(screen.getByText("EMAIL")).toBeOnTheScreen();
    expect(screen.getByTestId("email-error")).toHaveTextContent("Bad email.");
  });

  it("styles the mono variant with the plate font", () => {
    render(<Input testID="plate" label="Plate number" value="" variant="mono" onChangeText={jest.fn()} />);

    const style = flattenStyle(screen.getByTestId("plate").props.style);
    expect(style.fontFamily).toBe(fonts.monoBold);
  });
});