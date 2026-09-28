"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { LoadingState, EmptyState, ErrorState } from "./State";

/**
 * Renders loading / error / empty states based on a React Query result shape.
 */
export function QueryBoundary({
  status,
  error,
  isEmpty,
  emptyTitle,
  emptyMessage,
  emptyIcon,
  onRetry,
  loadingRows = 4,
  children,
}: {
  status: "pending" | "success" | "error";
  error?: unknown;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyMessage?: string;
  /** Icon for the empty state; defaults to an inbox. */
  emptyIcon?: LucideIcon;
  onRetry?: () => void;
  loadingRows?: number;
  children: ReactNode;
}) {
  if (status === "pending") return <LoadingState rows={loadingRows} />;
  if (status === "error") {
    return <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={onRetry} />;
  }
  if (isEmpty) return <EmptyState title={emptyTitle} message={emptyMessage} icon={emptyIcon} />;
  return <>{children}</>;
}
