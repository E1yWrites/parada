import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { Text } from "react-native";
import { renderWithProviders, screen } from "@/src/test/utils";
import { Screen } from "@/src/components/Screen";
import { Illustration } from "@/src/components/Illustration";

/**
 * Rams #10 / #5: decoration only where it carries meaning. The ambient mesh
 * and the glass wash + blur were removed from routine screens; glass stays on
 * onboarding and the tab-bar chrome. The old mascot was removed; its
 * replacement, Lottie, appears only on onboarding slide 1, login and the idle
 * Now card. Empty/error scenes are a plain icon.
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
  it.each(ROUTINE_SURFACES)("%s uses no GlassCard or mesh", (path) => {
    const source = read(path);
    expect(source).not.toMatch(/\bGlassCard\b/);
    expect(source).not.toMatch(/\bGradientMesh\b/);
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
});

describe("mascot placement", () => {
  it("has no old mascot component, assets or references in app/ and src/", () => {
    expect(existsSync(join(ROOT, "src/components/Mascot.tsx"))).toBe(false);
    expect(existsSync(join(ROOT, "assets/mascot"))).toBe(false);
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(entry.name) && /\bMascot\b|assets\/mascot/.test(read(rel))) hits.push(rel);
      }
    };
    walk("app");
    walk("src");
    expect(hits).toEqual([]);
  });

  it("uses Lottie only on onboarding, login and the idle Now card", () => {
    const users: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(entry.name) && /<Lottie\b/.test(read(rel))) users.push(rel);
      }
    };
    walk("app");
    walk("src");
    expect(users.sort()).toEqual(["app/login.tsx", "app/onboarding.tsx", "src/components/CurrentParkingState.tsx"]);
  });

  it("renders illustrations as a plain icon hidden from screen readers", () => {
    renderWithProviders(<Illustration name="offline" testID="ill" />);
    expect(screen.queryByTestId("ill")).toBeNull();
    const ill = screen.getByTestId("ill", { includeHiddenElements: true });
    expect(ill).toHaveProp("accessibilityElementsHidden", true);
    expect(ill).toHaveProp("importantForAccessibility", "no-hide-descendants");
  });
});
