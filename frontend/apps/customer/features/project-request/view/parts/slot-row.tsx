"use client";

import { cn } from "@vsolve/ui";

import { formatVisitSlot, type VisitSlotRow } from "@/features/access/adapters";

/**
 * One purchased visit slot: taken, or still waiting for a professional.
 *
 * ## The empty slot is pending, not failed
 *
 * This is the rule that matters here. A plan of two with one slot filled is the
 * ordinary, expected state for most of the time a customer spends on this
 * screen — the second professional simply has not offered a time yet. Drawing it
 * in a warning colour, or with an alert icon, tells somebody that something has
 * gone wrong when nothing has, and the thing they do next is contact support.
 *
 * So the empty row is neutral: a dashed circle with its slot number, the state
 * in words, and no badge. The money story is on the plan card below it, where
 * the refund rule belongs.
 *
 * ## Names appear only once we are entitled to publish them
 *
 * Disclosure starts at slot confirmation, because somebody entering a home has
 * to be nameable. The visit read publishes no vendor at all, so the only name
 * this app can reach comes from a delivered estimate — a confirmed slot with no
 * estimate yet says the time and not the name, rather than inventing a
 * placeholder.
 */

export interface SlotRowProps {
  row: VisitSlotRow;
  /** Renders the top row without a divider. */
  isFirst: boolean;
}

/** "VI" from "Vaastu Interiors". Two letters, upper case, never more. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

export function SlotRow({ row, isFirst }: SlotRowProps) {
  const time = formatVisitSlot(row.scheduledFor, row.timeZone);
  const isFilled = row.scheduledFor !== null;

  return (
    <li
      className={cn(
        "flex items-center gap-3 p-3.5",
        !isFirst && "border-t border-line",
        isFilled ? "bg-success-surface" : "bg-surface",
      )}
    >
      {isFilled ? (
        <span
          aria-hidden
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy-900 text-[13px] font-bold text-text-inverse"
        >
          {row.vendorName === null ? String(row.position) : initials(row.vendorName)}
        </span>
      ) : (
        <span
          aria-hidden
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-warm-400 text-[13px] font-semibold text-text-muted"
        >
          {row.position}
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate",
            isFilled ? "text-[15px] font-bold text-text" : "text-sm font-semibold text-text-secondary",
          )}
        >
          {isFilled
            ? (row.vendorName ?? "A professional")
            : row.position === 1
              ? "First visit"
              : `Visit ${row.position}`}
        </span>
        <span
          className={cn(
            "mt-0.5 block text-[12.5px] leading-5",
            isFilled ? "text-success-text" : "text-text-muted",
          )}
        >
          {isFilled
            ? (time ?? "Time confirmed")
            : "Waiting for a professional to offer a time"}
        </span>
      </span>

      {isFilled ? (
        <span className="shrink-0 rounded-full bg-success-text px-2 py-0.5 text-[11px] font-bold text-text-inverse">
          Holding
        </span>
      ) : null}
    </li>
  );
}
