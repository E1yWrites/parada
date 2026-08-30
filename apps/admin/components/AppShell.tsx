"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./providers/auth-provider";
import { FullPageSpinner } from "./ui/State";

const NAV = [
  { href: "/", label: "Dashboard", icon: "▦" },
  { href: "/zones", label: "Zones", icon: "◫" },
  { href: "/cameras", label: "Cameras", icon: "⊡" },
  { href: "/sessions", label: "Sessions", icon: "▤" },
  { href: "/users", label: "Users", icon: "◉" },
  { href: "/notifications", label: "Notifications", icon: "◔" },
  { href: "/anomalies", label: "Anomalies", icon: "⚠" },
  { href: "/history", label: "History", icon: "⇅" },
  { href: "/simulator", label: "Simulator", icon: "▶" },
  { href: "/account", label: "Account", icon: "○" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, loading } = useAuth();

  if (loading) {
    return <FullPageSpinner />;
  }

  if (!user || user.role !== "ADMIN") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="card max-w-sm p-6 text-center">
          <h1 className="text-lg font-semibold text-slate-800">Admin access required</h1>
          <p className="mt-2 text-sm text-slate-600">
            This application is restricted to administrator accounts. If you are not an
            administrator, please sign in with an admin account.
          </p>
          <Link href="/login" className="btn-primary mt-4">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-slate-200 bg-white lg:min-h-screen lg:w-56 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-4">
          <span className="text-lg font-black text-brand-700">PARADA</span>
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Admin</span>
        </div>
        <nav aria-label="Main navigation" className="flex overflow-x-auto lg:flex-col lg:overflow-visible">
          {NAV.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2 whitespace-nowrap px-4 py-2.5 text-sm font-medium ${
                  active
                    ? "border-brand-600 bg-brand-50 text-brand-700 lg:border-l-4"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <span aria-hidden="true" className="w-4 text-center">
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="flex-1 p-4 lg:p-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
