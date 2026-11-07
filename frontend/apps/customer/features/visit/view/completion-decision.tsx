"use client";

import { Button, ErrorState } from "@vsolve/ui";
import { useState } from "react";

import { useConfirmCompletion, useDisputeCompletion, type Visit } from "../queries";

/**
 * The Customer's answer to "the work is done": confirm it, or say what is wrong.
 *
 * Its own module because two screens draw it: the visit page and — since 1.96.0 — the booking
 * overview a one-visit booking opens on. Before that the overview had no way to answer, so a
 * Partner's report waited for a button the Customer could not find.
 */
export function CompletionDecision({ visit }: { visit: Visit }) {
  const confirm = useConfirmCompletion();
  const dispute = useDisputeCompletion();
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const busy = confirm.isPending || dispute.isPending;

  return (
    <section
      aria-labelledby="visit-completion"
      className="mt-6 rounded-control border border-warning-line bg-warning-surface/40 p-4"
    >
      <h3 id="visit-completion" className="text-sm font-semibold text-text">
        Your professional says the work is done
      </h3>
      <p className="mt-1 text-sm leading-6 text-text-secondary">
        Check it, then confirm. If something is not right, tell us. With no answer it confirms
        itself after 24 hours.
      </p>
      {visit.completion?.notes ? (
        <p className="mt-2 text-sm leading-6 text-text-secondary">{visit.completion.notes}</p>
      ) : null}

      {confirm.isError || dispute.isError ? (
        <ErrorState
          inline
          className="mt-3"
          title="We could not record that"
          message="Nothing has changed. We have re-checked the visit — try again."
        />
      ) : null}

      {reporting ? (
        <div className="mt-3">
          <label htmlFor="dispute-reason" className="text-sm font-semibold text-text">
            What is wrong?
          </label>
          <textarea
            id="dispute-reason"
            className="mt-1 min-h-24 w-full rounded-control border border-line bg-surface p-2 text-sm"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={240}
          />
          <div className="mt-3 flex flex-wrap gap-3">
            <Button
              disabled={reason.trim().length === 0 || busy}
              loading={dispute.isPending}
              loadingLabel="Sending"
              onClick={() =>
                dispute.mutate({
                  bookingId: visit.id,
                  expectedVersion: visit.version,
                  disputeReason: reason.trim(),
                })
              }
            >
              Send report
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setReporting(false)}>
              Back
            </Button>
          </div>
        </div>
      ) : (
        // Equal weight on purpose. A quiet "report a problem" link beside a
        // prominent Confirm is a nudge past a problem, not a choice.
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            loading={confirm.isPending}
            loadingLabel="Confirming"
            disabled={busy}
            onClick={() =>
              confirm.mutate({ bookingId: visit.id, expectedVersion: visit.version })
            }
          >
            Confirm it is done
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => setReporting(true)}>
            Report a problem
          </Button>
        </div>
      )}
    </section>
  );
}
