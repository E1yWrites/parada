import { Text } from "react-native";
import { __router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { fireEvent, renderWithAppProviders, screen, waitFor } from "@/src/test/utils";
import LoginScreen from "@/app/login";
import RegisterScreen from "@/app/register";
import { useSession } from "@/src/providers/SessionProvider";
import { api, ApiError } from "@/lib/api/client";
import { getToken } from "@/lib/auth/session";

jest.mock("@/lib/api/client", () => {
  const actual = jest.requireActual("@/lib/api/client");
  return {
    ...actual,
    api: {
      me: jest.fn(),
      login: jest.fn(),
      register: jest.fn(),
      logout: jest.fn(),
      zones: jest.fn(),
      zoneOccupancy: jest.fn(),
      vehicles: jest.fn(),
      createVehicle: jest.fn(),
      sessions: jest.fn(),
      activeSession: jest.fn(),
    },
  };
});

const user = {
  id: "u1",
  name: "Alex Driver",
  email: "alex@parada.test",
  username: null,
  phone: null,
  role: "USER",
  status: "ACTIVE",
  emailVerifiedAt: "2026-01-01T00:00:00.000Z",
  pendingEmail: null,
  pendingPhone: null,
  avatarUpdatedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  jest.clearAllMocks();
  __router.replace.mockClear();
  __router.push.mockClear();
  (SecureStore as typeof SecureStore & { __reset: () => void }).__reset();
});

describe("login screen", () => {
  it("signs in, stores the token and navigates to tabs", async () => {
    (api.login as jest.Mock).mockResolvedValue({ user, token: "tok-uid" });
    renderWithAppProviders(<LoginScreen />);

    fireEvent.changeText(screen.getByTestId("login-email"), "alex@parada.test");
    fireEvent.changeText(screen.getByTestId("login-password"), "password123");
    fireEvent.press(screen.getByTestId("login-submit"));

    await waitFor(() => expect(api.login).toHaveBeenCalledWith("alex@parada.test", "password123"));
    await waitFor(() => expect(SecureStore.getItemAsync).toHaveBeenCalled());
    await expect(getToken()).resolves.toBe("tok-uid");
    await waitFor(() => expect(__router.replace).toHaveBeenCalledWith("/(tabs)/parking"));
  });

  it("continues verification (never re-registers) when the account is unverified", async () => {
    (api.login as jest.Mock).mockRejectedValue(
      new ApiError("EMAIL_NOT_VERIFIED", "Verify your email address to continue.", 403, {
        email: "alex@parada.test",
        verification: null,
      }),
    );
    renderWithAppProviders(<LoginScreen />);

    fireEvent.changeText(screen.getByTestId("login-email"), "Alex@parada.test");
    fireEvent.changeText(screen.getByTestId("login-password"), "password123");
    fireEvent.press(screen.getByTestId("login-submit"));

    await waitFor(() =>
      expect(__router.replace).toHaveBeenCalledWith({ pathname: "/verify-email", params: { email: "alex@parada.test" } }),
    );
    await expect(getToken()).resolves.toBeNull();
    expect(screen.queryByTestId("login-error")).toBeNull();
  });

  it("offers password recovery from the login screen", () => {
    renderWithAppProviders(<LoginScreen />);
    expect(screen.getByTestId("login-goto-forgot")).toBeOnTheScreen();
  });

  it("shows the backend error and does not navigate on 401", async () => {
    (api.login as jest.Mock).mockRejectedValue(new ApiError("UNAUTHORIZED", "Invalid email or password.", 401));
    renderWithAppProviders(<LoginScreen />);

    fireEvent.changeText(screen.getByTestId("login-email"), "alex@parada.test");
    fireEvent.changeText(screen.getByTestId("login-password"), "nope-nope");
    fireEvent.press(screen.getByTestId("login-submit"));

    await waitFor(() => expect(screen.getByTestId("login-error")).toHaveTextContent("Invalid email or password."));
    expect(__router.replace).not.toHaveBeenCalled();
  });
});

