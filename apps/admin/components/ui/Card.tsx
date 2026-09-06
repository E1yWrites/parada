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
      className={`flex flex-wrap items-center justify-between gap-3 border-b border-line/50 px-5 py-4 ${className}`}
      {...rest}
    >
      <div>
        {eyebrow ? <p className="label-tech mb-1">{eyebrow}</p> : null}
        {title ? <h2 className="font-display text-lg font-black tracking-tight text-charcoal">{title}</h2> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}