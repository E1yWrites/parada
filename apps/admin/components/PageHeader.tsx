import type { ReactNode } from "react";

/**
 * Page title row. The heading carries its own weight; the description is a
 * sentence under it, and the primary action (if any) sits on the right.
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
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-[1.75rem] font-black leading-tight tracking-[-0.02em] text-charcoal sm:text-3xl">
          {title}
        </h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </div>
  );
}
