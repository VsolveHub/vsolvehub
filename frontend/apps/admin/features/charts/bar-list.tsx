import Link from "next/link";

import { CHART_COLORS } from "./theme";

export interface BarListRow {
  key: string;
  label: string;
  value: number;
  /** Printed value; defaults to the number in en-IN. */
  display?: string;
  /** A second figure beside the value, e.g. "12 bookings". */
  detail?: string;
  href?: string | null;
}

interface BarListProps {
  rows: readonly BarListRow[];
  /** Largest first, which is how a breakdown is read. Off for an ordered pipeline. */
  sort?: boolean;
  emptyText?: string;
  /** Thin bars under each label, for a narrow side panel. */
  compact?: boolean;
}

/**
 * Ranked horizontal bars drawn in HTML.
 *
 * Every label and value is printed text, so the bars never need a hover to be
 * read and long category names wrap instead of colliding on an axis.
 */
export function BarList({ rows, sort = true, emptyText = "Nothing to show yet.", compact = false }: BarListProps) {
  const ordered = sort ? [...rows].sort((a, b) => b.value - a.value) : rows;
  const largest = Math.max(0, ...ordered.map((row) => row.value));

  if (ordered.length === 0 || largest === 0) {
    return <p className="text-sm text-text-secondary">{emptyText}</p>;
  }

  return (
    <ul className={compact ? "space-y-2.5" : "space-y-3"}>
      {ordered.map((row) => {
        const width = largest > 0 ? Math.max((row.value / largest) * 100, row.value > 0 ? 2 : 0) : 0;
        const label = row.href ? (
          <Link href={row.href} className="font-medium text-text-link hover:underline">
            {row.label}
          </Link>
        ) : (
          <span className="font-medium text-text">{row.label}</span>
        );
        return (
          <li key={row.key} className="text-sm">
            <div className="flex items-baseline justify-between gap-3">
              {label}
              <span className="shrink-0 text-right">
                <span className="font-semibold text-text">
                  {row.display ?? row.value.toLocaleString("en-IN")}
                </span>
                {row.detail ? (
                  <span className="ml-2 text-xs text-text-secondary">{row.detail}</span>
                ) : null}
              </span>
            </div>
            <div
              aria-hidden
              className={`mt-1.5 w-full overflow-hidden rounded-full bg-surface-sunken ${compact ? "h-1.5" : "h-2.5"}`}
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${width}%`, backgroundColor: CHART_COLORS.primary }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
