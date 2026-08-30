import type { ReactNode } from "react";

export function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <p className="sr-only">Loading…</p>
      <div className="h-6 w-1/3 animate-pulse rounded bg-slate-200" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded bg-slate-200" />
      ))}
    </div>
  );
}

export function FullPageSpinner() {
  return (
    <div className="flex items-center justify-center py-20" role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
    </div>
  );
}

export function EmptyState({ title, message }: { title: string; message?: string }) {
  return (
    <div className="card flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="text-3xl" aria-hidden="true">
        ◌
      </div>
      <h3 className="mt-3 text-base font-semibold text-slate-800">{title}</h3>
      {message ? <p className="mt-1 text-sm text-slate-500">{message}</p> : null}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="card flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="text-3xl" aria-hidden="true">
        ⚠
      </div>
      <h3 className="mt-3 text-base font-semibold text-slate-800">Unable to load parking data.</h3>
      <p className="mt-1 max-w-md text-sm text-slate-500">{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="btn-secondary mt-4">
          Retry
        </button>
      ) : null}
    </div>
  );
}
