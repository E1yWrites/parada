import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import LoginPage from "@/app/login/page";
import { ApiError } from "@/lib/api/client";

const mockRouter = { replace: jest.fn(), refresh: jest.fn() };
const mockSignIn = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

jest.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, loading: false, error: null, signIn: mockSignIn, signOut: jest.fn() }),
}));

describe("Login page — authentication behavior", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the admin sign-in form", () => {
    render(<LoginPage />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("accepts an ADMIN account and redirects to the dashboard", async () => {
    mockSignIn.mockResolvedValue({ role: "ADMIN", email: "admin@parada.local", id: "u1" });
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "admin@parada.local" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "AdminPass123!" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith("admin@parada.local", "AdminPass123!"));
    expect(mockRouter.replace).toHaveBeenCalledWith("/");
  });

  it("rejects a USER account from the admin console (no redirect)", async () => {
    mockSignIn.mockResolvedValue({ role: "USER", email: "driver@parada.local", id: "u2" });
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "driver@parada.local" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "DriverPass123!" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() =>
      expect(screen.getByText("This account does not have administrator access.")).toBeInTheDocument()
    );
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("displays the backend error message for an invalid login", async () => {
    mockSignIn.mockRejectedValue(new ApiError("UNAUTHORIZED", "Invalid email or password.", 401));
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "admin@parada.local" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(screen.getByText("Invalid email or password.")).toBeInTheDocument());
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});