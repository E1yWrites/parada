import { fireEvent, render, screen, within } from "@testing-library/react";
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
    // Exactly one way out (it used to appear twice at once).
    expect(screen.getAllByRole("button", { name: /log ?out/i })).toHaveLength(1);
  });

  it("marks the active route with aria-current on the soft active container", () => {
    setAuth({ user: { id: "u1", email: "admin@parada.local", role: "ADMIN" } as never, loading: false });
    render(
      <AppShell>
        <div>content</div>
      </AppShell>
    );
    expect(screen.getByRole("link", { name: /dashboard/i })).toHaveAttribute("aria-current", "page");
  });

  it("shows every operational page without expanding anything", () => {
    setAuth({ user: { id: "u1", name: "Ari Admin", email: "admin@parada.local", role: "ADMIN" } as never, loading: false });
    render(
      <AppShell>
        <div>content</div>
      </AppShell>
    );
    const nav = screen.getByRole("navigation", { name: "Primary" });
    for (const name of ["Dashboard", "Zones", "Cameras", "Sessions", "Reservations", "Violations", "Appeals", "Anomalies"]) {
      expect(within(nav).getByRole("link", { name })).toBeInTheDocument();
    }
    // Groups are headings, not toggles.
    expect(within(nav).queryByRole("button")).not.toBeInTheDocument();
    expect(within(nav).getByRole("heading", { name: "Monitor" })).toBeInTheDocument();
    // One name for /sessions.
    expect(within(nav).getByRole("link", { name: "Sessions" })).toHaveAttribute("href", "/sessions");
    expect(within(nav).queryByRole("link", { name: "Vehicles" })).not.toBeInTheDocument();
  });

  it("has one identity (linking to Account) and one Log out", () => {
    const signOut = jest.fn();
    setAuth({ user: { id: "u1", name: "Ari Admin", email: "admin@parada.local", role: "ADMIN" } as never, loading: false, signOut });
    render(
      <AppShell>
        <div>content</div>
      </AppShell>
    );
    expect(screen.getAllByRole("link", { name: /account: ari admin/i })).toHaveLength(1);
    expect(screen.getByRole("link", { name: /account: ari admin/i })).toHaveAttribute("href", "/account");
    expect(screen.getAllByText("Ari Admin")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("offers a skip link to the main content as the first focusable element", () => {
    setAuth({ user: { id: "u1", name: "Ari Admin", email: "admin@parada.local", role: "ADMIN" } as never, loading: false });
    const { container } = render(
      <AppShell>
        <div>content</div>
      </AppShell>
    );
    const first = container.querySelector("a[href], button");
    expect(first).toHaveTextContent("Skip to content");
    expect(first).toHaveAttribute("href", "#main");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
  });

  it("opens the menu as a dialog that closes on Escape and returns focus", () => {
    setAuth({ user: { id: "u1", name: "Ari Admin", email: "admin@parada.local", role: "ADMIN" } as never, loading: false });
    render(
      <AppShell>
        <div>content</div>
      </AppShell>
    );
    const opener = screen.getByRole("button", { name: "Open menu" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Menu" });
    expect(within(dialog).getByRole("navigation", { name: "Primary (menu)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close menu" })).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});