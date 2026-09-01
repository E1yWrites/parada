import { render, screen } from "@testing-library/react";
import { AppShell } from "@/components/AppShell";

jest.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

jest.mock("next/link", () => {
  return ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>;
});

const mockAuth = { user: null, loading: true, error: null, signIn: jest.fn(), signOut: jest.fn() };

jest.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => mockAuth,
}));

function setAuth(value: Partial<typeof mockAuth>) {
  Object.assign(mockAuth, value);
}

describe("AppShell — role protection", () => {
  beforeEach(() => {
    setAuth({ user: null, loading: true, error: null, signIn: jest.fn(), signOut: jest.fn() });
  });

  it("shows a loading state while the session is restored", () => {
    render(
      <AppShell>
        <div>content</div>
      </AppShell>
    );
    expect(screen.getByText("Loading operations console…")).toBeInTheDocument();
  });

  it("blocks unauthenticated visitors and links to sign in", () => {
    setAuth({ user: null, loading: false });
    render(
      <AppShell>
        <div>content</div>
      </AppShell>
    );
    expect(screen.getByText("Admin access required")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/login");
  });

  it("blocks USER accounts with a forbidden message", () => {
    setAuth({ user: { id: "u1", email: "driver@parada.local", role: "USER" } as never, loading: false });
    render(
      <AppShell>
        <div>content</div>
      </AppShell>
    );
    expect(screen.getByText("Forbidden")).toBeInTheDocument();
    expect(screen.getByText(/does not have administrator privileges/i)).toBeInTheDocument();
  });

  it("renders the operations console for ADMIN accounts", () => {
    setAuth({ user: { id: "u1", email: "admin@parada.local", role: "ADMIN" } as never, loading: false });
    render(
      <AppShell>
        <div>content</div>
      </AppShell>
    );
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Simulator")).toBeInTheDocument();
    expect(screen.getByText("Logout")).toBeInTheDocument();
  });
});