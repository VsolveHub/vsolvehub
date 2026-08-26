"use client";

import { type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table";
import { Skeleton } from "./skeleton";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";

export interface Column<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** If true, aligns the column content to the right and uses tabular-nums */
  numeric?: boolean;
  /** Controls when the column hides based on viewport priority */
  hideOn?: "sm" | "md" | "lg";
  /** If true, the column can be sorted */
  sortable?: boolean;
}

export interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (row: T) => string;
  
  /** Loading state */
  isLoading?: boolean;
  /** Error state */
  isError?: boolean;
  /** Refetch callback for error state */
  onRetry?: () => void;
  /** Empty state message */
  emptyMessage?: string;
  
  /** Sorting state */
  sortColumn?: string;
  sortDirection?: "asc" | "desc" | null;
  onSort?: (columnId: string) => void;
  
  /** Selection state */
  selectedId?: string;
  onRowClick?: (row: T) => void;

  /** Accessible name for the table */
  caption?: string;
}

/**
 * A highly capable data table primitive.
 * Includes: sticky header, sticky first column, scroll containment,
 * responsive column hiding, sortable headers, right-aligned numeric columns,
 * row selection states, and built-in loading/empty/error slots.
 */
export function DataTable<T>({
  data,
  columns,
  keyExtractor,
  isLoading,
  isError,
  onRetry,
  emptyMessage = "No results found.",
  sortColumn,
  sortDirection,
  onSort,
  selectedId,
  onRowClick,
  caption = "Data table",
}: DataTableProps<T>) {
  if (isError) {
    return (
      <div className="p-6">
        <ErrorState
          layout="inline"
          title="Could not load data"
          message="There was an error loading the table contents."
          actionLabel={onRetry ? "Try again" : undefined}
          onAction={onRetry}
        />
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto overscroll-contain bg-surface rounded-card border border-line shadow-card">
      <Table className="w-full border-collapse">
        <caption className="sr-only">{caption}</caption>
        <TableHeader className="bg-surface-sunken/60 sticky top-0 z-20 shadow-[0_1px_0_var(--line)]">
          <TableRow className="border-none">
            {columns.map((col, idx) => {
              const isSticky = idx === 0;
              const hiddenClass = col.hideOn ? `hidden ${col.hideOn}:table-cell` : "";
              const alignClass = col.numeric ? "text-right" : "text-left";
              const isSorted = sortColumn === col.id;
              
              return (
                <TableHead
                  key={col.id}
                  scope="col"
                  aria-sort={isSorted ? (sortDirection === "asc" ? "ascending" : "descending") : col.sortable ? "none" : undefined}
                  className={`
                    ${hiddenClass} ${alignClass} py-3 px-3 uppercase tracking-wider text-[11px] font-bold text-text-secondary whitespace-nowrap bg-surface-sunken/60
                    ${isSticky ? "sticky left-0 z-30 shadow-[1px_0_0_var(--line)]" : ""}
                    ${col.sortable ? "cursor-pointer select-none hover:text-text group" : ""}
                  `}
                  onClick={() => col.sortable && onSort?.(col.id)}
                >
                  <div className={`flex items-center gap-1 ${col.numeric ? "justify-end" : "justify-start"}`}>
                    {col.header}
                    {col.sortable && (
                      <span className="shrink-0 text-text-muted group-hover:text-text-secondary transition-colors">
                        {isSorted ? (
                          sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                        )}
                      </span>
                    )}
                  </div>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>

        <TableBody className="divide-y divide-line bg-surface">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={`skeleton-${i}`}>
                {columns.map((col, idx) => (
                  <TableCell
                    key={`skeleton-${i}-${col.id}`}
                    className={`
                      ${col.hideOn ? `hidden ${col.hideOn}:table-cell` : ""}
                      ${idx === 0 ? "sticky left-0 z-10 bg-surface shadow-[1px_0_0_var(--line)]" : ""}
                    `}
                  >
                    <Skeleton className="h-4 w-3/4" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-32 text-center p-0">
                <EmptyState
                  layout="compact"
                  title="No data"
                  description={emptyMessage}
                />
              </TableCell>
            </TableRow>
          ) : (
            data.map((row) => {
              const rowId = keyExtractor(row);
              const isSelected = selectedId === rowId;
              
              return (
                <TableRow
                  key={rowId}
                  onClick={() => onRowClick?.(row)}
                  aria-selected={isSelected ? "true" : undefined}
                  className={`
                    transition-colors group
                    ${onRowClick ? "cursor-pointer" : ""}
                    ${isSelected ? "bg-selected-surface" : "hover:bg-surface-hover/50"}
                  `}
                >
                  {columns.map((col, idx) => {
                    const isSticky = idx === 0;
                    const hiddenClass = col.hideOn ? `hidden ${col.hideOn}:table-cell` : "";
                    const alignClass = col.numeric ? "text-right font-variant-numeric tabular-nums" : "text-left";
                    
                    return (
                      <TableCell
                        key={`${rowId}-${col.id}`}
                        className={`
                          ${hiddenClass} ${alignClass} py-2.5 px-3 text-sm
                          ${isSticky ? `sticky left-0 z-10 shadow-[1px_0_0_var(--line)] ${isSelected ? 'bg-selected-surface' : 'bg-surface group-hover:bg-surface-hover/50'}` : ""}
                        `}
                      >
                        {col.cell(row)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
