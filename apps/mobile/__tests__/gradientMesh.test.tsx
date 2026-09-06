import { render, screen } from "@/src/test/utils";
import { GradientMesh } from "@/src/components/GradientMesh";

describe("GradientMesh", () => {
  it("renders as a non-interactive background layer", () => {
    render(<GradientMesh testID="mesh" />);
    expect(screen.getByTestId("mesh")).toBeOnTheScreen();
    expect(screen.getByTestId("mesh").props.pointerEvents).toBe("none");
  });
});
