import { AccessibilityInfo } from "react-native";
import { render, screen, waitFor } from "@/src/test/utils";
import { TabBarBackground } from "@/src/components/TabBarBackground";

describe("TabBarBackground", () => {
  it("renders a blur layer by default", async () => {
    render(<TabBarBackground testID="tab-bg" />);
    await waitFor(() => {
      expect(screen.getByTestId("tab-bg-blur")).toBeOnTheScreen();
    });
  });

  it("falls back to a solid fill when Reduce Transparency is enabled", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceTransparencyEnabled").mockResolvedValue(true);
    render(<TabBarBackground testID="tab-bg" />);
    await waitFor(() => {
      expect(screen.queryByTestId("tab-bg-blur")).not.toBeOnTheScreen();
    });
  });
});
