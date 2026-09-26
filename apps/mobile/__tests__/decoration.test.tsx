import { readFileSync } from "fs";
import { join } from "path";
import { Text } from "react-native";
import { renderWithProviders, screen } from "@/src/test/utils";
import { Screen } from "@/src/components/Screen";

/**
 * Rams #10 / #5: decoration only where it carries meaning. The ambient mesh,
 * the glass wash + blur and the mascot callouts were removed from routine
 * screens; the mascot stays for onboarding and empty/error illustrations, and
 * glass stays on onboarding and the tab-bar chrome.
 */
const ROOT = join(__dirname, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const ROUTINE_SURFACES = [
  "app/(tabs)/parking.tsx",
  "app/(tabs)/park.tsx",
  "app/(tabs)/sessions.tsx",
  "app/(tabs)/account.tsx",
  "app/zones/[id].tsx",
  "app/violations/[id].tsx",
  "src/components/CurrentParkingState.tsx",
  "src/components/ActiveSessionBanner.tsx",
  "src/components/ZoneAssignmentPanel.tsx",
  "src/components/ReservationPanel.tsx",
];

describe("routine screens carry no ambient decoration", () => {
  it.each(ROUTINE_SURFACES)("%s uses no GlassCard, mesh or mascot callout", (path) => {
    const source = read(path);
    expect(source).not.toMatch(/\bGlassCard\b/);
    expect(source).not.toMatch(/\bGradientMesh\b/);
    expect(source).not.toMatch(/\bMascotCallout\b/);
    // The idle "Nothing planned" card is an empty state, where the mascot is allowed.
    if (path !== "src/components/CurrentParkingState.tsx") {
      expect(source).not.toMatch(/<Mascot\b/);
    }
  });

  it("Screen paints a flat background with no mesh layer", () => {
    renderWithProviders(
      <Screen title="Now" testID="s">
        <Text>content</Text>
      </Screen>,
    );
    expect(screen.getByText("content")).toBeOnTheScreen();
    expect(screen.queryByTestId("s-mesh")).not.toBeOnTheScreen();
  });

  it("keeps the mascot for empty and error illustrations", () => {
    expect(read("src/components/Illustration.tsx")).toMatch(/<Mascot\b/);
  });
});
