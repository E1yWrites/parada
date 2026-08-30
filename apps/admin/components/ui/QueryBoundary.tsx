"use client";

import type { ReactNode } from "react";
import { ApiError } from "@/lib/api/client";
import { Loading, EmptyState, ErrorState } from "./State";

export function QueryBoundary({
  status,
  error,
  isEmpty,
  emptyTitle,
  emptyMessage,
  children,
  loadingRows = 3,
}: {
  status: "pending" | "error" | "success" | "idle";
  error: unknown;
  isEmpty?: boolean;
  emptyTitle: string;
  emptyMessage?: string;
  children: ReactNode;
  loadingRows?: number;
}) {
  if (status === "pending") {
    return <Loading rows={loadingRows} />;
  }
  if (status === "error") {
    return (
      <ErrorState
        message={error instanceof ApiError ? error.message : "An unexpected error occurred."}
      />
    );
  }
  if (isEmpty) {
    return <EmptyState title={emptyTitle} message={emptyMessage} />;
  }
  return <>{children}</>;
}