describe("register screen", () => {
  it("validates locally before calling the API", async () => {
    renderWithAppProviders(<RegisterScreen />);

    fireEvent.press(screen.getByTestId("register-submit"));
    expect(api.register).not.toHaveBeenCalled();
    expect(screen.getByText("Enter your name.")).toBeOnTheScreen();
    expect(screen.getByText("Enter a valid email address.")).toBeOnTheScreen();
    expect(screen.getByText("Password must be at least 8 characters.")).toBeOnTheScreen();
  });

  it("rejects a mismatched confirmation password", async () => {
    renderWithAppProviders(<RegisterScreen />);

    fireEvent.changeText(screen.getByTestId("register-name"), "Alex Driver");
    fireEvent.changeText(screen.getByTestId("register-email"), "alex@parada.test");
    fireEvent.changeText(screen.getByTestId("register-password"), "password123");
    fireEvent.changeText(screen.getByTestId("register-confirm"), "password999");
    fireEvent.press(screen.getByTestId("register-submit"));

    expect(api.register).not.toHaveBeenCalled();
    expect(screen.getByText("Passwords do not match.")).toBeOnTheScreen();
  });

  it("creates the account, stores NO token, and continues to email verification", async () => {
    (api.register as jest.Mock).mockResolvedValue({
      user: { ...user, emailVerifiedAt: null },
      verification: { expiresAt: "2026-01-01T00:10:00.000Z", resendAvailableAt: "2026-01-01T00:01:00.000Z" },
    });
    renderWithAppProviders(<RegisterScreen />);

    fireEvent.changeText(screen.getByTestId("register-name"), "Alex Driver");
    fireEvent.changeText(screen.getByTestId("register-email"), "alex@parada.test");
    fireEvent.changeText(screen.getByTestId("register-password"), "password123");
    fireEvent.changeText(screen.getByTestId("register-confirm"), "password123");
    fireEvent.press(screen.getByTestId("register-submit"));

    await waitFor(() =>
      expect(api.register).toHaveBeenCalledWith("Alex Driver", "alex@parada.test", "password123"),
    );
    await waitFor(() =>
      expect(__router.replace).toHaveBeenCalledWith({ pathname: "/verify-email", params: { email: "alex@parada.test" } }),
    );
    await expect(getToken()).resolves.toBeNull();
    expect(__router.replace).not.toHaveBeenCalledWith("/(tabs)/parking");
  });
});

describe("session provider bootstrap", () => {
  it("restores an ACTIVE session from a stored token", async () => {
    await SecureStore.setItemAsync("parada.session.token", "tok-persisted");
    (api.me as jest.Mock).mockResolvedValue(user);

    renderWithAppProviders(<Probe />);

    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent(user.email));
    expect(api.me).toHaveBeenCalledTimes(1);
  });

  it("treats a revoked/expired token as signed out", async () => {
    await SecureStore.setItemAsync("parada.session.token", "tok-dead");
    (api.me as jest.Mock).mockRejectedValue(new ApiError("UNAUTHORIZED", "Session expired.", 401));

    renderWithAppProviders(<Probe />);

    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("signed-out"));
    await expect(getToken()).resolves.toBeNull();
  });

  it("preserves the token on a network failure rather than logging the user out", async () => {
    await SecureStore.setItemAsync("parada.session.token", "tok-alive");
    (api.me as jest.Mock).mockRejectedValue(
      new ApiError("NETWORK", "Cannot reach the PARADA server.", 0),
    );

    renderWithAppProviders(<Probe />);

    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("signed-out"));
    await expect(getToken()).resolves.toBe("tok-alive");
  });

  it("preserves the token on a timeout rather than logging the user out", async () => {
    await SecureStore.setItemAsync("parada.session.token", "tok-alive");
    (api.me as jest.Mock).mockRejectedValue(
      new ApiError("TIMEOUT", "The request timed out.", 0),
    );

    renderWithAppProviders(<Probe />);

    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("signed-out"));
    await expect(getToken()).resolves.toBe("tok-alive");
  });

  it("does not treat a backend outage as a revoked token", async () => {
    await SecureStore.setItemAsync("parada.session.token", "tok-alive");
    (api.me as jest.Mock).mockRejectedValue(
      new ApiError("BAD_GATEWAY", "The server is down.", 502),
    );

    renderWithAppProviders(<Probe />);

    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("signed-out"));
    await expect(getToken()).resolves.toBe("tok-alive");
  });

  it("does not treat FORBIDDEN (403) as a revoked token", async () => {
    await SecureStore.setItemAsync("parada.session.token", "tok-alive");
    (api.me as jest.Mock).mockRejectedValue(
      new ApiError("FORBIDDEN", "Not permitted.", 403),
    );

    renderWithAppProviders(<Probe />);

    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("signed-out"));
    await expect(getToken()).resolves.toBe("tok-alive");
  });
});

function Probe() {
  const { user: current, isLoading } = useSession();
  if (isLoading) {
    return <Text testID="probe">loading</Text>;
  }
  return <Text testID="probe">{current ? current.email : "signed-out"}</Text>;
}

