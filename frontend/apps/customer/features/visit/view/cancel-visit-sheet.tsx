"use client";

import { Button, ErrorState, Sheet, formatMoney } from "@vsolve/ui";
import { useState } from "react";

import { describeCancelFailure } from "../reasons";
import { useCancelVisit, type Visit } from "../queries";

/**
 * Cancelling one visit, in two deliberate steps.
 *
 * ## Why the money is a step of its own
 *
 * A cancel button that charges a fee the moment it is pressed is a trap. The reason picker and
 * the confirm step are separated so the fee and the refund are on screen, in rupees, before the
 * irreversible press — and so the customer can back out after seeing them.
 *
 * ## Every rupee here came from the server
 *
 * `visit.cancellation_preview` is computed by Django from the frozen quote-time fee ladder and
 * the live payment allocations. This component does no arithmetic on money at all — not even
 * subtracting the fee from the total, which is exactly the kind of "obvious" client-side sum
 * that drifts from the server's rounding the first time an amendment adds a second payment.
 *
 * ## The preview is a quote, not a promise
 *
 * It is priced at the moment the visit was last read. A customer who leaves the sheet open
 * across a band boundary sees a stale number; Django recomputes authoritatively on submit and
 * the response replaces the cache. That is why the success state re-reads rather than
 * announcing the previewed figure as fact.
 */

/**
 * Reasons offered as buttons rather than a free-text box first.
 *
 * These are the customer's words for why they are leaving, and they are sent verbatim as the
 * `reason` Django records. Nothing branches on them — the fee comes from the band ladder and
 * the clock, never from which reason was picked, so there is no reason here that pays better
 * than another.
 */
const CANCEL_REASONS = [
  "I no longer need this",
  "I booked the wrong service",
  "The timing does not work",
  "I found another option",
] as const;

const OTHER_REASON = "Something else";

function FeeSummary({ visit }: { visit: Visit }) {
  const preview = visit.cancellation_preview;

  if (!preview) {
    // Django says this visit is not the customer's to cancel. Showing a fee of zero and a full
    // refund here would describe an outcome they cannot have.
    return (
      <p className="text-sm leading-6 text-text-secondary">
        We could not price this cancellation. Nothing has been charged — try again in a moment.
      </p>
    );
  }

  return (
    <dl className="space-y-2 rounded-control bg-surface-sunken p-4 text-sm">
      <div className="flex items-baseline justify-between gap-4">
        <dt className="text-text-secondary">Cancellation fee</dt>
        <dd data-numeric className="font-semibold text-text">
          {formatMoney(preview.fee_paise)}
        </dd>
      </div>
      <div className="flex items-baseline justify-between gap-4">
        <dt className="text-text-secondary">Back to you</dt>
        <dd data-numeric className="font-semibold text-text">
          {formatMoney(preview.refund_paise)}
        </dd>
      </div>
      {preview.fee_waiver ? (
        <p className="pt-1 text-sm leading-6 text-text-secondary">
          {preview.fee_waiver === "partner_released"
            ? "No fee — your professional stepped back, not you."
            : "No fee — your professional was running late."}
        </p>
      ) : null}
      <p className="pt-1 text-xs leading-5 text-text-secondary">
        Refunds go back to the way you paid, usually within 5–7 working days.
      </p>
    </dl>
  );
}

export function CancelVisitSheet({
  visit,
  open,
  onOpenChange,
}: {
  visit: Visit;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const cancel = useCancelVisit();
  const [reason, setReason] = useState<string | null>(null);
  const [otherReason, setOtherReason] = useState("");
  const [confirming, setConfirming] = useState(false);

  const chosen = reason === OTHER_REASON ? otherReason.trim() : (reason ?? "");
  const canContinue = chosen.length > 0;

  function close() {
    onOpenChange(false);
    // Reset only after the sheet is closed, so nothing flickers on the way out.
    setConfirming(false);
    setReason(null);
    setOtherReason("");
    cancel.reset();
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title={confirming ? "Cancel this visit?" : "Why are you cancelling?"}
      description={
        confirming
          ? "This cannot be undone. Here is what happens to your payment."
          : "This cancels only this visit. Anything else in your booking is unaffected."
      }
      dismissable={!cancel.isPending}
      footer={
        confirming ? (
          <>
            <Button variant="ghost" disabled={cancel.isPending} onClick={() => setConfirming(false)}>
              Back
            </Button>
            <Button
              variant="danger"
              loading={cancel.isPending}
              loadingLabel="Cancelling"
              onClick={() =>
                cancel.mutate(
                  {
                    bookingId: visit.id,
                    expectedVersion: visit.version,
                    reason: chosen,
                  },
                  { onSuccess: close },
                )
              }
            >
              Cancel this visit
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>
              Keep it
            </Button>
            <Button disabled={!canContinue} onClick={() => setConfirming(true)}>
              Continue
            </Button>
          </>
        )
      }
    >
      {cancel.isError ? (
        <ErrorState
          inline
          className="mb-4"
          title="We could not cancel this visit"
          message={describeCancelFailure(cancel.error)}
        />
      ) : null}

      {confirming ? (
        <FeeSummary visit={visit} />
      ) : (
        <fieldset className="space-y-2">
          <legend className="sr-only">Reason for cancelling</legend>
          {[...CANCEL_REASONS, OTHER_REASON].map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-center gap-3 rounded-control border border-line p-3 text-sm has-[:checked]:border-action has-[:checked]:bg-surface-sunken"
            >
              <input
                type="radio"
                name="cancel-reason"
                value={option}
                checked={reason === option}
                onChange={() => setReason(option)}
                className="h-4 w-4"
              />
              <span className="text-text">{option}</span>
            </label>
          ))}
          {reason === OTHER_REASON ? (
            <textarea
              aria-label="Tell us what happened"
              className="mt-1 min-h-20 w-full rounded-control border border-line bg-surface p-2 text-sm"
              value={otherReason}
              onChange={(event) => setOtherReason(event.target.value)}
              // Matches `MAX_CANCELLATION_REASON_CHARS`, so an over-long reason is impossible
              // here rather than a 400 after the customer has written it.
              maxLength={240}
              placeholder="Tell us what happened"
            />
          ) : null}
        </fieldset>
      )}
    </Sheet>
  );
}
