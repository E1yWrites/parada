"use client";

import { useAuth } from "@/components/providers/auth-provider";
import { avatarSrc } from "@/lib/api/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, SectionHeader } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Badge";
import { formatDate } from "@/lib/format";

export default function AccountPage() {
  const { user, signOut } = useAuth();

  return (
    <div>
      <PageHeader title="Account" description="Your operator profile and this console session." />

      <div className="grid max-w-3xl grid-cols-1 gap-5">
        <Card>
          <SectionHeader title="Profile" />
          {avatarSrc(user) ? (
            <div className="px-5 pt-5">
              {/* eslint-disable-next-line @next/next/no-img-element -- authenticated proxy URL */}
              <img src={avatarSrc(user) ?? undefined} alt="" className="h-16 w-16 rounded-control object-cover" data-testid="account-avatar" />
            </div>
          ) : null}
          <dl className="divide-y divide-line px-5">
            <Row label="Name" value={user?.name ?? "—"} />
            <Row label="Username" value={user?.username ? `@${user.username}` : "—"} />
            <Row label="Phone" value={user?.phone ?? "—"} />
            <Row label="Email" value={user?.email ?? "—"} />
            <Row
              label="Role"
              value={
                user?.role === "ADMIN" ? (
                  <Pill tone="info">Administrator</Pill>
                ) : (
                  <Pill tone="neutral">User</Pill>
                )
              }
            />
            <Row label="Joined" value={user ? formatDate(user.createdAt) : "—"} />
          </dl>
        </Card>

        <Card>
          <SectionHeader title="Session" description="Signing out ends this admin session on the server." />
          <div className="flex flex-wrap items-center justify-between gap-4 p-5">
            <p className="text-sm text-muted">
              Signed in as <span className="font-bold text-charcoal">{user?.email ?? "…"}</span>
            </p>
            <button type="button" className="btn-danger" onClick={() => signOut()}>
              Sign out
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-right text-sm font-semibold text-charcoal">{value}</dd>
    </div>
  );
}