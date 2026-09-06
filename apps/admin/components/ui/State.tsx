import { Loader2, AlertTriangle, RotateCcw, Inbox } from "lucide-react";
import { Card } from "./Card";
import { Button } from "./Button";

export function LoadingState({
  rows = 4,
  label = "Loading…",
}: {
  rows?: number;
  label?: string;
}) {
  return (
    <div aria-busy="true" aria-live="polite" className="card p-5">
      <div className="flex items-center gap-2 text-muted">
        <Loader2 className="h-4 w-4 animate-spin text-brand" aria-hidden="true" />
        <span className="text-sm font-semibold">{label}</span>
      </div>
      <div className="mt-4 space-y-3" role="status" aria-live="polite">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-panel border border-line/30 bg-graygreen/20" />
        ))}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  message,
}: {
  title?: string;
  message?: string;
}) {
  return (
    <Card className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-panel bg-graygreen/25 text-muted" aria-hidden="true">
        <Inbox className="h-6 w-6" />
      </div>
      <h3 className="mt-4 font-display text-lg font-black tracking-tight text-charcoal">
        {title ?? "No records."}
      </h3>
      {message ? <p className="mt-1 max-w-sm text-sm text-muted">{message}</p> : null}
    </Card>
  );
}

export function ErrorState({
  title,
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <Card className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-panel bg-brand-soft" aria-hidden="true">
        <AlertTriangle className="h-6 w-6 text-brand" />
      </div>
      <h3 className="mt-4 font-display text-lg font-black tracking-tight text-charcoal">
        {title ?? "We couldn't load this data."}
      </h3>
      {message ? (
        <p className="mt-1 max-w-md text-sm text-muted">{message}</p>
      ) : (
        <p className="mt-1 max-w-md text-sm text-muted">
          Please try again. If the problem continues, contact the operations team.
        </p>
      )}
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry} className="mt-4">
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Retry
        </Button>
      ) : null}
    </Card>
  );
}

export function FullPageSpinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3">
      <div className="flex h-12 w-12 items-center justify-center rounded-panel bg-brand-soft" aria-hidden="true">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
      </div>
      <p className="label-tech">{label}</p>
    </div>
  );
}