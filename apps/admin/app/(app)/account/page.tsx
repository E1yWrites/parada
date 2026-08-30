"use client";

import { useAuth } from "@/components/providers/auth-provider";
import { PageHeader } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";

export default function AccountPage() {
  const { user, signOut } = useAuth();

  return (
    <div>
      <PageHeader title="Account" description="Your signed-in administrator profile." />
      <div className="card max-w-md p-6">
        <dl className="space-y-4">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Name</dt>
            <dd className="text-base font-medium text-slate-800">{user?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Email</dt>
            <dd className="text-base font-medium text-slate-800">{user?.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Role</dt>
            <dd className="text-base font-medium text-slate-800">{user?.role ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Status</dt>
            <dd className="text-base font-medium text-slate-800">{user?.status ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Member since</dt>
            <dd className="text-base font-medium text-slate-800">{formatDate(user?.createdAt)}</dd>
          </div>
        </dl>
        <button type="button" onClick={() => signOut()} className="btn-secondary mt-6 w-full">
          Sign out
        </button>
      </div>
    </div>
  );
}
