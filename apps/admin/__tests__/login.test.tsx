import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import LoginPage from "@/app/login/page";
import { ApiError } from "@/lib/api/client";

const mockRouter = { replace: jest.fn(), refresh: jest.fn() };
const mockSignIn = jest.fn();
const mockSignOut = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

jest.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, loading: false, error: null, signIn: mockSignIn, signOut: mockSignOut }),
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
    expect(mockSignOut).toHaveBeenCalled();
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

describe("admin login — landmarks and copy", () => {
  it("puts the form in a main landmark and says nothing about cookie internals", () => {
    render(<LoginPage />);
    expect(screen.getByRole("main")).toContainElement(screen.getByRole("button", { name: /sign in/i }));
    expect(screen.queryByText(/httponly/i)).not.toBeInTheDocument();
  });
});

describe("Login page — old mascot removed", () => {
  it("no longer loads the old mascot image", () => {
    const { container } = render(<LoginPage />);
    const srcs = Array.from(container.querySelectorAll("img")).map((img) => img.getAttribute("src") ?? "");
    expect(srcs.some((src) => /mascot/i.test(src))).toBe(false);
    expect(screen.getByText("Guiding every vehicle to its zone.")).toBeInTheDocument();
  });
});

describe("Login page — Lottie", () => {
  it("shows Lottie in the brand panel with a greeting, hidden from screen readers and not focusable", () => {
    const { container } = render(<LoginPage />);
    expect(screen.getByText("Lottie's on duty.")).toBeInTheDocument();
    const lottie = container.querySelector('[data-testid="lottie"]');
    expect(lottie).toHaveAttribute("aria-hidden", "true");
    expect(lottie?.querySelector("button, a, [tabindex]")).toBeNull();
  });
});
