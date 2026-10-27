"use client";

import { Button, EmptyState, Readout, SectionBand, StepDock, cn, useT } from "@vsolve/ui";

import { Pictogram } from "@/components/pictogram";

import type { EstimateView, InstallmentView } from "../model/estimate-view";
import { BackGlyph, FocusedHeader, HeaderTile } from "./parts/focused-header";

/**
 * Splitting the quoted price into the stages the customer pays against.
 *
 * ## What the partner is allocating, and what they are not
 *
 * The plates at the top count the *taxable value* — the partner's own price —
 * not what the customer pays. Tax is allocated across the stages by the server
 * at checkout, so an installment editor that asked a partner to divide the
 * tax-inclusive figure would be asking them to do the server's arithmetic and
 * to get it wrong by a rupee or two every time. The dock still shows the
 * customer-facing total, because that is the number the partner will be asked
 * about on the phone.
 *
 * ## The open row
 *
 * One row at a time carries controls. Collapsed, a row is a ledger entry that
 * says what the stage is, what it is worth and what share of the job that is;
 * open, it grows the quick-add chips and the finish date. The alternative —
 * every row showing every control — fits two stages on a 390x844 phone and
 * turns a three-stage schedule into a scroll with no landmarks.
 *
 * Which row is open is the caller's decision (`openInstallmentId`), because the
 * route owns navigation state and this component owns none: props in, JSX out,
 * no fetching, no `useState`.
 */

export interface InstallmentsScreenProps {
  readonly estimate: EstimateView;
  /** The one row showing its controls. Omit for an all-collapsed schedule. */
  readonly openInstallmentId?: string;
}

/** The quick-add amounts. Verbatim from the artboard; the keypad covers the rest. */
const QUICK_ADD = ["+100", "+500", "+1,000"] as const;

export function InstallmentsScreen({ estimate, openInstallmentId }: InstallmentsScreenProps) {
  const { installments, totals } = estimate;
  const t = useT();

  return (
    <div className="flex h-full flex-col bg-canvas">
      <FocusedHeader
        title={t("proposal.screens.installments.title")}
        backSlot={
          <HeaderTile>
            <BackGlyph label={t("common.back")} />
          </HeaderTile>
        }
      />

      <main className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-4">
        <div className="flex gap-2.5">
          <Readout label={t("proposal.screens.installments.allocated")} value={totals.taxableValue} size="sm" className="flex-1" />

          {/*
            OWNER NOTE — the remainder is not yet expressible.
            `EstimateTotalsView` carries no `allocationRemaining`, so this plate
            renders the reconciled case. That is true of the sample and of every
            schedule the server will accept (it refuses a mismatch), but it is
            not a value this screen has been *told*. When the estimate surface is
            published, the adapter must supply the remainder and this literal
            must become that field — a schedule that silently reads "₹0" while
            money is unallocated is exactly the bug this plate exists to catch.
          */}
          <RemainderPlate label={t("proposal.screens.installments.stillToAllocate")} value="₹0" />
        </div>

        <section>
          <SectionBand trailing={String(installments.length)} trailingTone="muted">
            {t("proposal.screens.installments.heading")}
          </SectionBand>

          <div className="flex flex-col gap-2">
            {installments.length === 0 ? (
              <EmptyState
                compact
                title={t("proposal.screens.installments.empty")}
                description={estimate.blockedReason ?? undefined}
              />
            ) : (
              installments.map((installment) => (
                <InstallmentCard
                  key={installment.id}
                  installment={installment}
                  open={installment.id === openInstallmentId}
                />
              ))
            )}

            <button
              type="button"
              className="flex min-h-13 items-center justify-center gap-2 rounded-card border-[1.5px] border-dashed border-line-strong text-[15px] font-bold text-text-secondary"
            >
              <Pictogram name="more" size="sm" />
              {t("proposal.screens.installments.add")}
            </button>
          </div>
        </section>

        <p className="flex gap-2 text-xs leading-[17px] text-text-muted">
          <Pictogram name="later" size="sm" className="mt-px shrink-0 text-text-link" />
          <span>{t("proposal.screens.installments.taxNote")}</span>
        </p>
      </main>

      <StepDock label={t("proposal.screens.shared.customerPays")} amount={totals.customerTotal}>
        <Button variant="secondary" size="lg" block>
          {t("proposal.screens.installments.previewAndSend")}
        </Button>
      </StepDock>
    </div>
  );
}

