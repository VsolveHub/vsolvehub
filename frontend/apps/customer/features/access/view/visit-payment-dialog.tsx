"use client";

import { Button, Dialog, Disclosure, RailHeadline } from "@vsolve/ui";

import type { VisitSlotRow } from "../adapters";
import { formatVisitSlot } from "../adapters";

/**
 * Paying for a visit plan, with the split shown before the money moves.
 *
 * ## Why the per-visit breakdown is the point of this dialog
 *
 * A two-visit plan is one charge, and one of its two slots is usually still
 * empty when the Customer pays — the first professional to confirm a time is
 * what opens the checkout, and the second may never offer one. "₹99 for two
 * visits" is therefore a sentence that raises the obvious question and does not
 * answer it: *what happens to the half I have paid for and nobody is coming to?*
 *
 * The shares answer it. Each slot is its own row with its own amount, the
 * unfilled ones say so, and the refund rule is stated against them rather than
 * as a general promise. **The server publishes `amount_paise` per share** and
 * nothing here divides a plan price by a slot count.
 *
 * ## It is a confirm step, not a method step
 *
 * There is no stored-payment-instrument endpoint in this product; the checkout
 * hands off to the provider, where the method is chosen. Listing saved cards
 * here would be inventing a wallet the platform does not have.
 */

export interface VisitPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What this plan is, in the plan's own words. */
  planSize: number;
  /** The amount actually being charged, after any credit. Server-formatted. */
  chargeableLabel: string;
  /** Any credit already applied, or null. */
  creditLabel: string | null;
  /** One row per slot, with the share's own amount. */
  rows: readonly VisitSlotRow[];
  onConfirm: () => void;
  isPending: boolean;
}

export function VisitPaymentDialog({
  open,
  onOpenChange,
  planSize,
  chargeableLabel,
  creditLabel,
  rows,
  onConfirm,
  isPending,
}: VisitPaymentDialogProps) {
  const unfilled = rows.filter((row) => row.scheduledFor === null);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Pay for the visits"
      description={`One payment covers ${planSize === 1 ? "the visit" : `all ${planSize} visits`} and the written estimate${planSize === 1 ? "" : "s"} that follow.`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Not now
          </Button>
          <Button onClick={onConfirm} loading={isPending} loadingLabel="Starting your payment">
            Pay {chargeableLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <RailHeadline
          eyebrow="To pay now"
          value={chargeableLabel}
          footnote={
            creditLabel === null
              ? "Charged once. Nothing is taken per visit."
              : `${creditLabel} credit already applied.`
          }
        />

        {/* One row per share. This is the breakdown the dialog exists for. */}
        <dl className="overflow-hidden rounded-card border border-line">
          {rows.map((row, index) => (
            <div
              key={row.id}
              className={`flex items-baseline justify-between gap-3 px-4 py-3 ${
                index > 0 ? "border-t border-line" : ""
              }`}
            >
              <dt className="min-w-0 text-sm text-text">
                <span className="font-semibold">Visit {row.position}</span>
                <span className="mt-0.5 block text-text-secondary">
                  {row.scheduledFor === null
                    ? "Time not offered yet"
                    : `${row.vendorName ?? "A professional"}, ${
                        formatVisitSlot(row.scheduledFor, row.timeZone) ?? "time confirmed"
                      }`}
                </span>
              </dt>
              <dd data-numeric className="shrink-0 text-sm font-semibold tabular-nums text-text">
                {row.money.amountLabel}
              </dd>
            </div>
          ))}
        </dl>

        {unfilled.length > 0 ? (
          // Stated against the specific slots rather than as a general promise,
          // because "we refund unused visits" is exactly the sentence people do
          // not believe until they can see which one it applies to.
          <p className="rounded-card border border-success-line bg-success-surface p-3 text-sm leading-5 text-text">
            <strong className="font-semibold">
              {unfilled.length === 1
                ? `If visit ${unfilled[0]?.position} never gets a time, its ${unfilled[0]?.money.amountLabel} refunds on its own.`
                : `Any visit that never gets a time refunds its own share on its own.`}
            </strong>{" "}
            You do not have to ask.
          </p>
        ) : null}

        <Disclosure summary="What the visit fee covers" hint="Not the project price">
          <p>
            Travel and the professional&rsquo;s time on site, plus a written
            estimate you keep whether or not you hire them. It is not part of the
            project price.
          </p>
        </Disclosure>
      </div>
    </Dialog>
  );
}
