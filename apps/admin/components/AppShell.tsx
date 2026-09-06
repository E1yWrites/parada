"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MapPinned,
  Camera,
  CarFront,
  Clock3,
  Users,
  Bell,
  TriangleAlert,
  History,
  UserRoundCheck,
  Activity,
  Settings2,
  UserCircle2,
  LogOut,
  Menu,
  X,
  ChevronDown,
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
  collapsible?: boolean;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true }],
  },
  {
    label: "Parking Operations",
    collapsible: true,
    items: [
      { href: "/zones", label: "Zones", icon: MapPinned },
      { href: "/cameras", label: "Cameras", icon: Camera },
      { href: "/reservations", label: "Reservations", icon: Clock3 },
      { href: "/sessions", label: "Sessions", icon: CarFront },
    ],
  },
  {
    label: "Management",
    collapsible: true,
    items: [
      { href: "/users", label: "Users", icon: Users },
      { href: "/violations", label: "Violations", icon: TriangleAlert },
      { href: "/appeals", label: "Appeals", icon: Bell },
      { href: "/guest-admit", label: "Guest Admission", icon: UserRoundCheck },
    ],
  },
  {
    label: "Analytics",
    collapsible: true,
    items: [
      { href: "/analytics", label: "Analytics", icon: Activity },
      { href: "/history", label: "History", icon: History },
    ],
  },
  {
    label: "System",
    collapsible: true,
    items: [
      { href: "/notifications", label: "Notifications", icon: Bell },
      { href: "/anomalies", label: "Anomalies", icon: TriangleAlert },
    ],
  },
  {
    label: "Tools",
    items: [
      { href: "/simulator", label: "Simulator", icon: Activity },
      { href: "/settings", label: "Settings", icon: Settings2 },
    ],
  },
  {
    label: "Account",
    items: [{ href: "/account", label: "Account", icon: UserCircle2 }],
  },
];

function groupId(label: string) {
  return `nav-group-${label.toLowerCase().replace(/\s+/g, "-")}`;
}

function isActive(href: string, exact: boolean | undefined, pathname: string): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand shadow-[0_10px_18px_-8px_rgba(202,0,19,0.6)]">
        <Activity className="h-5 w-5 text-white" aria-hidden="true" />
      </div>
      <div className="leading-none">
        <span className="font-display text-xl font-black tracking-[-0.02em] text-charcoal">PARADA</span>
        <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.18em] text-muted">
          Smart Parking
        </span>
      </div>
    </Link>
  );
}

function NavLink({ item, pathname, onNavigate }: { item: NavItem; pathname: string; onNavigate?: () => void }) {
  const active = isActive(item.href, item.exact, pathname);
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={`flex min-h-[44px] items-center gap-3 rounded-2xl border px-3 text-sm font-semibold transition-colors duration-200 ${
          active
            ? "border-line/60 bg-white text-charcoal shadow-[0_1px_2px_rgba(23,30,25,0.06)]"
            : "border-transparent text-muted hover:bg-white hover:text-charcoal"
        }`}
      >
        <Icon
          className={`h-5 w-5 shrink-0 ${active ? "text-brand" : "text-muted"}`}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
      </Link>
    </li>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(GROUPS.filter((g) => !g.collapsible).map((g) => g.label))
  );

  function toggle(label: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  return (
    <nav className="flex-1 overflow-y-auto px-5 py-4" aria-label="Primary">
      {GROUPS.map((group) => {
        const id = groupId(group.label);
        const expanded = open.has(group.label);
        return (
          <div key={group.label} className="mb-6">
            {group.collapsible ? (
              <button
                type="button"
                onClick={() => toggle(group.label)}
                aria-expanded={expanded}
                aria-controls={id}
                className="flex min-h-[34px] w-full items-center gap-2 rounded-xl px-3 font-display text-[11px] font-black uppercase tracking-[0.14em] text-muted transition-colors duration-200 hover:text-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                <span>{group.label}</span>
                <ChevronDown
                  className={`ml-auto h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </button>
            ) : (
              <p className="px-3 pb-1.5 font-display text-[11px] font-black uppercase tracking-[0.14em] text-muted">
                {group.label}
              </p>
            )}

            {expanded ? (
              <ul
                id={id}
                className="mt-2 space-y-1 border-l border-line/50 pl-3"
                aria-label={`${group.label} navigation`}
              >
                {group.items.map((item) => (
                  <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

function SidebarFooter({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="border-t border-line/50 p-4">
      <div className="flex items-center gap-3 rounded-2xl px-3 py-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft" aria-hidden="true">
          <UserCircle2 className="h-5 w-5 text-brand" />
        </div>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-bold text-charcoal">Account</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Administrator</p>
        </div>
      </div>
      <div className="mt-1">
        <button
          type="button"
          onClick={onLogout}
          className="flex min-h-[44px] w-full items-center gap-3 rounded-2xl px-3 text-sm font-semibold text-muted transition-colors duration-200 hover:bg-white hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <LogOut className="h-5 w-5 shrink-0" aria-hidden="true" />
          Logout
        </button>
      </div>
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
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand shadow-[0_12px_24px_-10px_rgba(202,0,19,0.6)]">
          <Activity className="h-7 w-7 text-white" aria-hidden="true" />
        </div>
        <h1 className="font-display text-2xl font-black tracking-tight text-charcoal">Admin access required</h1>
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
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft" aria-hidden="true">
          <TriangleAlert className="h-7 w-7 text-brand" />
        </div>
        <h1 className="font-display text-2xl font-black tracking-tight text-charcoal">Forbidden</h1>
        <p className="max-w-sm text-sm text-muted">
          Your account does not have administrator privileges.
        </p>
        <button type="button" className="btn-secondary" onClick={() => signOut()}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line/40 bg-paper lg:flex">
        <div className="px-5 pb-2 pt-5">
          <Brand />
        </div>
        <NavList />
        <SidebarFooter onLogout={() => signOut()} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-charcoal/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-line/40 bg-paper">
            <div className="flex items-center justify-between border-b border-line/40 px-4 py-4">
              <Brand />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="flex h-11 w-11 items-center justify-center rounded-2xl text-muted transition-colors duration-200 hover:bg-white hover:text-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
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
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-line/50 bg-white/75 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="-ml-1 flex h-11 w-11 items-center justify-center rounded-panel text-muted hover:bg-charcoal/[0.05] hover:text-charcoal lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <div>
              <p className="hidden text-[10px] font-bold uppercase tracking-[0.18em] text-muted sm:block">
                Smart Parking · Control Center
              </p>
              <p className="font-display text-base font-black tracking-tight text-charcoal">Operations</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/notifications"
              className="flex h-11 w-11 items-center justify-center rounded-panel text-muted transition-colors duration-200 hover:bg-charcoal/[0.05] hover:text-brand"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" aria-hidden="true" />
            </Link>
            <div className="flex items-center gap-2.5 rounded-panel border border-line/50 bg-white px-3 py-1.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft" aria-hidden="true">
                <UserCircle2 className="h-5 w-5 text-brand" />
              </div>
              <div className="hidden leading-tight sm:block">
                <p className="text-sm font-bold text-charcoal">{user.name}</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{user.role}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => signOut()}
              className="flex h-11 w-11 items-center justify-center rounded-panel text-muted transition-colors duration-200 hover:bg-charcoal/[0.05] hover:text-brand"
              aria-label="Logout"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10">{children}</main>
      </div>
    </div>
  );
}