import { render, screen } from "@testing-library/react";
import { NumberTicker } from "@/components/ui/NumberTicker";

// jsdom has no matchMedia; the component reads it on every value change to
// decide whether to tween or jump straight to the new value.
beforeAll(() => {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));
});

describe("NumberTicker — accessibility", () => {
  it("exposes the real value to assistive tech and hides the animated tween from it", () => {
    const { rerender } = render(<NumberTicker value={4} />);

    const hidden = screen.getByText("4", { selector: "[aria-hidden='true']" });
    expect(hidden).toBeInTheDocument();

    // The sr-only live region always mirrors the real prop, never an
    // in-between tween frame, so a screen reader announces one clean value.
    const container = hidden.closest("span")?.parentElement;
    const live = container?.querySelector("[aria-live='polite']");
    expect(live).toHaveTextContent("4");

    rerender(<NumberTicker value={9} />);
    expect(live).toHaveTextContent("9");
  });
});
