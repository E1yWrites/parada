"use client";

import type { ReactNode } from "react";
import { LoadingState, EmptyState, ErrorState } from "./State";

type MascotVariant = Parameters<typeof EmptyState>[0]["mascot"];

/**
 * Renders loading / error / empty states based on a React Query result shape.
 */
export function QueryBoundary({
  status,
  error,
  isEmpty,
  emptyTitle,
  emptyMessage,
  emptyMascot,
  onRetry,
  loadingRows = 4,
  children,
}: {
  status: "pending" | "success" | "error";
  error?: unknown;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyMessage?: string;
  /** Render the canonical mascot in the empty state, for contexts it genuinely fits. */
  emptyMascot?: MascotVariant;
  onRetry?: () => void;
  loadingRows?: number;
  children: ReactNode;
}) {
  if (status === "pending") return <LoadingState rows={loadingRows} />;
  if (status === "error") {
    return <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={onRetry} />;
  }
  if (isEmpty) return <EmptyState title={emptyTitle} message={emptyMessage} mascot={emptyMascot} />;
  return <>{children}</>;
}
