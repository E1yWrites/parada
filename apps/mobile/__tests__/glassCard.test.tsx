import { AccessibilityInfo } from "react-native";
import { render, screen, waitFor } from "@/src/test/utils";
import { GlassCard } from "@/src/components/GlassCard";
import { Text } from "@/src/components/Text";

describe("GlassCard", () => {
  it("renders a blur layer and its children by default", async () => {
    render(
      <GlassCard testID="hero">
        <Text>Parked</Text>
      </GlassCard>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("hero-blur")).toBeOnTheScreen();
      expect(screen.getByText("Parked")).toBeOnTheScreen();
    });
  });

  it("falls back to a solid surface when Reduce Transparency is enabled", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceTransparencyEnabled").mockResolvedValue(true);

    render(
      <GlassCard testID="hero">
        <Text>Parked</Text>
      </GlassCard>,
    );

    await screen.findByText("Parked");
    await waitFor(() => {
      expect(screen.queryByTestId("hero-blur")).not.toBeOnTheScreen();
    });
  });

  it("renders the accent stripe and stays pressable, like Card", async () => {
    const onPress = jest.fn();
    render(
      <GlassCard testID="hero" accent="#CA0013" onPress={onPress}>
        <Text>Parked</Text>
      </GlassCard>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("hero-accent")).toBeOnTheScreen();
      expect(screen.getByTestId("hero").props.accessibilityRole).toBe("button");
    });
  });
});
