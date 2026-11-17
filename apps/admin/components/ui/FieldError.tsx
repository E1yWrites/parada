import { AlertCircle } from "lucide-react";

/**
 * The message under one input. Pair it with `invalidProps(id, message)` on
 * that input so the field is outlined and its accessible description is the
 * error, then move focus to it.
 */
export function FieldError({ id, message }: { id: string; message?: string | null }) {
  if (!message) return null;
  return (
    <p id={`${id}-error`} role="alert" className="field-error">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {message}
    </p>
  );
}

export function invalidProps(id: string, message?: string | null) {
  return message ? { "aria-invalid": true as const, "aria-describedby": `${id}-error` } : {};
}

/** Focus the input a rejection points at, so keyboard and screen-reader users land on it. */
export function focusField(id: string | null | undefined) {
  if (id) document.getElementById(id)?.focus();
}
