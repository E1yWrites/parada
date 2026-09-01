import type { HTMLAttributes, ReactNode } from "react";

export function Card({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`card ${className}`} {...rest} />;
}

export type CardSectionProps = HTMLAttributes<HTMLDivElement> & {
  eyebrow?: ReactNode;
  title?: ReactNode;
  actions?: ReactNode;
};

export function SectionHeader({ eyebrow, title, actions, className = "", ...rest }: CardSectionProps) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 ${className}`}
      {...rest}
    >
      <div>
        {eyebrow ? <p className="label-tech mb-0.5">{eyebrow}</p> : null}
        {title ? <h2 className="font-display text-sm font-semibold text-white">{title}</h2> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
