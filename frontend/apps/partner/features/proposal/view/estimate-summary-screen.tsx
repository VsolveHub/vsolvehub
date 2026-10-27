"use client";

import type { ReactNode } from "react";

import { Button, StepDock, useT } from "@vsolve/ui";

import { Pictogram } from "@/components/pictogram";

import type { EstimateView } from "../model/estimate-view";
import { BackGlyph, FocusedHeader, HeaderTile } from "./parts/focused-header";

/**
 * What the estimate comes to, and what actually lands in the partner's account.
 *
 * ## Every figure here is server-derived and read-only
 *
 * The reference JPEGs this milestone replaces put two editable fields on this
 * screen: a "profit %" and a "platform fee". Neither exists here, and their
 * absence is the product decision the screen is built around.
 *
 *   - There is no profit percentage, because the partner's margin is already
 *     inside the rates they typed on the composer. A second percentage on top
 *     would either double-count the margin or invite a partner to discover that
 *     the number they quoted was not the number they meant.
 *   - There is no editable platform fee, because a commission a partner can type
 *     over is not a commission. It is policy, the server computes it, and this
 *     screen reports it.
 *
 * So this file renders text, never inputs. If a future revision needs a control
 * on this screen, it belongs to the lines above it — not to the tax row, not to
 * the commission row, and not to anything derived from them.
 *
 * ## Why the totals are strings
 *
 * `EstimateTotalsView` arrives pre-formatted (see the note on that type). This
 * component does no arithmetic at all — it cannot even add the two lines it
 * shows above the divider, which is deliberate: a client that can compute a
 * total is a client that will one day disagree with the invoice.
 *
 * Presentational. Props in, JSX out; it fetches nothing and holds no state.
 */

export interface EstimateSummaryScreenProps {
  readonly estimate: EstimateView;
}

export function EstimateSummaryScreen({ estimate }: EstimateSummaryScreenProps) {
  const { totals } = estimate;
  const t = useT();

  return (
    <div className="flex h-full flex-col bg-canvas">
      <FocusedHeader
        title={t("proposal.screens.summary.title")}
        backSlot={
          <HeaderTile>
            <BackGlyph label={t("common.back")} />
          </HeaderTile>
        }
      />

      <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        {/* The money card. Not `Card`: that primitive hard-codes `p-6`, and `cn`
            is clsx rather than tailwind-merge, so a caller's smaller padding
            joins the class list instead of replacing it and loses the cascade to
            the larger utility. The artboard's 14px inset therefore has to be
            written directly. Same border, surface, radius and shadow tokens. */}
        <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          <div className="flex flex-col gap-2.5 p-3.5">
            <SummaryRow label={t("proposal.screens.shared.itemWiseTotal")} amount={totals.linesTotal} />
            <SummaryRow label={t("proposal.screens.shared.otherCharges")} amount={totals.chargesTotal} />

            <div aria-hidden className="h-px bg-line" />

            <SummaryRow label={t("proposal.screens.summary.taxableValue")} amount={totals.taxableValue} emphasis />

            {/* The padlock is the whole argument of this screen in one glyph:
                the rate and the basis are policy, so the row reports rather
                than invites. */}
            <SummaryRow
              label={
                <>
                  <Pictogram name="held" size="xs" className="shrink-0 text-text-muted" />
                  {totals.taxLabel}
                </>
              }
              amount={totals.taxAmount}
            />
          </div>

          <div className="flex items-center justify-between gap-3 bg-action-secondary p-3.5">
            <span className="text-[13px] font-extrabold uppercase tracking-[0.06em] text-navy-200">
              {t("proposal.screens.shared.customerPays")}
            </span>
            <span className="text-[1.625rem] font-extrabold leading-none tracking-[-0.025em] tabular-nums text-surface">
              {totals.customerTotal}
            </span>
          </div>
        </section>

        {/* Rendered by the server in en-IN words. The document a customer keeps
            carries the amount twice, and the two must never be produced by two
            different pieces of code. */}
        <p className="text-xs leading-[17px] text-text-muted">
          {t("proposal.screens.summary.inWords")}{" "}
          <span className="font-semibold text-text-link">{totals.customerTotalInWords}</span>
        </p>

        <section className="rounded-card border border-success-line bg-success-surface p-3.5">
          <div className="flex items-center justify-between gap-3 text-[13.5px]">
            <span className="min-w-0 text-success-text">{totals.commissionLabel}</span>
            <span className="shrink-0 font-bold tabular-nums text-success-text">
              {totals.commissionAmount}
            </span>
          </div>

          <div aria-hidden className="my-2.5 h-px bg-success-line" />

          <p className="text-xs font-bold uppercase tracking-[0.06em] text-success-text">
            {t("proposal.screens.summary.youReceive")}
          </p>
          <p className="mt-1 text-[1.875rem] font-extrabold leading-none tracking-[-0.025em] tabular-nums text-success-text">
            {totals.partnerReceives}
          </p>
        </section>

        <div className="flex gap-2.5 rounded-card border border-info-line bg-info-surface px-3.5 py-3">
          <Pictogram name="held" size="sm" className="mt-px shrink-0 text-text-link" />
          <p className="text-[12.5px] leading-[18px] text-navy-800">
            {t("proposal.screens.summary.policyNote")}
          </p>
        </div>
      </main>

      <StepDock>
        <Button variant="secondary" size="lg" block>
          {t("proposal.screens.summary.addInstallments")}
        </Button>
      </StepDock>
    </div>
  );
}

/**
 * One line of the money card.
 *
 * Local to this screen rather than shared: `LedgerRow` is a bordered card for a
 * priced line the partner can open and change, and four of those stacked inside
 * one card would draw four boxes where the artboard draws none. These rows carry
 * no controls because there is nothing here to control.
 */
function SummaryRow({
  label,
  amount,
  emphasis = false,
}: {
  readonly label: ReactNode;
  readonly amount: string;
  /** The subtotal line, which reads as a heading for the rows above it. */
  readonly emphasis?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-[13.5px]">
      <span
        className={
          emphasis
            ? "flex min-w-0 items-center gap-1.5 font-bold text-text"
            : "flex min-w-0 items-center gap-1.5 text-text-secondary"
        }
      >
        {label}
      </span>
      <span className="shrink-0 font-bold tabular-nums text-text">{amount}</span>
    </div>
  );
}
