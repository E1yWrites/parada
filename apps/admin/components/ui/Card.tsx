import type { HTMLAttributes, ReactNode } from "react";

/** Bounded white panel: the registry surface every record lives in. */
export function Card({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`card ${className}`} {...rest} />;
}

export type CardSectionProps = HTMLAttributes<HTMLDivElement> & {
  /** Short description under the title; never a label above it. */
  description?: ReactNode;
  title?: ReactNode;
  actions?: ReactNode;
};

/** Panel header: title, optional description, actions; closed by a seam. */
export function SectionHeader({ description, title, actions, className = "", ...rest }: CardSectionProps) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 ${className}`}
      {...rest}
    >
      <div className="min-w-0">
        {title ? <h2 className="font-display text-base font-black tracking-tight text-charcoal">{title}</h2> : null}
        {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Inline "saved" confirmation that sits beside a form's primary action and fades on its own. */
export function SavedNote({ children = "Saved." }: { children?: ReactNode }) {
  return (
    <span role="status" className="inline-flex items-center gap-1.5 text-sm font-semibold text-success animate-saved-fade">
      <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 10.5 8 14.5 16 6" />
      </svg>
      {children}
    </span>
  );
}