/**
 * The green half of the allocation pair.
 *
 * Shaped from `Readout`'s own `sm` geometry — same plate radius, same 4px rule,
 * same label and value type — because it has to read as the second of two
 * identical meters, not as a card that happens to sit beside one. It is local
 * rather than a fourth `Readout` tone only because `Readout` ships neutral,
 * active, warning and danger, and adding `success` to a shared primitive is a
 * change to the kit rather than to this screen. That tone is worth adding; see
 * the report accompanying this build.
 */
function RemainderPlate({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="relative flex-1 overflow-hidden rounded-plate border border-success-line bg-success-surface px-3 py-2">
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-success-text" />
      <div className="pl-2">
        <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-success-text">
          {label}
        </p>
        <p className="mt-0.5 text-xl font-bold leading-none tabular-nums text-success-text">
          {value}
        </p>
      </div>
    </div>
  );
}

/**
 * One stage of the schedule.
 *
 * Local rather than `LedgerRow`: that primitive is name / amount / meta, and
 * this row needs a position plate on the left and a share percentage stacked
 * under the amount on the right — two slots it does not have. It borrows
 * `LedgerRow`'s open treatment exactly (a 2px action border with a pixel taken
 * off the padding) so that opening a stage does not resize it and shift every
 * stage below it.
 */
function InstallmentCard({
  installment,
  open,
}: {
  readonly installment: InstallmentView;
  readonly open: boolean;
}) {
  const { position, title, deliverable, amount, sharePercent, expectedCompletion } = installment;
  const t = useT();

  // Open, the finish date has a row of its own below, so repeating it in the
  // subtitle would print the same date twice within 60px.
  const detail =
    !open && expectedCompletion !== undefined
      ? `${deliverable} · ${expectedCompletion}`
      : deliverable;

  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 rounded-card bg-surface",
        open ? "border-2 border-action p-[11px]" : "border border-line p-3",
      )}
    >
      <button type="button" className="flex min-h-11 w-full items-center gap-3 text-left">
        <span
          className={cn(
            "grid h-8 w-8 shrink-0 place-items-center rounded-[0.625rem] text-[13px] font-extrabold tabular-nums",
            open ? "bg-action-surface text-action-active" : "bg-surface-sunken text-text-secondary",
          )}
        >
          {position}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold tracking-[-0.015em] text-text">
            {title}
          </span>
          <span className="mt-0.5 block truncate text-[11.5px] font-medium text-text-muted">
            {detail}
          </span>
        </span>

        <span className="shrink-0">
          <span className="block text-right text-lg font-extrabold tracking-[-0.02em] tabular-nums text-text">
            {amount}
          </span>
          <span className="mt-px block text-right text-[11px] font-semibold tabular-nums text-text-muted">
            {sharePercent}%
          </span>
        </span>
      </button>

      {open ? (
        <>
          <div>
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.06em] text-text-muted">
              {t("proposal.screens.installments.stageAmount")}
            </span>

            <div className="flex gap-2">
              {QUICK_ADD.map((step) => (
                <button
                  key={step}
                  type="button"
                  className="flex min-h-11 flex-1 items-center justify-center rounded-full border border-info-line bg-info-surface text-sm font-bold tabular-nums text-text-link"
                >
                  {step}
                </button>
              ))}

              {/* The escape hatch from the chips: an exact figure, typed. */}
              <button
                type="button"
                className="grid min-h-11 w-13 shrink-0 place-items-center rounded-full bg-action-secondary text-surface"
              >
                <Pictogram name="price" size="sm" />
                <span className="sr-only">{t("proposal.screens.installments.exactAmount")}</span>
              </button>
            </div>
          </div>

          <div className="flex min-h-11 items-center gap-3 rounded-control border border-line bg-surface pl-3">
            <Pictogram name="date" size="sm" className="shrink-0 text-text-muted" />
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-text">
              {expectedCompletion === undefined
                ? t("proposal.screens.installments.noFinishDate")
                : t("proposal.screens.installments.expectFinish", { date: expectedCompletion })}
            </span>
            <button
              type="button"
              className="flex min-h-11 shrink-0 items-center px-3 text-[13px] font-semibold text-text-link"
            >
              {expectedCompletion === undefined
                ? t("proposal.screens.installments.set")
                : t("proposal.screens.installments.change")}
              <span className="sr-only">
                {" "}
                {t("proposal.screens.installments.finishDateFor", { title })}
              </span>
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
