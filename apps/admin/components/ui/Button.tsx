import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "success" | "danger";
type Size = "md" | "sm";

const VARIANTS: Record<Variant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  success: "btn-success",
  danger: "btn-danger",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** `primary` is the one filled action in a form; everything else is quiet. */
  variant?: Variant;
  /** `sm` for row actions inside tables and list items. */
  size?: Size;
  /** A request is in flight: the button is disabled and announced as busy. */
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", className = "", type = "button", loading = false, disabled, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`${VARIANTS[variant]} ${size === "sm" ? "btn-sm" : ""} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    />
  );
});
