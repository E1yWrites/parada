import type { ReactNode } from "react";
import { Loader2, AlertTriangle, RotateCcw } from "lucide-react";
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
    <div aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-2 text-muted">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        <span className="text-sm">{label}</span>
      </div>
      <div className="mt-4 space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="h-12 animate-pulse rounded-lg border border-white/5 bg-white/[0.02]"
          />
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
      <div className="font-mono text-3xl text-muted/40" aria-hidden="true">
        ∅
      </div>
      <h3 className="mt-3 font-display text-base font-semibold text-white">
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
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-400/10">
        <AlertTriangle className="h-5 w-5 text-rose-400" aria-hidden="true" />
      </div>
      <h3 className="mt-3 font-display text-base font-semibold text-white">
        {title ?? "Something went wrong."}
      </h3>
      {message ? <p className="mt-1 max-w-md text-sm text-muted">{message}</p> : null}
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
      <Loader2 className="h-6 w-6 animate-spin text-orange" aria-hidden="true" />
      <p className="label-tech">{label}</p>
    </div>
  );
}

export type RenderFn<T> = (data: T) => ReactNode;

export function Bound<T>({
  loading,
  error,
  isEmpty,
  emptyTitle,
  emptyMessage,
  onRetry,
  children,
}: {
  loading: boolean;
  error: unknown;
  isEmpty: boolean;
  emptyTitle?: string;
  emptyMessage?: string;
  onRetry?: () => void;
  children: ReactNode;
}) {
  if (loading) return <LoadingState />;
  if (error) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : undefined}
        onRetry={onRetry}
      />
    );
  }
  if (isEmpty) return <EmptyState title={emptyTitle} message={emptyMessage} />;
  return <>{children}</>;
}
