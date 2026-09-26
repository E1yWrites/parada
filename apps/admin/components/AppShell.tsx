"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
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
  BarChart3,
  FlaskConical,
  Scale,
  Settings2,
  UserCircle2,
  LogOut,
  Menu,
  X,
  ChevronDown,
  ShieldAlert,
} from "lucide-react";
import { useAuth } from "./providers/auth-provider";
import { ConnectionIndicator } from "./ConnectionIndicator";
import { FullPageSpinner } from "./ui/State";

/** The canonical PARADA logo, unmodified, mounted on its own light plate —
 *  the source asset is black ink on a transparent field and would disappear
 *  directly on the dark nav/ground. The plate is a fixed neutral white by
 *  design (intentionally theme-independent): the mark needs the same
 *  legible ground in both registers, not a themed surface color. */
function BrandLogo({ height = 15 }: { height?: number }) {
  const width = Math.round(height * (1500 / 198));
  return (
    <div className="inline-flex shrink-0 items-center rounded-lg rounded-tr-panel-cut border border-line bg-white px-2 py-1.5">
      <Image src="/brand/parada-logo.webp" alt="PARADA" width={width} height={height} priority />
    </div>
  );
}

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
      { href: "/sessions", label: "Vehicles", icon: CarFront },
    ],
  },
  {
    label: "Management",
    collapsible: true,
    items: [
      { href: "/users", label: "Users", icon: Users },
      { href: "/violations", label: "Violations", icon: TriangleAlert },
      { href: "/appeals", label: "Appeals", icon: Scale },
      { href: "/guest-admit", label: "Guest Admission", icon: UserRoundCheck },
    ],
  },
  {
    label: "Analytics",
    collapsible: true,
    items: [
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
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
      { href: "/simulator", label: "Simulator", icon: FlaskConical },
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
    <Link href="/" className="flex items-center gap-3 rounded-control focus-visible:outline-none focus-visible:shadow-focus">
      <BrandLogo height={14} />
      <span className="mt-0.5 block text-micro font-semibold text-muted">Operations console</span>
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
        data-active={active ? "true" : undefined}
        className={`relative z-[1] flex min-h-[40px] items-center gap-3 rounded-control px-3 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:shadow-focus ${
          active ? "text-brand-ink" : "text-muted hover:bg-raised hover:text-charcoal"
        }`}
      >
        <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? "text-brand-ink" : "text-muted"}`} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {active ? <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" /> : null}
      </Link>
    </li>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(GROUPS.filter((g) => !g.collapsible).map((g) => g.label))
  );
  const navRef = useRef<HTMLElement>(null);
  const [pill, setPill] = useState<{ top: number; height: number } | null>(null);

  // One active pill that slides between links instead of each link painting
  // its own background. Measured from the nav's scroll box; hidden when the
  // active link is inside a collapsed group.
  useLayoutEffect(() => {
    const nav = navRef.current;
    const link = nav?.querySelector<HTMLElement>('a[data-active="true"]');
    if (!nav || !link) {
      setPill(null);
      return;
    }
    const navRect = nav.getBoundingClientRect();
    const rect = link.getBoundingClientRect();
    if (rect.height === 0) {
      setPill(null);
      return;
    }
    setPill({ top: rect.top - navRect.top + nav.scrollTop, height: rect.height });
  }, [pathname, open]);

  function toggle(label: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  return (
    <nav ref={navRef} className="relative flex-1 overflow-y-auto px-4 py-3" aria-label="Primary">
      {pill ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-4 right-4 rounded-control bg-brand-soft motion-safe:transition-[transform,height] motion-safe:duration-200 motion-safe:ease-out"
          style={{ top: 0, height: pill.height, transform: `translateY(${pill.top}px)` }}
        />
      ) : null}
      {GROUPS.map((group) => {
        const id = groupId(group.label);
        const expanded = open.has(group.label);
        return (
          <div key={group.label} className="mb-4">
            {group.collapsible ? (
              <button
                type="button"
                onClick={() => toggle(group.label)}
                aria-expanded={expanded}
                aria-controls={id}
                className="flex min-h-[34px] w-full items-center gap-2 rounded-control px-3 text-micro font-bold uppercase tracking-[0.08em] text-muted transition-colors duration-150 hover:text-charcoal focus-visible:outline-none focus-visible:shadow-focus"
              >
                <span>{group.label}</span>
                <ChevronDown
                  className={`ml-auto h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </button>
            ) : (
              <p className="px-3 pb-1 text-micro font-bold uppercase tracking-[0.08em] text-muted">
                {group.label}
              </p>
            )}

            {expanded ? (
              <ul
                id={id}
                className="mt-1 space-y-0.5"
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

function SidebarFooter({ name, onLogout }: { name?: string; onLogout: () => void }) {
  return (
    <div className="border-t border-line p-3">
      <div className="flex items-center gap-3 rounded-control px-3 py-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft" aria-hidden="true">
          <UserCircle2 className="h-5 w-5 text-brand-ink" />
        </div>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-bold text-charcoal">{name ?? "Account"}</p>
          <p className="text-micro font-semibold text-muted">Administrator</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onLogout}
        className="mt-1 flex min-h-[40px] w-full items-center gap-3 rounded-control px-3 text-sm font-semibold text-muted transition-colors duration-150 hover:bg-danger-soft hover:text-danger focus-visible:outline-none focus-visible:shadow-focus"
      >
        <LogOut className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
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
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center">
        <BrandLogo height={20} />
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
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-soft" aria-hidden="true">
          <ShieldAlert className="h-7 w-7 text-danger" />
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
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-card lg:flex">
        <div className="px-5 pb-3 pt-5">
          <Brand />
        </div>
        <NavList />
        <SidebarFooter name={user.name} onLogout={() => signOut()} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-charcoal/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-line bg-card shadow-card-hover">
            <div className="flex items-center justify-between border-b border-line px-4 py-4">
              <Brand />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="flex h-11 w-11 items-center justify-center rounded-control text-muted transition-colors duration-150 hover:bg-raised hover:text-charcoal focus-visible:outline-none focus-visible:shadow-focus"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <NavList onNavigate={() => setMobileOpen(false)} />
            <SidebarFooter name={user.name} onLogout={() => signOut()} />
          </aside>
        </div>
      ) : null}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-line bg-card/85 px-4 backdrop-blur-md sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="-ml-1 flex h-11 w-11 items-center justify-center rounded-control text-muted hover:bg-raised hover:text-charcoal focus-visible:outline-none focus-visible:shadow-focus lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <ConnectionIndicator />
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/notifications"
              className="flex h-11 w-11 items-center justify-center rounded-control text-muted transition-colors duration-150 hover:bg-raised hover:text-brand-ink focus-visible:outline-none focus-visible:shadow-focus"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" aria-hidden="true" />
            </Link>
            <div className="flex items-center gap-2.5 rounded-control rounded-tr-control-cut border border-line bg-card py-1.5 pl-1.5 pr-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft" aria-hidden="true">
                <UserCircle2 className="h-5 w-5 text-brand-ink" />
              </div>
              <div className="hidden min-w-0 leading-tight sm:block">
                <p className="max-w-[12rem] truncate text-sm font-bold text-charcoal">{user.name}</p>
                <p className="text-micro font-semibold text-muted">Administrator</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => signOut()}
              className="flex h-11 w-11 items-center justify-center rounded-control text-muted transition-colors duration-150 hover:bg-danger-soft hover:text-danger focus-visible:outline-none focus-visible:shadow-focus"
              aria-label="Logout"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[88rem] flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}