import { render, screen } from "@testing-library/react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/providers/auth-provider";
import { usePathname } from "next/navigation";

jest.mock("@/components/providers/auth-provider", () => ({
  useAuth: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(),
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));

const mockUseAuth = useAuth as jest.Mock;
const mockUsePathname = usePathname as jest.Mock;

const adminUser = {
  id: "u1",
  name: "Admin",
  email: "admin@x.com",
  role: "ADMIN" as const,
  status: "ACTIVE" as const,
  createdAt: "2026-01-01T00:00:00Z",
};

describe("AppShell (admin role protection)", () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue("/");
    jest.clearAllMocks();
  });

  it("shows a loading state while checking the session", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true, error: null });
    render(<AppShell>content</AppShell>);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders admin navigation for an ADMIN user", () => {
    mockUseAuth.mockReturnValue({
      user: adminUser,
      loading: false,
      error: null,
      signIn: jest.fn(),
      signOut: jest.fn(),
    });
    render(<AppShell>content</AppShell>);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Zones")).toBeInTheDocument();
    expect(screen.getByText("Cameras")).toBeInTheDocument();
    expect(screen.getByText("Simulator")).toBeInTheDocument();
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("denies access to a non-admin (USER) with no navigation", () => {
    mockUseAuth.mockReturnValue({
      user: { ...adminUser, role: "USER" },
      loading: false,
      error: null,
      signIn: jest.fn(),
      signOut: jest.fn(),
    });
    render(<AppShell>content</AppShell>);
    expect(screen.getByText("Admin access required")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });

  it("denies access when there is no signed-in user", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false, error: null });
    render(<AppShell>content</AppShell>);
    expect(screen.getByText("Admin access required")).toBeInTheDocument();
  });
});
