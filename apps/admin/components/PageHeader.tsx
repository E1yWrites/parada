import type { ReactNode } from "react";

/**
 * Page title row, on its own panel so it reads against the fog ground. The
 * heading carries its own weight; the description is a sentence under it, and
 * the primary action (if any) sits on the right.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="card mb-5 flex flex-wrap items-end justify-between gap-4 px-5 py-4 sm:px-6 sm:py-5">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold leading-tight tracking-[-0.02em] text-charcoal [overflow-wrap:anywhere] text-balance">
          {title}
        </h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm text-muted [overflow-wrap:anywhere]">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </div>
  );
}
