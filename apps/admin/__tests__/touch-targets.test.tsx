import { readFileSync } from "fs";
import { join } from "path";
import { render, screen } from "@testing-library/react";
import { ErrorState } from "@/components/ui/State";

const css = readFileSync(join(__dirname, "..", "app/globals.css"), "utf8");

describe("touch targets (DESIGN.md: every control >= 44px)", () => {
  it(".btn-sm and .segmented-item are 44px tall", () => {
    expect(css).toMatch(/\.btn-sm\s*\{\s*@apply min-h-\[44px\]/);
    expect(css).toMatch(/\.segmented-item\s*\{\s*@apply min-h-\[44px\]/);
  });
});

describe("ErrorState", () => {
  it("is announced as an alert", () => {
    render(<ErrorState message="Boom." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Boom.");
  });
});
