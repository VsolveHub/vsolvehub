"use client";

import { Button, Dialog, Disclosure, RailHeadline } from "@vsolve/ui";

/**
 * The last look before the booking fee is charged.
 *
 * ## What this dialog is, and what the design assumed it was
 *
 * The mock shows saved payment methods here — a UPI handle, a card ending 4412,
 * netbanking — as radio rows. **This product stores no payment instruments.**
 * `POST .../booking-fee/checkout/` answers with an `AccessCheckout` and the
 * Customer is handed to the provider, where the method is chosen. Rendering
 * method rows would be inventing a saved-card list, and picking one would set an
 * expectation the handoff immediately contradicts.
 *
 * So this is the confirm step rather than the method step: the amount, what it
 * buys, what happens if nobody arrives, and then the handoff. The line naming
 * the provider is what stops the redirect being a surprise.
 *
 * ## Why a dialog and not just the button
 *
 * The fee is the only money Vsolve collects on an A3 booking and the refund rule
 * is the thing people ask support about. On the page it sat under a disclosure
 * among five other paragraphs; here it is the only thing on screen at the moment
 * it matters. The dialog commits nothing by existing — Escape, the backdrop and
 * **Not now** are all cancels, and the hold survives all three.
 */

export interface BookingFeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The fee, formatted by the server's own figure. */
  feeLabel: string;
  /** Cash the crew is owed, so the two numbers are never confused. */
  leadReceiptLabel: string;
  /** How much longer the crew is held, in words. Null once it has lapsed. */
  holdRemaining: string | null;
  onConfirm: () => void;
  isPending: boolean;
  /** A previous attempt failed and the server said so. Changes the verb only. */
  isRetry: boolean;
}

export function BookingFeeDialog({
  open,
  onOpenChange,
  feeLabel,
  leadReceiptLabel,
  holdRemaining,
  onConfirm,
  isPending,
  isRetry,
}: BookingFeeDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Pay the booking fee"
      description={
        holdRemaining === null
          ? "This confirms the crew for your dates."
          : `Your crew is held for another ${holdRemaining}.`
      }
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Not now
          </Button>
          <Button
            onClick={onConfirm}
            loading={isPending}
            loadingLabel="Starting your payment"
          >
            {isRetry ? `Try again — ${feeLabel}` : `Pay ${feeLabel}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <RailHeadline
          eyebrow="Booking fee"
          value={feeLabel}
          footnote="The only money Vsolve collects on this job."
        />

        <p className="text-sm leading-6 text-text-secondary">
          You will be taken to UPI, card or netbanking to pay. We do not store
          your payment details.
        </p>

        {/* Not behind the disclosure. This is the sentence people come back to
            support about, and it is a promise rather than an explanation. */}
        <p className="rounded-card border border-success-line bg-success-surface p-3 text-sm leading-5 text-text">
          <strong className="font-semibold">Refunded in full if nobody arrives.</strong>{" "}
          The {leadReceiptLabel} for the work is paid in cash, directly to the
          crew — we never hold it.
        </p>

        <Disclosure summary={`What the ${feeLabel} is for`} hint="Fee rules">
          <p>
            It holds this crew for your dates and is the only money we collect on
            this job. Cancel early and it comes back whole; cancel late and part
            of it pays the supervisor for turning down other work.
          </p>
        </Disclosure>
      </div>
    </Dialog>
  );
}
