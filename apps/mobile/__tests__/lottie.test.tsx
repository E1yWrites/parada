import { AccessibilityInfo, StyleSheet } from "react-native";
import { act, fireEvent, renderWithProviders, screen } from "@/src/test/utils";
import { BLINK_EVERY_MS, BLINK_FOR_MS, Lottie, TAP_SEQUENCE } from "@/src/components/Lottie";

/** Lottie, the mascot: blink + gentle idle, tap to react, still under Reduce Motion. */
const hidden = { includeHiddenElements: true };
const shown = () =>
  ["calm", "blink", "ears", "excited"].filter(
    (name) => StyleSheet.flatten(screen.getByTestId(`l-${name}`, hidden).props.style).opacity === 1,
  );

async function renderLottie(reduced: boolean, interactive = true) {
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(reduced);
  renderWithProviders(<Lottie interactive={interactive} testID="l" />);
  await act(async () => {});
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("Lottie", () => {
  it("is decorative: hidden from screen readers", async () => {
    await renderLottie(false);
    expect(screen.queryByTestId("l")).toBeNull();
    expect(screen.getByTestId("l", hidden)).toHaveProp("accessibilityElementsHidden", true);
    expect(screen.getByTestId("l", hidden)).toHaveProp("importantForAccessibility", "no-hide-descendants");
  });

  it("shows exactly one frame, calm at rest, and blinks briefly on a timer", async () => {
    await renderLottie(false);
    expect(shown()).toEqual(["calm"]);
    act(() => jest.advanceTimersByTime(BLINK_EVERY_MS));
    expect(shown()).toEqual(["blink"]);
    act(() => jest.advanceTimersByTime(BLINK_FOR_MS));
    expect(shown()).toEqual(["calm"]);
  });

  it("reacts to a tap: ears up, then excited, then back to calm", async () => {
    await renderLottie(false);
    fireEvent.press(screen.getByTestId("l-tap", hidden));
    act(() => jest.advanceTimersByTime(0));
    expect(shown()).toEqual(["ears"]);
    act(() => jest.advanceTimersByTime(TAP_SEQUENCE[0]!.ms));
    expect(shown()).toEqual(["excited"]);
    act(() => jest.advanceTimersByTime(TAP_SEQUENCE[1]!.ms));
    expect(shown()).toEqual(["calm"]);
  });

  it("does not blink over a tap reaction", async () => {
    await renderLottie(false);
    act(() => jest.advanceTimersByTime(BLINK_EVERY_MS - 100));
    fireEvent.press(screen.getByTestId("l-tap", hidden));
    act(() => jest.advanceTimersByTime(200));
    expect(shown()).not.toContain("blink");
  });

  it("stays still under Reduce Motion (no blink), though a tap still changes pose", async () => {
    await renderLottie(true);
    act(() => jest.advanceTimersByTime(BLINK_EVERY_MS * 3));
    expect(shown()).toEqual(["calm"]);
    fireEvent.press(screen.getByTestId("l-tap", hidden));
    act(() => jest.advanceTimersByTime(0));
    expect(shown()).toEqual(["ears"]);
  });

  it("sizes every frame to its box (device showed frames at natural 319 pt spilling over text)", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    renderWithProviders(<Lottie size={112} testID="l" />);
    await act(async () => {});
    for (const name of ["calm", "blink", "ears", "excited"]) {
      const style = StyleSheet.flatten(screen.getByTestId(`l-${name}`, hidden).props.style);
      expect(style.width).toBe(112);
      expect(style.height).toBe(Math.round(112 * (312 / 319)));
    }
    const figure = screen.getByTestId("l-calm", hidden).parent?.parent;
    expect(StyleSheet.flatten(figure?.props.style).overflow).toBe("hidden");
  });

  it("is not tappable unless interactive", async () => {
    await renderLottie(false, false);
    expect(screen.queryByTestId("l-tap", hidden)).toBeNull();
  });
});
