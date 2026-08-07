"use client";

import { describeError } from "@vsolve/query";
import { Button, Dialog } from "@vsolve/ui";
import { useState } from "react";

import { isSimulatedCaptureUnavailable, useSimulateCapture, type PaymentAttempt } from "../queries";

/**
 * Marks a payment received without a gateway. **Development only.**
 *
 * No payment provider is configured yet, so without this the flow stops dead at
 * the one step nobody can complete — and everything capture triggers
 * (reservations confirmed, the Order and its Bookings written, the invoice
 * issued, the booked cart items cleared) never gets exercised at all.
 *
 * ## Why it looks like a warning rather than a button
 *
 * Because it is one. This control moves money state without money moving, and
 * the day it appears on a screen somebody is demoing to a customer, the styling
 * is what makes that obvious in the first second. It is deliberately not styled
 * as the primary action even though it is the only one that works here.
 *
 * ## Why it hides itself rather than erroring
 *
 * Django publishes the endpoint only where the flag is on, and refuses to boot
 * with the flag on in production. A `404` is therefore "this environment does not
 * do that", not a failure — so the control disappears rather than showing an
 * error nobody can act on. The one place it must never render is exactly the
 * place the server will not answer it.
 *
 * ## Why the confirmation exists
 *
 * Capture is irreversible from the customer's side — undoing it means a refund,
 * not a delete. A dialog for a one-tap money action is the difference between a
 * deliberate test and a mis-tap during a demo.
 */
export function SimulatedCapture({ attempt }: { attempt: PaymentAttempt }) {
  const [isConfirming, setIsConfirming] = useState(false);
  const capture = useSimulateCapture();

  // The server said this environment does not offer it. Say nothing further.
  if (isSimulatedCaptureUnavailable(capture.error)) return null;

  return (
    <div className="mt-6 rounded-card border border-dashed border-warning-line bg-warning-surface p-4">
      <p className="text-sm font-semibold text-warning-text">Development only</p>
      <p className="mt-1 text-sm text-warning-text">
        No payment provider is set up in this environment. This marks the booking as paid
        without taking any money.
      </p>

      <Button
        variant="outline"
        className="mt-3"
        onClick={() => setIsConfirming(true)}
        disabled={capture.isPending}
      >
        Mark as paid
      </Button>

      {capture.isError && !isSimulatedCaptureUnavailable(capture.error) ? (
        <p className="mt-3 text-sm text-critical" role="alert">
          {describeError(capture.error, "mutation").message}
        </p>
      ) : null}

      {isConfirming ? (
        <Dialog
          open
          onOpenChange={(next) => {
            if (!next && !capture.isPending) setIsConfirming(false);
          }}
          title="Mark this booking as paid?"
          description="No money will be taken. The booking will behave exactly as if it had been paid for — professionals are confirmed and an invoice is issued."
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => setIsConfirming(false)}
                disabled={capture.isPending}
              >
                Cancel
              </Button>
              <Button
                loading={capture.isPending}
                loadingLabel="Marking as paid"
                onClick={() =>
                  capture.mutate(attempt.id, { onSuccess: () => setIsConfirming(false) })
                }
              >
                Yes, mark as paid
              </Button>
            </>
          }
        >
          <p className="text-sm text-text-secondary">
            Use this only while testing. It cannot be undone from here — reversing it means
            issuing a refund.
          </p>
        </Dialog>
      ) : null}
    </div>
  );
}
