import { readFileSync } from "fs";
import { join } from "path";
import { AccessibilityInfo, StyleSheet, Text as RNText } from "react-native";
import { act, renderHook, within } from "@testing-library/react-native";
import { render, renderWithAppProviders, renderWithProviders, screen } from "@/src/test/utils";
import { ChoiceChip, Screen, SectionHeader, SegmentedControl } from "@/src/components";
import { usePrefersReducedMotion } from "@/src/hooks/usePrefersReducedMotion";
import { touchTarget } from "@/src/theme";
import LoginScreen from "@/app/login";

/** Phase 5 accessibility fixes from the Rams audit (E-M-A2, E-M9.3, E-M9.4). */

describe("headers and live regions", () => {
  it("marks the screen title and section titles as headers", () => {
    renderWithProviders(
      <Screen title="Now" subtitle="Live" testID="s">
        <SectionHeader title="Past reservations" testID="sec" />
      </Screen>,
    );
    expect(screen.getByTestId("s-title").props.accessibilityRole).toBe("header");
    expect(screen.getByTestId("sec-title").props.accessibilityRole).toBe("header");
  });

  it("announces changes to the connection line (polite live region)", () => {
    renderWithProviders(
      <Screen title="Now" subtitle="Reconnecting…" testID="s">
        <RNText>body</RNText>
      </Screen>,
    );
    expect(screen.getByTestId("s-subtitle").props.accessibilityLiveRegion).toBe("polite");
  });
});

describe("touch targets and radio state", () => {
  it("gives every segment a full 44pt height", () => {
    render(
      <SegmentedControl
        value="a"
        onChange={jest.fn()}
        options={[
          { value: "a", label: "Go to this zone", testID: "seg-a" },
          { value: "b", label: "Reserve a space", testID: "seg-b" },
        ]}
      />,
    );
    const style = StyleSheet.flatten(
      typeof screen.getByTestId("seg-b").props.style === "function"
        ? screen.getByTestId("seg-b").props.style({ pressed: false })
        : screen.getByTestId("seg-b").props.style,
    );
    expect(style.minHeight).toBeGreaterThanOrEqual(touchTarget);
  });

  it("exposes checked on radio chips (Android reads checked, iOS selected)", () => {
    render(<ChoiceChip label="In 30 min" selected onPress={jest.fn()} testID="chip" />);
    expect(screen.getByTestId("chip").props.accessibilityState).toMatchObject({ checked: true, selected: true });
  });

  it("gives the login links a 44pt tap area", () => {
    renderWithAppProviders(<LoginScreen />);
    for (const id of ["login-goto-forgot", "login-goto-register", "login-goto-onboarding"]) {
      // The mock Link renders a View around its asChild Pressable.
      const pressable = within(screen.getByTestId(id)).getByRole("link");
      expect(StyleSheet.flatten(pressable.props.style).minHeight).toBeGreaterThanOrEqual(touchTarget);
    }
  });
});

describe("system settings are followed", () => {
  it("lets the System appearance follow OS dark mode", () => {
    const appJson = JSON.parse(readFileSync(join(__dirname, "..", "app.json"), "utf8"));
    expect(appJson.expo.userInterfaceStyle).toBe("automatic");
  });

  it("updates reduced motion when the OS setting changes while the app runs", async () => {
    let listener: ((value: boolean) => void) | undefined;
    const remove = jest.fn();
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation(((event: string, handler: (value: boolean) => void) => {
      if (event === "reduceMotionChanged") listener = handler;
      return { remove };
    }) as never);

    const { result, unmount } = renderHook(() => usePrefersReducedMotion());
    await act(async () => {});
    expect(result.current).toBe(false);
    act(() => listener?.(true));
    expect(result.current).toBe(true);
    unmount();
    expect(remove).toHaveBeenCalled();
  });
});

describe("login: Lottie", () => {
  it("shows Lottie with a plain-text greeting that names her", () => {
    renderWithAppProviders(<LoginScreen />);
    expect(screen.getByTestId("login-greeting")).toHaveTextContent("Lottie's on duty.");
    expect(screen.getByTestId("login-lottie", { includeHiddenElements: true })).toBeTruthy();
  });
});
