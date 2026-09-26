"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  ShieldAlert,
} from "lucide-react";
import { useAuth } from "./providers/auth-provider";
import { BrandLogo } from "./BrandLogo";
import { ConnectionIndicator } from "./ConnectionIndicator";
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

/**
 * Every operational page is always visible and reachable by Tab — groups are
 * headings, not collapsible toggles (Zones, Cameras and Violations used to be
 * hidden inside collapsed groups, even while you were on them). Account lives
 * in the header identity link, not here.
 */
const GROUPS: NavGroup[] = [
  {
    label: "Monitor",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/zones", label: "Zones", icon: MapPinned },
      { href: "/cameras", label: "Cameras", icon: Camera },
      { href: "/sessions", label: "Sessions", icon: CarFront },
      { href: "/reservations", label: "Reservations", icon: Clock3 },
    ],
  },
  {
    label: "Act",
    items: [
      { href: "/violations", label: "Violations", icon: TriangleAlert },
      { href: "/appeals", label: "Appeals", icon: Scale },
      { href: "/anomalies", label: "Anomalies", icon: ShieldAlert },
      { href: "/guest-admit", label: "Guest admission", icon: UserRoundCheck },
    ],
  },
  {
    label: "Records",
    items: [
      { href: "/users", label: "Users", icon: Users },
      { href: "/history", label: "History", icon: History },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/simulator", label: "Simulator", icon: FlaskConical },
      { href: "/settings", label: "Settings", icon: Settings2 },
    ],
  },
];

function groupId(label: string, scope: string) {
  return `nav-${scope}-${label.toLowerCase().replace(/\s+/g, "-")}`;
}

function isActive(href: string, exact: boolean | undefined, pathname: string): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-3 rounded-control focus-visible:outline-none focus-visible:shadow-focus">
      <BrandLogo height={14} priority />
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
      </Link>
    </li>
  );
}

function NavList({ label, scope, onNavigate }: { label: string; scope: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const [pill, setPill] = useState<{ top: number; height: number } | null>(null);

  // One active pill that slides between links instead of each link painting
  // its own background. Measured from the nav's scroll box.
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
  }, [pathname]);

  return (
    <nav ref={navRef} className="relative flex-1 overflow-y-auto px-4 py-3" aria-label={label}>
      {pill ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-4 right-4 rounded-control bg-brand-soft motion-safe:transition-[transform,height] motion-safe:duration-200 motion-safe:ease-out"
          style={{ top: 0, height: pill.height, transform: `translateY(${pill.top}px)` }}
        />
      ) : null}
      {GROUPS.map((group) => {
        const id = groupId(group.label, scope);
        return (
          <div key={group.label} className="mb-4">
            <h2 id={id} className="px-3 pb-1 text-micro font-bold uppercase tracking-[0.08em] text-muted">
              {group.label}
            </h2>
            <ul className="mt-1 space-y-0.5" aria-labelledby={id}>
              {group.items.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

/**
 * Mobile navigation drawer: a modal dialog that takes focus on open, keeps
 * Tab inside itself, closes on Escape, and hands focus back to the button
 * that opened it.
 */
function Drawer({ onClose, returnFocusTo }: { onClose: () => void; returnFocusTo: React.RefObject<HTMLButtonElement | null> }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const opener = returnFocusTo.current;
    return () => opener?.focus();
  }, [returnFocusTo]);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !panelRef.current) return;
    const focusable = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <div className="absolute inset-0 bg-charcoal/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        onKeyDown={onKeyDown}
        className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-line bg-card shadow-card-hover"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-4">
          <Brand />
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-control text-muted transition-colors duration-150 hover:bg-raised hover:text-charcoal focus-visible:outline-none focus-visible:shadow-focus"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <NavList label="Primary (menu)" scope="drawer" onNavigate={onClose} />
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

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
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-charcoal focus:shadow-focus"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-card lg:flex">
        <div className="px-5 pb-3 pt-5">
          <Brand />
        </div>
        <NavList label="Primary" scope="side" />
      </aside>

      {mobileOpen ? <Drawer onClose={() => setMobileOpen(false)} returnFocusTo={menuButtonRef} /> : null}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-line bg-card px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setMobileOpen(true)}
              className="-ml-1 flex h-11 w-11 items-center justify-center rounded-control text-muted hover:bg-raised hover:text-charcoal focus-visible:outline-none focus-visible:shadow-focus lg:hidden"
              aria-label="Open menu"
              aria-expanded={mobileOpen}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <ConnectionIndicator />
          </div>

          {/* One identity (links to Account) and one Log out — each appeared twice before. */}
          <div className="flex items-center gap-2">
            <Link
              href="/account"
              aria-label={`Account: ${user.name}, administrator`}
              className="flex min-h-[44px] items-center gap-2.5 rounded-control rounded-tr-control-cut border border-line bg-card py-1.5 pl-1.5 pr-3 transition-colors duration-150 hover:bg-raised focus-visible:outline-none focus-visible:shadow-focus"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft" aria-hidden="true">
                <UserCircle2 className="h-5 w-5 text-brand-ink" />
              </span>
              <span className="hidden min-w-0 leading-tight sm:block">
                <span className="block max-w-[12rem] truncate text-sm font-bold text-charcoal">{user.name}</span>
                <span className="block text-micro font-semibold text-muted">Admin</span>
              </span>
            </Link>
            <button
              type="button"
              onClick={() => signOut()}
              className="flex min-h-[44px] items-center gap-2 rounded-control px-3 text-sm font-semibold text-muted transition-colors duration-150 hover:bg-danger-soft hover:text-danger focus-visible:outline-none focus-visible:shadow-focus"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span>Log out</span>
            </button>
          </div>
        </header>

        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[88rem] flex-1 px-4 py-6 focus:outline-none sm:px-6 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
