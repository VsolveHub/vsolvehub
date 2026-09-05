"use client";

import { cn } from "@vsolve/ui";
import Link from "next/link";

import { stageHref } from "@/lib/routes";
import type { StageView } from "../adapters";

/**
 * The A3 days as chips — one per shift-day, each linking to that day's controls.
 *
 * The state on each chip is decided once in the adapter from the engagement's
 * own `shift_summary` (contract 1.49.0), so this row and the Partner app's read
 * the same day the same way. A stage without a summary — an older record — shows
 * its date and nothing else rather than a state this screen guessed.
 */
export function DayChips({
  engagementId,
  days,
  className,
}: {
  engagementId: string;
  days: readonly StageView[];
  className?: string;
}) {
  if (days.length === 0) return null;

  return (
    <ol className={cn("flex list-none gap-2 overflow-x-auto p-0 pb-1", className)}>
      {days.map((day) => (
        <li key={day.stageId} className="shrink-0">
          <DayChip engagementId={engagementId} day={day} />
        </li>
      ))}
    </ol>
  );
}

export function DayChip({ engagementId, day }: { engagementId: string; day: StageView }) {
  const chip = day.shiftSummary?.chip ?? null;
  const state = chip?.state ?? null;

  return (
    <Link
      href={stageHref(engagementId, day.stageId)}
      className={cn(
        "flex min-h-14 min-w-[8.5rem] flex-col justify-center rounded-card border px-3 py-2 transition-colors duration-fast hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
        state === "paid" ? "border-success-line bg-success-surface" : null,
        state === "disputed" ? "border-danger-line bg-danger-surface" : null,
        chip?.needsYou ? "border-warning-line bg-warning-surface" : null,
        state === null || (!chip?.needsYou && state !== "paid" && state !== "disputed")
          ? "border-line bg-surface"
          : null,
      )}
    >
      <span className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-text-muted">
        {day.label}
      </span>
      <span className="text-sm font-bold text-text">{day.scheduledOn ?? "Date to be confirmed"}</span>
      {chip !== null ? (
        <span
          className={cn(
            "mt-0.5 text-xs font-semibold",
            state === "paid" ? "text-success-text" : null,
            state === "disputed" ? "text-danger-text" : null,
            chip.needsYou ? "text-warning-text" : null,
            !chip.needsYou && state !== "paid" && state !== "disputed" ? "text-text-secondary" : null,
          )}
        >
          {chip.label}
        </span>
      ) : (
        <span className="mt-0.5 text-xs font-semibold text-text-secondary">{day.amountLabel}</span>
      )}
    </Link>
  );
}
