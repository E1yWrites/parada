import { act, render, screen, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "@/components/providers/auth-provider";
import { ApiError } from "@/lib/api/client";

const mockRouter = { replace: jest.fn(), refresh: jest.fn() };

jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

jest.mock("@/lib/api/client", () => {
  const { ApiError } = jest.requireActual("@/lib/api/client");
  return {
    ApiError,
    api: { me: jest.fn(), login: jest.fn(), logout: jest.fn() },
  };
});

const api = jest.requireMock("@/lib/api/client").api;

function Harness() {
  const { user, loading, error, signIn, signOut } = useAuth();
  const handle = async (action: "signIn" | "signOut") => {
    if (action === "signIn") {
      try {
        await signIn("admin@parada.local", "AdminPass123!");
      } catch {
        // surfaced via error state
      }
    } else {
      await signOut();
    }
  };
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user ? user.email : "null"}</span>
      <span data-testid="error">{error ?? ""}</span>
      <button onClick={() => handle("signIn")}>sign-in</button>
      <button onClick={() => handle("signOut")}>sign-out</button>
    </div>
  );
}

describe("AuthProvider — session behaviour", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("restores an authenticated session via GET /auth/me on mount", async () => {
    (api.me as jest.Mock).mockResolvedValue({ id: "u1", email: "admin@parada.local", role: "ADMIN" });
    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>
    );
    expect(screen.getByTestId("loading").textContent).toBe("true");
    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("admin@parada.local"));
    expect(screen.getByTestId("loading").textContent).toBe("false");
  });

  it("treats a 503 from /auth/me as an unreachable API, not as signed out", async () => {
    (api.me as jest.Mock).mockRejectedValue(new ApiError("NETWORK", "Unable to reach the PARADA API.", 503));
    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("error").textContent).toBe("Unable to reach the PARADA API.");
    expect(screen.getByTestId("user").textContent).toBe("null");
  });

  it("keeps a plain 401 as signed out with no error", async () => {
    (api.me as jest.Mock).mockRejectedValue(new ApiError("UNAUTHORIZED", "Not authenticated.", 401));
    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("error").textContent).toBe("");
  });

  it("signs in with valid credentials and stores the session in state only", async () => {
    (api.me as jest.Mock).mockRejectedValue(new ApiError("UNAUTHORIZED", "Not authenticated.", 401));
    (api.login as jest.Mock).mockResolvedValue({ id: "u1", email: "admin@parada.local", role: "ADMIN" });
    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    fireEventClick("sign-in");
    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("admin@parada.local"));
    expect(api.login).toHaveBeenCalledWith("admin@parada.local", "AdminPass123!");
  });

  it("surfaces the backend error message and rethrows on failed login", async () => {
    (api.me as jest.Mock).mockRejectedValue(new ApiError("UNAUTHORIZED", "Not authenticated.", 401));
    (api.login as jest.Mock).mockRejectedValue(new ApiError("UNAUTHORIZED", "Invalid email or password.", 401));
    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    fireEventClick("sign-in");
    await waitFor(() => expect(screen.getByTestId("error").textContent).toBe("Invalid email or password."));
  });

  it("logs out via the backend, clears the session and redirects to /login", async () => {
    (api.me as jest.Mock).mockRejectedValue(new ApiError("UNAUTHORIZED", "Not authenticated.", 401));
    (api.login as jest.Mock).mockResolvedValue({ id: "u1", email: "admin@parada.local", role: "ADMIN" });
    (api.logout as jest.Mock).mockResolvedValue(undefined);
    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    fireEventClick("sign-in");
    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("admin@parada.local"));

    fireEventClick("sign-out");
    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("null"));
    expect(api.logout).toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith("/login");
  });
});

function fireEventClick(label: string) {
  const { fireEvent } = require("@testing-library/react");
  fireEvent.click(screen.getByRole("button", { name: label }));
}