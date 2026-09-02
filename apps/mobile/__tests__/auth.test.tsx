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
  role: "USER",
  status: "ACTIVE",
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

  it("creates the account, stores the token and navigates to tabs", async () => {
    (api.register as jest.Mock).mockResolvedValue({ user, token: "tok-reg" });
    renderWithAppProviders(<RegisterScreen />);

    fireEvent.changeText(screen.getByTestId("register-name"), "Alex Driver");
    fireEvent.changeText(screen.getByTestId("register-email"), "alex@parada.test");
    fireEvent.changeText(screen.getByTestId("register-password"), "password123");
    fireEvent.changeText(screen.getByTestId("register-confirm"), "password123");
    fireEvent.press(screen.getByTestId("register-submit"));

    await waitFor(() =>
      expect(api.register).toHaveBeenCalledWith("Alex Driver", "alex@parada.test", "password123"),
    );
    await expect(getToken()).resolves.toBe("tok-reg");
    await waitFor(() => expect(__router.replace).toHaveBeenCalledWith("/(tabs)/parking"));
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
});

function Probe() {
  const { user: current, isLoading } = useSession();
  if (isLoading) {
    return <Text testID="probe">loading</Text>;
  }
  return <Text testID="probe">{current ? current.email : "signed-out"}</Text>;
}

