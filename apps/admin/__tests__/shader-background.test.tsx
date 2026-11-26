import { render } from "@testing-library/react";
import { ShaderBackground } from "@/components/ShaderBackground";

describe("ShaderBackground", () => {
  it("is decorative and falls back to the flat ground when WebGL is unavailable", () => {
    const getContext = jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const { container, unmount } = render(<ShaderBackground />);
    const canvas = container.querySelector("canvas");
    expect(canvas).toHaveAttribute("aria-hidden", "true");
    expect(canvas).toHaveClass("pointer-events-none");
    expect(getContext).toHaveBeenCalledWith("webgl", expect.anything());
    expect(() => unmount()).not.toThrow();
    getContext.mockRestore();
  });
});
