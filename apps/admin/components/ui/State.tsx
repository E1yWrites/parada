import { Loader2, AlertTriangle, RotateCcw, Inbox, type LucideIcon } from "lucide-react";
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
        <Loader2 className="h-4 w-4 animate-spin text-muted" aria-hidden="true" />
        <span className="text-sm font-semibold">{label}</span>
      </div>
      <div className="mt-4 space-y-2.5" role="status">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-9 w-9 shrink-0 animate-pulse rounded-control bg-raised" />
            <div className="h-3.5 animate-pulse rounded-full bg-raised" style={{ width: `${62 - (i % 3) * 12}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Empty scene: a tinted disc with a raised icon badge, then the message. The
 * badge settles onto the disc once when the state appears.
 */
function Scene({ Icon, tone = "brand" }: { Icon: LucideIcon; tone?: "brand" | "danger" }) {
  const disc = tone === "danger" ? "bg-danger-soft" : "bg-raised";
  const glyph = tone === "danger" ? "text-danger" : "text-muted";
  return (
    <div className={`flex h-24 w-24 items-center justify-center rounded-full animate-fade-in ${disc}`} aria-hidden="true">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-card shadow-card animate-settle-in">
        <Icon className={`h-6 w-6 ${glyph}`} />
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  message,
  icon,
}: {
  title?: string;
  message?: string;
  icon?: LucideIcon;
}) {
  return (
    <Card className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <Scene Icon={icon ?? Inbox} />
      <h3 className="mt-5 font-display text-lg font-semibold tracking-tight text-charcoal">
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
    <Card role="alert" className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <Scene Icon={AlertTriangle} tone="danger" />
      <h3 className="mt-5 font-display text-lg font-semibold tracking-tight text-charcoal">
        {title ?? "We couldn't load this data."}
      </h3>
      <p className="mt-1 max-w-md text-sm text-muted">
        {message ?? "Please try again. If the problem continues, contact the operations team."}
      </p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry} className="mt-5">
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Retry
        </Button>
      ) : null}
    </Card>
  );
}

export function FullPageSpinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div role="status" className="card flex items-center gap-3 px-5 py-4 animate-fade-in">
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted" aria-hidden="true" />
        <p className="text-sm font-semibold text-muted">{label}</p>
      </div>
    </div>
  );
}
