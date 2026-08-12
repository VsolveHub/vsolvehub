"use client";

import { useServerCountdown } from "@vsolve/query";
import { Button } from "@vsolve/ui";
import Link from "next/link";

/**
 * What the Customer sees the moment the request goes — `M2-FE-212`.
 *
 * ## This is not a fifth screen
 *
 * `SCREENS` is four and stays four; the budget is on the *form*, and this is
 * the outcome of a command rather than a step in filling one in. Review is
 * still the single confirmation — there is no "are you sure" between the button
 * and the send. What this replaces is landing a Customer on a list with no
 * acknowledgement that the thing they just spent four screens on arrived.
 *
 * ## Why the free promise is made here and not on review
 *
 * `M2-FE-212` wants the Customer told plainly that this costs nothing. The only
 * published field that says so is `is_free` on `RequirementSubmitted` — the
 * *response* to submitting — so before they press the button the server has not
 * said it and the review screen deliberately says nothing about money rather
 * than asserting it locally. A hardcoded "this is free" would be a promise that
 * outlives the policy it describes, and this flow will one day sit beside one
 * that is not free.
 *
 * The consequence is recorded rather than worked around: the promise lands one
 * moment later than the task would like. Requesting `is_free` on the draft
 * projection is logged in the execution plan §7.
 */

export interface RequirementSentProps {
  requirementId: string;
  /** The server's own statement. Nothing is said about price when it is false. */
  isFree: boolean;
  /** ISO date-time, or null where the service area carries no delivery promise. */
  quoteDeadlineAt: string | null;
  /** Where to go to watch it. Injected — this feature owns no route. */
  requestHref: string;
  browseHref: string;
}

export function RequirementSent({
  requirementId,
  isFree,
  quoteDeadlineAt,
  requestHref,
  browseHref,
}: RequirementSentProps) {
  // Read against the server clock, like every other deadline in the app, so a
  // device an hour fast cannot promise quotes an hour early.
  const countdown = useServerCountdown(quoteDeadlineAt, 60_000);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-10">
      <h1 className="text-xl font-semibold text-text">Your request is with us</h1>

      <p className="max-w-prose text-sm leading-6 text-text-secondary">
        We are finding professionals who can do this and asking them to quote.
        You do not have to do anything while that happens.
      </p>

      {isFree ? (
        <p className="max-w-prose rounded-card border border-info-line bg-info-surface p-4 text-sm leading-6 text-text">
          Sending this was free. Nothing has been charged, and nothing is charged
          until professionals have sent you quotes to look at.
        </p>
      ) : null}

      {countdown !== null && !countdown.isExpired ? (
        <p className="max-w-prose text-sm leading-6 text-text-secondary">
          We aim to have quotes for you in{" "}
          <span className="font-medium text-text">
            {countdown.announce.replace(/ left$/, "")}
          </span>
          .
        </p>
      ) : (
        // No deadline is a real answer, not a missing one: an area with no open
        // hours carries no delivery promise, and inventing "within 24 hours"
        // here is precisely the fabricated progress `M2-FE-215` forbids.
        <p className="max-w-prose text-sm leading-6 text-text-secondary">
          We have not put a time on this one. Everything that happens to it is
          recorded on the request itself.
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Link href={requestHref}>
          <Button>Follow this request</Button>
        </Link>
        <Link href={browseHref}>
          <Button variant="secondary">Back to services</Button>
        </Link>
      </div>

      <p className="text-xs text-text-secondary">
        Reference <span className="font-mono">{requirementId.slice(0, 8)}</span>
      </p>
    </div>
  );
}
