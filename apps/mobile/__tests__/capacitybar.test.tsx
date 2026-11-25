import { render, screen } from "@/src/test/utils";
import { CapacityBar } from "@/src/components/CapacityBar";
import { heldSpaces } from "@/lib/format";

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
  it("shows occupied of capacity and percent for a normal fill", async () => {
    await render(<CapacityBar occupied={10} capacity={20} testID="bar" />);

    expect(screen.getByTestId("bar-percent")).toHaveTextContent("10 of 20 · 50%");
    expect(flattenStyle(screen.getByTestId("bar-fill").props.style).width).toBe("50%");
  });

  it("renders a full bar at 100% with zero available", async () => {
    await render(<CapacityBar occupied={20} capacity={20} testID="bar" />);

    expect(screen.getByTestId("bar-percent")).toHaveTextContent("20 of 20 · 100%");
    expect(flattenStyle(screen.getByTestId("bar-fill").props.style).width).toBe("100%");
  });

  it("clamps the visual fill when occupied exceeds capacity", async () => {
    await render(<CapacityBar occupied={25} capacity={20} testID="bar" />);

    expect(screen.getByTestId("bar-percent")).toHaveTextContent("25 of 20 · 100%");
    expect(flattenStyle(screen.getByTestId("bar-fill").props.style).width).toBe("100%");
  });

  it("does not divide by zero for a zero-capacity zone", async () => {
    await render(<CapacityBar occupied={0} capacity={0} testID="bar" />);

    expect(screen.getByTestId("bar-percent")).toHaveTextContent("No capacity data");
    expect(flattenStyle(screen.getByTestId("bar-fill").props.style).width).toBe("0%");
  });
});
describe("CapacityBar held segment", () => {
  it("draws reservation holds after the parked fill and says so", async () => {
    await render(<CapacityBar occupied={10} capacity={30} held={2} testID="cap" />);
    expect(screen.getByTestId("cap-percent")).toHaveTextContent("10 parked · 2 held of 30");
    expect(screen.getByTestId("cap-held")).toHaveStyle({ width: "7%" });
  });

  it("never draws more held space than is left", async () => {
    await render(<CapacityBar occupied={29} capacity={30} held={5} testID="cap" />);
    expect(screen.getByTestId("cap-percent")).toHaveTextContent("29 parked · 1 held of 30");
  });

  it("keeps the plain label when nothing is held", async () => {
    await render(<CapacityBar occupied={10} capacity={30} held={0} testID="cap" />);
    expect(screen.getByTestId("cap-percent")).toHaveTextContent("10 of 30 · 33%");
    expect(screen.queryByTestId("cap-held")).toBeNull();
  });
});

describe("heldSpaces", () => {
  it("is capacity minus occupied minus available, never negative", () => {
    expect(heldSpaces({ capacity: 30, occupiedCount: 10, availableCount: 18 })).toBe(2);
    expect(heldSpaces({ capacity: 30, occupiedCount: 31, availableCount: 0 })).toBe(0);
  });
});
