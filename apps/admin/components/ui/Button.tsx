import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({
  variant = "secondary",
  className = "",
  type = "button",
  ...rest
}: ButtonProps) {
  return <button type={type} className={`${VARIANTS[variant]} ${className}`} {...rest} />;
}
