"use client";

import { Button, EmptyState, Spinner } from "@vsolve/ui";
import { useEffect, useState } from "react";

import type { CheckoutSessionView } from "../adapters";

/**
 * The bounded Partner search, and the commitment that ends it.
 *
 * This screen exists because of ADR-012: M1 obtains an informed Partner
 * acceptance *before* the customer pays. The customer therefore spends real time
 * here — up to 180 seconds of search, then up to 120 seconds while the Partner's
 * no-fault undo window runs — and what they see during it has to be honest.
 *
 * The rules this screen is built to keep:
 *
 * - **No fabricated progress.** There is no percentage bar, no "3 of 5
 *   professionals contacted", no invented name. The server does not publish
 *   per-offer progress and the customer is not shown a number that does not
 *   exist. A countdown to a real server deadline is the only quantity on screen.
 * - **No Partner identity during the search.** An offer is not a commitment, and
 *   a Partner who declines must not have been named. `partnerName` is null until
 *   the server says otherwise.
 * - **Cancelling is free and always offered.** Nothing has been charged.
 * - **Exhaustion is a real answer.** When nobody accepts, the customer is told
 *   plainly, told they were not charged, and given the server's alternatives —
 *   not left on a spinner.
 * - **Closing the tab changes nothing.** The search runs on the server; this is
 *   a view of it.
 */

export interface FindingStageProps {
  session: CheckoutSessionView;
  onCancel: () => void;
  onRetry: () => void;
  /** Enabled only when `session.canPay`. Owned by the payment stage. */
  onPay: () => void;
}

/**
 * Seconds remaining against a server deadline.
 *
 * Calibrated from `serverNow` on every poll rather than from `Date.now()`: a
 * device with a skewed clock would otherwise show a countdown that disagrees
 * with the deadline the server will actually enforce.
 */
function useRemainingSeconds(deadlineAt: string | null, serverNow: string): number | null {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (deadlineAt === null) {
      return;
    }

    const skew = Date.now() - Date.parse(serverNow);
    const tick = () => {
      const left = Date.parse(deadlineAt) - (Date.now() - skew);
      setRemaining(Math.max(0, Math.ceil(left / 1000)));
    };

    // Schedule the initial update outside the effect body. This keeps the
    // effect focused on subscribing to the clock and avoids a synchronous
    // cascading render under React 19.
    const initialId = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(initialId);
      window.clearInterval(id);
    };
  }, [deadlineAt, serverNow]);

  return deadlineAt === null ? null : remaining;
}

function Countdown({ seconds }: { seconds: number }) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return (
    <span data-numeric className="tabular-nums">
      {minutes}:{String(rest).padStart(2, "0")}
    </span>
  );
}

export function FindingStage({ session, onCancel, onRetry, onPay }: FindingStageProps) {
  const remaining = useRemainingSeconds(session.deadlineAt, session.serverNow);

  if (session.phase === "failed") {
    return (
      <div>
        <EmptyState
          title="No professional was available"
          description="Nobody could take this job in the window you chose. You have not been charged."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={onRetry}>Try another time</Button>
              <Button variant="ghost" onClick={onCancel}>
                Start over
              </Button>
            </div>
          }
        />

        {/* Server-authored alternatives. The frontend does not compose these —
            it does not know which windows have supply. */}
        {session.alternatives.length > 0 ? (
          <ul className="mt-4 flex list-none flex-col gap-1 p-0 text-sm text-text-secondary">
            {session.alternatives.map((alternative) => (
              <li key={alternative.code}>{alternative.label}</li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  if (session.phase === "searching" || session.phase === "idle") {
    return (
      <div className="py-8 text-center" aria-busy>
        <Spinner size="lg" />
        <h2 className="mt-4 text-lg font-semibold text-text">
          Finding a professional
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          We are offering this job to electricians near you, one at a time. This
          usually takes under a minute.
        </p>

        {remaining !== null ? (
          <p aria-live="polite" className="mt-3 text-sm text-text-secondary">
            Searching for up to <Countdown seconds={remaining} /> more
          </p>
        ) : null}

        <p className="mt-4 text-sm text-text-muted">
          You have not been charged. You can close this page — we will keep
          looking and notify you.
        </p>

        <Button variant="ghost" className="mt-4" onClick={onCancel}>
          Cancel search
        </Button>
      </div>
    );
  }

  // Committed: a Partner has accepted. Payment may still be gated by their undo
  // window, which is why the button follows `canPay` rather than the phase.
  return (
    <div className="py-6">
      <h2 className="text-lg font-semibold text-text">
        {session.partnerName ?? "A professional"} accepted your job
      </h2>
      {session.partnerBadge ? (
        <p className="mt-1 text-sm text-text-secondary">{session.partnerBadge}</p>
      ) : null}

      {session.payBlockedReason === "UNDO_WINDOW_OPEN" ? (
        <p aria-live="polite" className="mt-4 text-sm text-text-secondary">
          Confirming with them now
          {remaining !== null ? (
            <>
              {" "}
              — payment opens in <Countdown seconds={remaining} />
            </>
          ) : null}
          .
        </p>
      ) : null}

      {session.payBlockedReason === "RESERVATION_EXPIRING" ? (
        <p aria-live="polite" className="mt-4 text-sm text-danger-text">
          This slot is about to be released. Start over to choose another window —
          you have not been charged.
        </p>
      ) : null}

      {session.canPay && remaining !== null ? (
        <p aria-live="polite" className="mt-4 text-sm text-text-secondary">
          Your slot is held for <Countdown seconds={remaining} />. Pay within this
          time to confirm.
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        <Button onClick={onPay} disabled={!session.canPay}>
          Pay and confirm
        </Button>
        {session.canCancelFree ? (
          <Button variant="ghost" onClick={onCancel}>
            Cancel — free
          </Button>
        ) : null}
      </div>
    </div>
  );
}
