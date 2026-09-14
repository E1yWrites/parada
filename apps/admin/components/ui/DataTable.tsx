import type { ReactNode } from "react";
import { EmptyState } from "./State";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  headerClassName?: string;
}

/**
 * Dense registry table inside a panel. Header cells stay visible while the
 * body scrolls; wide tables scroll horizontally inside the panel, never the page.
 */
export function DataTable<T>({
  columns,
  rows,
  emptyTitle,
  emptyMessage,
  rowKey,
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  emptyTitle?: string;
  emptyMessage?: string;
  rowKey?: (row: T) => string;
  /** Screen-reader table caption. */
  caption?: string;
}) {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle ?? "No records."} message={emptyMessage} />;
  }

  return (
    <div className="card overflow-x-auto">
      <table className="table-base">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.headerClassName}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey ? rowKey(row) : i}>
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
