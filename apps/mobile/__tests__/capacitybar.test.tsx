import { render, screen } from "@/src/test/utils";
import { CapacityBar } from "@/src/components/CapacityBar";

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

describe("CapacityBar", () => {
  it("shows occupied of capacity and percent for a normal fill", () => {
    render(<CapacityBar occupied={10} capacity={20} testID="bar" />);

    expect(screen.getByTestId("bar-percent")).toHaveTextContent("10 of 20 · 50%");
    expect(flattenStyle(screen.getByTestId("bar-fill").props.style).width).toBe("50%");
  });

  it("renders a full bar at 100% with zero available", () => {
    render(<CapacityBar occupied={20} capacity={20} testID="bar" />);

    expect(screen.getByTestId("bar-percent")).toHaveTextContent("20 of 20 · 100%");
    expect(flattenStyle(screen.getByTestId("bar-fill").props.style).width).toBe("100%");
  });

  it("clamps the visual fill when occupied exceeds capacity", () => {
    render(<CapacityBar occupied={25} capacity={20} testID="bar" />);

    expect(screen.getByTestId("bar-percent")).toHaveTextContent("25 of 20 · 100%");
    expect(flattenStyle(screen.getByTestId("bar-fill").props.style).width).toBe("100%");
  });

  it("does not divide by zero for a zero-capacity zone", () => {
    render(<CapacityBar occupied={0} capacity={0} testID="bar" />);

    expect(screen.getByTestId("bar-percent")).toHaveTextContent("No capacity data");
    expect(flattenStyle(screen.getByTestId("bar-fill").props.style).width).toBe("0%");
  });
});