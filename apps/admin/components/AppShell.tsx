"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MapPinned,
  Camera,
  CarFront,
  Users,
  Bell,
  TriangleAlert,
  Clock3,
  FlaskConical,
  UserCircle2,
  LogOut,
  Menu,
  X,
  Activity,
} from "lucide-react";
import { useAuth } from "./providers/auth-provider";
import { FullPageSpinner } from "./ui/State";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true }],
  },
  {
    label: "Parking",
    items: [
      { href: "/zones", label: "Zones", icon: MapPinned },
      { href: "/cameras", label: "Cameras", icon: Camera },
      { href: "/sessions", label: "Sessions", icon: CarFront },
    ],
  },
  {
    label: "Management",
    items: [
      { href: "/users", label: "Users", icon: Users },
      { href: "/notifications", label: "Notifications", icon: Bell },
      { href: "/anomalies", label: "Anomalies", icon: TriangleAlert },
      { href: "/history", label: "History", icon: Clock3 },
    ],
  },
  {
    label: "Tools",
    items: [{ href: "/simulator", label: "Simulator", icon: FlaskConical }],
  },
  {
    label: "Account",
    items: [{ href: "/account", label: "Account", icon: UserCircle2 }],
  },
];

function isActive(href: string, exact: boolean | undefined, pathname: string): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-gradient shadow-glow-orange">
        <Activity className="h-5 w-5 text-white" aria-hidden="true" />
      </div>
      <div className="leading-none">
        <span className="font-display text-lg font-bold tracking-tight text-white">PARADA</span>
        <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-widest text-muted">
          Operations
        </span>
      </div>
    </Link>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {GROUPS.map((group) => (
        <div key={group.label}>
          <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted/60">
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(item.href, item.exact, pathname);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`relative flex min-h-[40px] items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-200 ${
                      active
                        ? "bg-[#EA580C]/10 text-[#F7931A] shadow-[0_0_20px_-5px_rgba(234,88,12,0.5)]"
                        : "text-muted hover:bg-white/[0.03] hover:text-white"
                    }`}
                  >
                    {active ? (
                      <span
                        className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-orange"
                        aria-hidden="true"
                      />
                    ) : null}
                    <Icon className={`h-[18px] w-[18px] ${active ? "text-[#F7931A]" : ""}`} aria-hidden="true" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SidebarFooter({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="border-t border-white/10 p-3">
      <button
        type="button"
        onClick={onLogout}
        className="flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted transition-colors duration-200 hover:bg-white/[0.03] hover:text-orange"
      >
        <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
        Logout
      </button>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading) return <FullPageSpinner label="Loading operations console…" />;

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-gradient shadow-glow-orange">
          <Activity className="h-7 w-7 text-white" aria-hidden="true" />
        </div>
        <h1 className="font-display text-xl font-bold text-white">Admin access required</h1>
        <p className="max-w-sm text-sm text-muted">
          PARADA Operations is restricted to administrators. Sign in with an admin account.
        </p>
        <Link href="/login" className="btn-primary mt-2">
          Sign in
        </Link>
      </div>
    );
  }

  if (user.role !== "ADMIN") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <TriangleAlert className="h-10 w-10 text-rose-400" aria-hidden="true" />
        <h1 className="font-display text-xl font-bold text-white">Forbidden</h1>
        <p className="max-w-sm text-sm text-muted">
          Your account does not have administrator privileges.
        </p>
        <button type="button" className="btn-secondary" onClick={() => signOut()}>
          Sign out
        </button>
      </div>
    );
  }

  const pageTitle = "Operations";

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/10 bg-surface/60 backdrop-blur lg:flex">
        <div className="border-b border-white/10 p-4">
          <Brand />
        </div>
        <NavList />
        <SidebarFooter onLogout={() => signOut()} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-white/10 bg-surface">
            <div className="flex items-center justify-between border-b border-white/10 p-4">
              <Brand />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-white/[0.03] hover:text-white"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <NavList onNavigate={() => setMobileOpen(false)} />
            <SidebarFooter onLogout={() => signOut()} />
          </aside>
        </div>
      ) : null}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-white/10 bg-void/70 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="-ml-1 flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-white/[0.03] hover:text-white lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <div>
              <p className="hidden text-[10px] font-semibold uppercase tracking-widest text-muted sm:block">
                Smart Parking · Control Center
              </p>
              <p className="font-display text-sm font-semibold text-white">{pageTitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-300 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse-dot" aria-hidden="true" />
              System online
            </span>
            <div className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-surface/60 px-3 py-1.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-orange/20">
                <UserCircle2 className="h-4 w-4 text-orange" aria-hidden="true" />
              </div>
              <div className="hidden leading-tight sm:block">
                <p className="text-xs font-semibold text-white">{user.name}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted">{user.role}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => signOut()}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-white/[0.03] hover:text-orange"
              aria-label="Logout"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
