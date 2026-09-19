/**
 * Regression pins for "typing on the login/register password field moves the
 * whole screen": the ambient background must not be bottom-anchored (it slid
 * with every keyboard-height change), form screens must handle the keyboard
 * through scroll-view insets rather than resizing the safe area, and password
 * fields must not trigger the iOS strong-password overlay.
 */
import { Platform, ScrollView, StyleSheet, TextInput } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { renderWithAppProviders, renderWithProviders } from "@/src/test/utils";
import { GradientMesh } from "@/src/components/GradientMesh";
import { Input } from "@/src/components/Input";
import { Screen } from "@/src/components/Screen";
import LoginScreen from "@/app/login";
import RegisterScreen from "@/app/register";

jest.mock("@/lib/api/client", () => {
  const actual = jest.requireActual("@/lib/api/client");
  return { ...actual, api: { ...actual.api, me: jest.fn(), login: jest.fn(), register: jest.fn() } };
});

function flatten(style: unknown): Record<string, unknown> {
  return (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;
}

describe("GradientMesh keyboard stability", () => {
  it("anchors every wash from the top of the window, never from the bottom edge", () => {
    render(<GradientMesh testID="mesh" />);
    const mesh = screen.getByTestId("mesh");
    const blobs = mesh.children as unknown as { props: { style: unknown } }[];
    expect(blobs.length).toBeGreaterThan(0);
    for (const blob of blobs) {
      const style = flatten(blob.props.style);
      expect(typeof style.top).toBe("number");
      expect(style.bottom).toBeUndefined();
    }
    expect(flatten(mesh.props.style).overflow).toBe("hidden");
  });
});

describe("Screen keyboard handling", () => {
  const originalOS = Platform.OS;
  afterEach(() => {
    Object.defineProperty(Platform, "OS", { value: originalOS });
  });

  it("uses scroll-view keyboard insets on iOS instead of resizing the whole screen", () => {
    Object.defineProperty(Platform, "OS", { value: "ios" });
    renderWithProviders(
      <Screen keyboard testID="form">
        <TextInput testID="field" />
      </Screen>,
    );
    const scroll = screen.UNSAFE_getByType(ScrollView);
    expect(scroll.props.automaticallyAdjustKeyboardInsets).toBe(true);
    expect(scroll.props.keyboardDismissMode).toBe("interactive");
    expect(scroll.props.keyboardShouldPersistTaps).toBe("handled");
  });

  it("does not add insets on Android (the window already resizes) and not at all without `keyboard`", () => {
    Object.defineProperty(Platform, "OS", { value: "android" });
    renderWithProviders(
      <Screen keyboard testID="form">
        <TextInput testID="field" />
      </Screen>,
    );
    expect(screen.UNSAFE_getByType(ScrollView).props.automaticallyAdjustKeyboardInsets).toBe(false);
    screen.unmount();
    renderWithProviders(
      <Screen testID="plain">
        <TextInput testID="field" />
      </Screen>,
    );
    expect(screen.UNSAFE_getByType(ScrollView).props.automaticallyAdjustKeyboardInsets).toBe(false);
  });
});

describe("password inputs", () => {
  it("never requests the iOS automatic strong-password overlay and passes autofill hints through", () => {
    render(
      <Input
        testID="pw"
        label="Password"
        value=""
        onChangeText={() => undefined}
        secureTextEntry
        textContentType="password"
        autoComplete="new-password"
      />,
    );
    const field = screen.getByTestId("pw");
    expect(field.props.secureTextEntry).toBe(true);
    expect(field.props.textContentType).toBe("password");
    expect(field.props.autoComplete).toBe("new-password");
    expect(field.props.passwordRules).toBe("minlength: 8;");
  });

  it("register and login password fields use `password`, not `newPassword`", () => {
    renderWithAppProviders(<RegisterScreen />);
    expect(screen.getByTestId("register-password").props.textContentType).toBe("password");
    expect(screen.getByTestId("register-confirm").props.textContentType).toBe("password");
    expect(screen.getByTestId("register-password").props.autoComplete).toBe("new-password");
    screen.unmount();
    renderWithAppProviders(<LoginScreen />);
    expect(screen.getByTestId("login-password").props.textContentType).toBe("password");
    expect(screen.getByTestId("login-password").props.autoComplete).toBe("password");
  });

  it("focus changes only the border, not shadow/elevation (no re-raster flicker between fields)", () => {
    render(<Input testID="f" label="Email" value="" onChangeText={() => undefined} />);
    const field = screen.getByTestId("f");
    field.props.onFocus();
    const control = screen.getByTestId("f-wrap").children[1] as unknown as { props: { style: unknown } };
    const style = flatten(control.props.style);
    expect(style.elevation).toBeUndefined();
    expect(style.shadowOpacity).toBeUndefined();
  });
});
