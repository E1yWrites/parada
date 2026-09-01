"use client";

import { useAuth } from "@/components/providers/auth-provider";
import { PageHeader } from "@/components/PageHeader";
import { Card, SectionHeader } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Badge";
import { formatDate } from "@/lib/format";

export default function AccountPage() {
  const { user, signOut } = useAuth();

  return (
    <div>
      <PageHeader
        eyebrow="Account · Session"
        title="Account Details"
        description="Your operator profile and access level."
      />

      <div className="grid max-w-3xl grid-cols-1 gap-6">
        <Card>
          <SectionHeader eyebrow="Identity" title="Profile" />
          <dl className="divide-y divide-white/5 p-5">
            <Row label="Name" value={user?.name ?? "—"} />
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
          <SectionHeader eyebrow="Tools" title="Session" />
          <div className="p-5">
            <p className="mb-4 text-sm text-muted">
              You are signed in as <span className="text-white">{user?.email ?? "…"}</span>. Signing out ends this
              admin session on the server.
            </p>
            <button type="button" className="btn-secondary" onClick={() => signOut()}>
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
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-right text-sm text-white">{value}</dd>
    </div>
  );
}
