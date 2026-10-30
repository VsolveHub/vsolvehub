"use client";

import { Button, StepDock, useT } from "@vsolve/ui";

import { Pictogram } from "@/components/pictogram";

import type { EstimateView } from "../model/estimate-view";
import { BackGlyph, FocusedHeader, HeaderTile } from "./parts/focused-header";

/**
 * The last look before the estimate leaves the partner's phone.
 *
 * ## Why this screen exists at all
 *
 * The composer shows the partner their own working. This shows them the
 * customer's view of it: the three lines that appear on the document, the grand
 * total, how it will be paid, and — the part partners lose arguments over — what
 * the price does and does not cover. A partner who has read this screen and then
 * sends is a partner who cannot be surprised by what the customer received.
 *
 * ## Scope lines are the caller's, not this screen's
 *
 * `inclusions` and `exclusions` are plain sentences supplied by whatever
 * assembled the estimate — a category template, the partner's own terms, or the
 * two together. They are typed locally rather than added to `EstimateView`
 * because the published contract does not carry them yet and inventing a field
 * on a shared view type is how a half-real shape becomes load-bearing. When the
 * estimate surface lands they move onto the estimate and these props go.
 *
 * Presentational: no fetching, no state, no arithmetic beyond joining the
 * already-formatted installment amounts into one sentence.
 */

/** One line of what the quoted price covers. A sentence, sentence-cased, no bullet. */
export type EstimateInclusion = string;

/** One line of what it does not. Same shape; kept distinct so call sites read. */
export type EstimateExclusion = string;

export interface EstimatePreviewScreenProps {
  readonly estimate: EstimateView;
  readonly inclusions: readonly EstimateInclusion[];
  readonly exclusions: readonly EstimateExclusion[];
}

export function EstimatePreviewScreen({
  estimate,
  inclusions,
  exclusions,
}: EstimatePreviewScreenProps) {
  const { installments, totals } = estimate;
  const t = useT();

  // "Paid in 2 installments · ₹1,200 then ₹930 plus tax". Every amount here is
  // already a formatted string; this joins them and adds no figure of its own.
  const scheduleLine =
    installments.length === 0
      ? null
      : t("proposal.screens.preview.scheduleLine", {
          count: installments.length,
          amounts: installments
            .map((installment) => installment.amount)
            .join(t("proposal.screens.preview.then")),
        });

  return (
    <div className="flex h-full flex-col bg-canvas">
      <FocusedHeader
        title={t("proposal.screens.preview.title")}
        backSlot={
          <HeaderTile>
            <BackGlyph label={t("common.back")} />
          </HeaderTile>
        }
      />

      <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        <button
          type="button"
          className="flex h-13 w-full items-center justify-center gap-2 rounded-xl border border-info-line bg-info-surface text-sm font-bold text-text-link"
        >
          <Pictogram name="papers" size="sm" />
          {t("proposal.screens.preview.previewPdf")}
        </button>

        {/* Panels are written out rather than composed from `Card`, which
            hard-codes `p-6`; `cn` is clsx, not tailwind-merge, so a smaller
            padding joins the class list instead of replacing it and loses. Same
            radius, border, surface and shadow tokens. */}
        <section className="rounded-card border border-line bg-surface p-3.5 shadow-card">
          <PanelLabel>{t("proposal.screens.preview.customerReceives")}</PanelLabel>

          <div className="flex flex-col gap-2.5">
            <DocumentRow label={t("proposal.screens.shared.itemWiseTotal")} amount={totals.linesTotal} />
            <DocumentRow label={t("proposal.screens.shared.otherCharges")} amount={totals.chargesTotal} />
            <DocumentRow label={totals.taxLabel} amount={totals.taxAmount} />
          </div>

          <div aria-hidden className="my-3 border-t border-dashed border-warm-300" />

          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-extrabold text-text">{t("proposal.screens.preview.grandTotal")}</span>
            <span className="text-[1.3125rem] font-extrabold tracking-[-0.02em] tabular-nums text-text">
              {totals.customerTotal}
            </span>
          </div>

          {scheduleLine === null ? null : (
            <p className="mt-2.5 text-[11.5px] leading-4 text-text-muted">{scheduleLine}</p>
          )}
        </section>

        {inclusions.length === 0 && exclusions.length === 0 ? null : (
          <section className="rounded-card border border-line bg-surface p-3.5">
            {inclusions.length === 0 ? null : (
              <>
                <PanelLabel>{t("proposal.screens.preview.included")}</PanelLabel>
                <ScopeList lines={inclusions} kind="included" />
              </>
            )}

            {inclusions.length > 0 && exclusions.length > 0 ? (
              <div aria-hidden className="my-3 h-px bg-line" />
            ) : null}

            {exclusions.length === 0 ? null : (
              <>
                <PanelLabel>{t("proposal.screens.preview.notIncluded")}</PanelLabel>
                <ScopeList lines={exclusions} kind="excluded" />
              </>
            )}
          </section>
        )}

        <p className="flex gap-2 text-xs leading-[17px] text-text-muted">
          <Pictogram name="time" size="sm" className="mt-px shrink-0" />
          <span>{t("proposal.screens.preview.validity")}</span>
        </p>
      </main>

      {/* Two controls, one primary. Save is an outline so it reads as the way
          back rather than as a second send — plan 03's one-primary-per-stage
          rule, and the difference between a draft and a delivered document is
          not a difference a partner should have to squint at. */}
      <StepDock>
        <div className="flex gap-2">
          <Button variant="outline" size="lg" className="shrink-0">
            {t("common.save")}
          </Button>
          <Button
            variant="primary"
            size="lg"
            className="flex-1"
            icon={<Pictogram name="go" size="sm" />}
          >
            {t("proposal.screens.preview.send")}
          </Button>
        </div>
      </StepDock>
    </div>
  );
}

function PanelLabel({ children }: { readonly children: string }) {
  return (
    <p className="mb-2.5 text-[11px] font-extrabold uppercase tracking-[0.06em] text-text-muted">
      {children}
    </p>
  );
}

/** A line as the customer's copy prints it: no controls, nothing to open. */
function DocumentRow({ label, amount }: { readonly label: string; readonly amount: string }) {
  return (
    <div className="flex justify-between gap-3 text-[13.5px]">
      <span className="min-w-0 text-text-secondary">{label}</span>
      <span className="shrink-0 font-bold tabular-nums text-text">{amount}</span>
    </div>
  );
}

/**
 * Ticks and crosses.
 *
 * The mark carries a colour *and* a shape — a check against a cross — because
 * the difference between "we do this" and "we do not" cannot rest on green
 * versus red alone (plan 03). The list is a real `<ul>`: a customer reading this
 * with a screen reader is told how many things are in scope before hearing them.
 */
function ScopeList({
  lines,
  kind,
}: {
  readonly lines: readonly string[];
  readonly kind: "included" | "excluded";
}) {
  const included = kind === "included";

  return (
    <ul className="flex flex-col gap-2">
      {lines.map((line) => (
        <li key={line} className="flex items-start gap-2.5 text-[12.5px] leading-[18px] text-text-secondary">
          <Pictogram
            name={included ? "yes" : "no"}
            size="sm"
            className={included ? "mt-px shrink-0 text-success-text" : "mt-px shrink-0 text-danger-text"}
          />
          <span className="min-w-0">{line}</span>
        </li>
      ))}
    </ul>
  );
}
