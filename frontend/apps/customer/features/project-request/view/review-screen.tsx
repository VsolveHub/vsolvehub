"use client";

import { Disclosure } from "@vsolve/ui";
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

      <div className="overflow-hidden rounded-[14px] border border-line bg-surface">
        {rows.map((row, index) => (
          <div
            key={row.label}
            className={`flex items-start justify-between gap-3 px-3.5 py-3 ${
              index > 0 ? "border-t border-line" : ""
            }`}
          >
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
                {row.label}
              </p>
              <p className="mt-1 text-sm font-semibold text-text">
                {row.value ?? <span className="font-normal text-text-muted">Nothing yet</span>}
              </p>
            </div>
            <button
              type="button"
              onClick={row.onEdit}
              className="inline-flex h-11 shrink-0 items-center rounded-control px-2 text-[13px] font-semibold text-text-link hover:bg-surface-hover"
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

      <Disclosure summary="Callback, site access, language" hint="Optional">
        <p>
          Tell us if you would rather we called, if the site needs notice to get
          into, or which language you would like the professional to speak. You
          can add any of it after sending — none of it holds up the request.
        </p>
      </Disclosure>
    </>
  );
}
