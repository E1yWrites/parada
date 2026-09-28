import { act, render } from "@testing-library/react";
import { BLINK_EVERY_MS, BLINK_FOR_MS, Lottie } from "@/components/Lottie";

function mockReducedMotion(matches: boolean) {
  const listeners: Array<() => void> = [];
  const mql = {
    matches,
    addEventListener: (_: string, fn: () => void) => listeners.push(fn),
    removeEventListener: jest.fn(),
  };
  window.matchMedia = jest.fn().mockReturnValue(mql) as never;
  return {
    set(value: boolean) {
      mql.matches = value;
      listeners.forEach((fn) => fn());
    },
  };
}

const visible = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("img"))
    .filter((img) => img.className.includes("opacity-100"))
    .map((img) => img.getAttribute("data-frame"));

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("Lottie (admin login)", () => {
  it("shows the calm frame and blinks briefly on a timer", () => {
    mockReducedMotion(false);
    const { container } = render(<Lottie />);
    expect(visible(container)).toEqual(["calm"]);
    act(() => jest.advanceTimersByTime(BLINK_EVERY_MS));
    expect(visible(container)).toEqual(["blink"]);
    act(() => jest.advanceTimersByTime(BLINK_FOR_MS));
    expect(visible(container)).toEqual(["calm"]);
  });

  it("does not blink under reduced motion, and stops if the OS setting turns on", () => {
    const motion = mockReducedMotion(true);
    const { container } = render(<Lottie />);
    act(() => jest.advanceTimersByTime(BLINK_EVERY_MS * 3));
    expect(visible(container)).toEqual(["calm"]);

    act(() => motion.set(false));
    act(() => jest.advanceTimersByTime(BLINK_EVERY_MS));
    expect(visible(container)).toEqual(["blink"]);
    act(() => motion.set(true));
    expect(visible(container)).toEqual(["calm"]);
    act(() => jest.advanceTimersByTime(BLINK_EVERY_MS * 3));
    expect(visible(container)).toEqual(["calm"]);
  });

  it("floats only when motion is allowed (CSS motion-safe)", () => {
    mockReducedMotion(false);
    const { container } = render(<Lottie />);
    expect(container.querySelector('[data-testid="lottie"]')?.className).toContain("motion-safe:animate-lottie-float");
  });
});
