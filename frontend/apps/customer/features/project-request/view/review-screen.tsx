"use client";

import type { ReactNode } from "react";

import type { PlanTierView } from "@/features/access/adapters";
import { VisitPlanChooser } from "./parts/visit-plan-chooser";

/**
 * A5 · 4 — Check and send.
 *
 * ## Review is the confirmation
 *
 * There is no "are you sure?" after this. The earlier design had the customer
 * approve an immutable version *after* reviewing it, which is the same act
 * twice: the second screen asks about a page whose entire job was to let them be
 * sure.
 *
 * ## The two payments never appear as one number
 *
 * The footer names the **visit fee** and nothing else. Stage payments — the
 * project itself, funded stage by stage and held until each stage is approved —
 * are a different transaction with a different trigger, and the estimate screen
 * is where they are first named. A total combining them would describe a price
 * nobody has quoted yet, because no vendor has seen the site.
 */

export interface ReviewSummaryRow {
  /** The uppercase eyebrow: "Work", "Where and when", "Attached". */
  label: string;
  /** The one-line recap. Absent when nothing was answered. */
  value: string | null;
  /** Returns to the step that owns it. */
  onEdit: () => void;
}

export interface ReviewScreenProps {
  rows: readonly ReviewSummaryRow[];
  tiers: readonly PlanTierView[];
  planSize: number | null;
  onPlanSize: (planSize: number) => void;
  isLoadingTiers?: boolean;
  /** Refusals, rendered above the summary by the caller. */
  notice?: ReactNode;
}

export function ReviewScreen({
  rows,
  tiers,
  planSize,
  onPlanSize,
  isLoadingTiers = false,
  notice,
}: ReviewScreenProps) {
  return (
    <>
      {notice}

      <section className="overflow-hidden rounded-card bg-navy-900 px-4 py-4 text-white">
        <div className="flex items-center gap-2 text-xs font-bold text-navy-100">
          <span className="size-2 rounded-full bg-success-text" aria-hidden />
          Brief ready
        </div>
        <h2 className="mt-1.5 text-xl font-extrabold leading-tight">Ready to find your team</h2>
        <MobileReviewRoute />
      </section>

      <div className="overflow-hidden rounded-card border border-line bg-surface">
        {rows.map((row, index) => (
          <div
            key={row.label}
            className={`flex items-start justify-between gap-3 px-3.5 py-3 ${
              index > 0 ? "border-t border-line" : ""
            }`}
          >
            <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-action-surface text-action-active">
              <SummaryIcon index={index} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase text-text-muted">{row.label}</p>
              <p className="mt-1 text-sm font-extrabold text-text">
                {row.value ?? <span className="font-medium text-text-muted">Nothing yet</span>}
              </p>
            </div>
            <button
              type="button"
              onClick={row.onEdit}
              className="inline-flex h-11 shrink-0 cursor-pointer items-center rounded-control px-2 text-sm font-bold text-text-link transition-colors duration-fast hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring"
            >
              Edit
              <span className="sr-only">{` ${row.label.toLowerCase()}`}</span>
            </button>
          </div>
        ))}
      </div>

      <VisitPlanChooser
        tiers={tiers}
        value={planSize}
        onChange={onPlanSize}
        isLoading={isLoadingTiers}
      />

      <details className="group overflow-hidden rounded-card border border-line bg-surface">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-bold text-text [&::-webkit-details-marker]:hidden">
          Callback, access and language
          <span className="ml-auto text-xs font-semibold text-text-muted">Optional</span>
          <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4 text-text-muted transition-transform duration-fast group-open:rotate-180"><path d="m6 9 6 6 6-6" /></svg>
        </summary>
        <p className="border-t border-line bg-canvas px-4 py-3 text-sm leading-6 text-text-secondary">
          These preferences can be added after sending and never hold up the request.
        </p>
      </details>
    </>
  );
}

function MobileReviewRoute() {
  return (
    <ol className="mt-4 grid grid-cols-3" aria-label="What happens after sending">
      {["Brief", "Visits", "Quotes"].map((label, index) => (
        <li key={label} className="relative flex flex-col items-center px-1 text-center before:absolute before:left-0 before:right-0 before:top-3 before:h-px before:bg-navy-600 first:before:left-1/2 last:before:right-1/2">
          <span aria-hidden className={`relative z-10 grid size-6 place-items-center rounded-full ring-4 ring-navy-900 ${index === 0 ? "bg-white text-navy-900" : "bg-navy-700 text-navy-100"}`}>
            {index === 0 ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
                <path d="m5 12 4 4 10-10" />
              </svg>
            ) : (
              index + 1
            )}
          </span>
          <span className="mt-2 text-xs font-bold text-white">{label}</span>
        </li>
      ))}
    </ol>
  );
}

function SummaryIcon({ index }: { index: number }) {
  const path = [
    "M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7m-9 0h10a2 2 0 0 1 2 2v8H5V9a2 2 0 0 1 2-2Z",
    "M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Zm-8 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
    "m9 12 5-5a3 3 0 0 1 4 4l-7 7a5 5 0 0 1-7-7l7-7",
  ][index] ?? "M5 5h14v14H5V5Z";

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="size-4">
      <path d={path} />
    </svg>
  );
}
