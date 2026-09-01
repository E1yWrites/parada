import type { ReactNode } from "react";
import { Card } from "./Card";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  headerClassName?: string;
}

export function DataTable<T>({
  columns,
  rows,
  emptyTitle,
  emptyMessage,
}: {
  columns: Column<T>[];
  rows: T[];
  emptyTitle?: string;
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center px-6 py-14 text-center">
        <div className="font-mono text-2xl text-muted/40" aria-hidden="true">
          ∅
        </div>
        <h3 className="mt-3 font-display text-base font-semibold text-white">{emptyTitle ?? "No records."}</h3>
        {emptyMessage ? <p className="mt-1 max-w-sm text-sm text-muted">{emptyMessage}</p> : null}
      </Card>
    );
  }

  return (
    <div className="card overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.headerClassName}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.key} className={c.className}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
