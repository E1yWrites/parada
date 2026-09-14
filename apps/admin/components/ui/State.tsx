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
        <Loader2 className="h-4 w-4 animate-spin text-brand" aria-hidden="true" />
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
 * same three-layer construction as the mobile app's illustrations.
 */
function Scene({ Icon, tone = "brand" }: { Icon: LucideIcon; tone?: "brand" | "danger" }) {
  const disc = tone === "danger" ? "bg-danger-soft" : "bg-brand-soft";
  const glyph = tone === "danger" ? "text-danger" : "text-brand";
  return (
    <div className={`relative flex h-24 w-24 items-center justify-center rounded-full ${disc}`} aria-hidden="true">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-card">
        <Icon className={`h-6 w-6 ${glyph}`} />
      </div>
      <span className="absolute -right-1 top-1 h-6 w-6 rounded-lg bg-white shadow-card" />
      <span className="absolute -left-1 bottom-2 h-5 w-5 rounded-lg bg-white shadow-card" />
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
      <h3 className="mt-5 font-display text-lg font-black tracking-tight text-charcoal">
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
      <Scene Icon={AlertTriangle} tone="danger" />
      <h3 className="mt-5 font-display text-lg font-black tracking-tight text-charcoal">
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
    <div className="flex min-h-screen flex-col items-center justify-center gap-3">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-card" aria-hidden="true">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
      </div>
      <p className="text-sm font-semibold text-muted">{label}</p>
    </div>
  );
}
