import type { ReactElement } from "react";
import { act, fireEvent, render as rtlRender, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { ThemeProvider } from "@/components/providers/theme-provider";

jest.mock("@/lib/api/client", () => ({
  api: { notifications: jest.fn().mockResolvedValue({ notifications: [], unreadCount: 0 }) },
}));

/** The shell's header now holds the notification bell (a query) and the theme toggle. */
function render(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(
    <ThemeProvider>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </ThemeProvider>
  );
}

jest.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

jest.mock("next/link", () => {
  return ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>;
});

const mockAuth: { user: unknown; loading: boolean; error: string | null; signIn: jest.Mock; signOut: jest.Mock } = { user: null, loading: true, error: null, signIn: jest.fn(), signOut: jest.fn() };

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

  it("says the API is unreachable, not 'Admin access required', when the session check failed", () => {
    setAuth({ user: null, loading: false, error: "Unable to reach the PARADA API." });
    render(
      <AppShell>
        <div>content</div>
      </AppShell>
    );
    expect(screen.getByText("Unable to reach the PARADA API.")).toBeInTheDocument();
    expect(screen.queryByText("Admin access required")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("gives every nav link a 44px minimum height", () => {
    setAuth({ user: { id: "u1", email: "admin@parada.local", role: "ADMIN" } as never, loading: false });
    render(
      <AppShell>
        <div>content</div>
      </AppShell>
    );
    const link = screen.getAllByRole("link", { name: /Dashboard/ })[0];
    expect(link.className).toContain("min-h-[44px]");
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

  it("rings the bell only when the unread count rises, not on first load", async () => {
    const { api } = jest.requireMock("@/lib/api/client") as { api: { notifications: jest.Mock } };
    api.notifications.mockResolvedValueOnce({ notifications: [], unreadCount: 2 });
    setAuth({ user: { id: "u1", email: "admin@parada.local", role: "ADMIN" } as never, loading: false });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rtlRender(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <AppShell>
            <div>content</div>
          </AppShell>
        </QueryClientProvider>
      </ThemeProvider>
    );
    const bell = await screen.findByRole("link", { name: "Notifications, 2 unread" });
    expect(bell).toHaveAttribute("data-rings", "0");

    api.notifications.mockResolvedValueOnce({ notifications: [], unreadCount: 3 });
    await act(() => client.invalidateQueries({ queryKey: ["notifications"] }));
    expect(await screen.findByRole("link", { name: "Notifications, 3 unread" })).toHaveAttribute("data-rings", "1");

    api.notifications.mockResolvedValueOnce({ notifications: [], unreadCount: 1 });
    await act(() => client.invalidateQueries({ queryKey: ["notifications"] }));
    expect(await screen.findByRole("link", { name: "Notifications, 1 unread" })).toHaveAttribute("data-rings", "1");
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

  it("draws the active pill once a sidebar hidden at first paint becomes visible (window widened)", () => {
    setAuth({ user: { id: "u1", name: "Ari Admin", email: "admin@parada.local", role: "ADMIN" } as never, loading: false });
    let visible = false;
    const spy = jest.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const h = visible && this.tagName === "A" ? 40 : 0;
      return { top: 0, left: 0, right: 0, bottom: h, width: 0, height: h, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    });
    const { container } = render(
      <AppShell>
        <div>content</div>
      </AppShell>
    );
    const pill = () => container.querySelector('nav[aria-label="Primary"] span[data-nav-pill]');
    expect(pill()).toBeNull();

    visible = true;
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(pill()).not.toBeNull();
    spy.mockRestore();
  });
});
