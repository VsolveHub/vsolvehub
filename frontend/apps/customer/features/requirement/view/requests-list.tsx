"use client";

import { categorizeError, describeError, useServerCountdown } from "@vsolve/query";
import { Button, EmptyState, ErrorState, Skeleton } from "@vsolve/ui";
import Link from "next/link";
import type { ReactNode } from "react";

import type { RequestRowView } from "../adapters";
import {
  isClosedState,
  isOurFailure,
  requestState,
  showsQuoteDeadline,
  type RequestState,
} from "../model/request-state";
import { RequestStateBadge, REQUEST_STATE_COPY } from "./request-state";

/**
 * `My requests` — `M2-FE-213`, with the honest states of `M2-FE-215`.
 *
 * A list, not a dashboard, for the reason the M1 booking list gives: it exists
 * so someone can find the request they want to look at. Nothing here polls — a
 * list that refreshed itself under a reading finger would move the row being
 * tapped, and none of these states changes in the seconds a list is on screen.
 *
 * ## Why this takes props and mounts no query
 *
 * `contracts/openapi/v1.yaml` publishes no M2 path. `GET /requirements/` is
 * requested in proposal 0012 and does not exist, so there is no hook to call and
 * — per the execution plan §2 — no fixture may stand in for one. The component
 * takes the four things a query would give it (`requests`, `isPending`, `error`,
 * `onRetry`) so that integration is one call site changing, not this file.
 *
 * The consequence, stated plainly: with no endpoint this renders its loading
 * state and then its error state. That is the real behaviour, not a simulation
 * of one, and it is why no route mounts it yet.
 *
 * ## Exception states
 *
 * Loading, empty, offline/retry, forbidden and server-error all arrive through
 * one seam. `categorizeError` decides *where* a failure belongs and
 * `describeError` decides *what it says*; both are the shared M2 layer, so this
 * screen cannot invent a nineteenth way of phrasing "not signed in".
 */

/**
 * "about 2 hours" from the countdown's "about 2 hours left".
 *
 * `announce` is the coarse, screen-reader-safe phrasing and it is the right
 * grain for a deadline hours away — the digits in `display` would be a clock
 * counting down to a promise, which reads as more precision than a business-hours
 * SLA has. Only the trailing "left" is dropped, because the sentence supplies
 * its own verb.
 */
function remainingPhrase(announce: string): string {
  return announce.replace(/ left$/, "");
}

function LastActivity({ at }: { at: string }) {
  return (
    <p className="text-sm text-text-secondary">
      Last update{" "}
      <time dateTime={at}>
        {new Date(at).toLocaleString("en-IN", {
          day: "numeric",
          month: "short",
          hour: "numeric",
          minute: "2-digit",
        })}
      </time>
    </p>
  );
}

export interface RequestRowProps {
  request: RequestRowView;
  /** Where the row goes. Injected — this feature does not own the route table. */
  href: string;
  /** Rendered inside the state notice where support is the honest next step. */
  supportAction?: ReactNode;
  /**
   * Whether this request is over.
   *
   * A closed request is still worth keeping — a Customer looks one up to see
   * what happened, or to start the same job again — but it is not news, and it
   * must not read like a live one. It keeps every word it had and loses the
   * emphasis: sunken surface, no hover affordance, and the whole card at 70%
   * until it is pointed at.
   */
  isClosed?: boolean;
}

export function RequestRow({ request, href, supportAction, isClosed = false }: RequestRowProps) {
  // Derived during render from the server clock, so the delayed state appears
  // the moment the promise passes rather than on the next refetch.
  const countdown = useServerCountdown(request.deadlineAt, 60_000);
  const state: RequestState = requestState({
    status: request.status,
    quoteDeadlineRemainingMs: countdown?.remainingMs ?? null,
  });
  const copy = REQUEST_STATE_COPY[state];

  return (
    <li
      className={
        isClosed
          ? "rounded-card border border-line bg-surface-sunken opacity-70 transition-opacity hover:opacity-100"
          : "rounded-card border border-line bg-surface"
      }
    >
      <Link
        href={href}
        className="block rounded-card p-4 hover:border-warm-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-text">{request.title}</h2>
          <RequestStateBadge state={state} />
        </div>

        {request.lifecycleExplanation !== null ? (
          <p className="mt-1 text-sm text-text-secondary">{request.lifecycleExplanation}</p>
        ) : null}

        <p className="mt-2 text-sm text-text-secondary">{copy.explanation}</p>

        <div className="mt-2 flex flex-col gap-0.5">
          {/* A count, never an identity. Who quoted is withheld until unlock,
              and this row is the first place that rule can be broken. */}
          {request.teaserCount > 0 ? (
            <p className="text-sm text-text">
              {request.teaserCount === 1
                ? "1 quote waiting"
                : `${request.teaserCount} quotes waiting`}
            </p>
          ) : null}

          {showsQuoteDeadline(state) && countdown !== null && !countdown.isExpired ? (
            <p className="text-sm text-text-secondary">
              Quotes promised in{" "}
              <span className="font-medium text-text">
                {remainingPhrase(countdown.announce)}
              </span>
            </p>
          ) : null}

          {request.lastActivityAt !== null ? <LastActivity at={request.lastActivityAt} /> : null}
        </div>
      </Link>

      {/* The next step sits outside the link, because it can carry its own
          action and a button inside an anchor is a control nobody can reach
          without also following the link.

          It is rendered whenever the state has one, not only where support is
          offered. `M2-FE-215` asks for a truthful next step, and a closed
          request explaining why it closed without saying what to do about it is
          half the answer — which is what the row did before. */}
      {copy.nextStep !== null ? (
        <div className="border-t border-line p-4">
          <p className="max-w-prose text-sm leading-6 text-text">{copy.nextStep}</p>
          {isOurFailure(state) && supportAction !== undefined ? (
            <div className="mt-3">{supportAction}</div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export interface RequestsListProps {
  requests: readonly RequestRowView[];
  isPending: boolean;
  /** Whatever the read threw. Classified here, never pre-formatted by the caller. */
  error: unknown;
  onRetry: () => void;
  /** Where a row goes. Injected so this feature owns no route. */
  hrefFor: (requirementId: string) => string;
  /** Offered on the states where we are the reason there is nothing to show. */
  supportActionFor?: (requirementId: string) => ReactNode;
  /** The way out of the empty state — the catalog, supplied by the route. */
  startAction?: ReactNode;
}

export function RequestsList({
  requests,
  isPending,
  error,
  onRetry,
  hrefFor,
  supportActionFor,
  startAction,
}: RequestsListProps) {
  if (isPending) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading your requests</span>
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-36 w-full" />
        ))}
      </div>
    );
  }

  // A failed read with rows already on screen keeps the rows — a stale list is
  // more useful than a blank page, and the banner below says it is stale. Only
  // a read that produced nothing is a full-screen error.
  if (error !== null && error !== undefined && requests.length === 0) {
    const category = categorizeError(error);
    const presentation = describeError(error, "read");
    // Forbidden fails closed. Softening a 401/403 into "try again" sends someone
    // round a retry loop that cannot succeed, and hides the one thing that
    // would — signing in again.
    const retryable = category !== "forbidden";

    return (
      <ErrorState
        title={presentation.title}
        message={presentation.message}
        severity={presentation.severity}
        actionLabel={retryable ? (presentation.action?.label ?? "Try again") : undefined}
        onAction={retryable ? onRetry : undefined}
        reference={presentation.reference}
      />
    );
  }

  if (requests.length === 0) {
    return (
      <EmptyState
        title="You have not asked for anything yet"
        description="When you describe a job, it appears here with what is happening to it. Describing one is free."
        action={startAction}
      />
    );
  }

  const open = requests.filter((request) => !isClosedState(request.status));
  /*
    Newest closure first. The open group keeps the order the read gave it —
    the server decides what is most pressing and this list must not second-guess
    it — but a closed group has no urgency to preserve, and the one a Customer
    is looking for is almost always the one that just ended. Rows with no
    recorded activity sort last rather than being treated as ancient.
  */
  const closed = requests
    .filter((request) => isClosedState(request.status))
    .slice()
    .sort((a, b) => {
      const at = a.lastActivityAt === null ? 0 : Date.parse(a.lastActivityAt);
      const bt = b.lastActivityAt === null ? 0 : Date.parse(b.lastActivityAt);
      return bt - at;
    });

  return (
    <div>
      {error !== null && error !== undefined ? (
        <div className="mb-3">
          <ErrorState
            title="This list may be out of date"
            message={describeError(error, "read").message}
            severity="warning"
            actionLabel="Try again"
            onAction={onRetry}
            inline
          />
        </div>
      ) : null}

      {open.length > 0 ? (
        <ul className="flex list-none flex-col gap-3 p-0">
          {open.map((request) => (
            <RequestRow
              key={request.id}
              request={request}
              href={hrefFor(request.id)}
              supportAction={supportActionFor?.(request.id)}
            />
          ))}
        </ul>
      ) : null}

      {/*
        Everything that is over, underneath and out of the way.

        Before this split the two were one flat list in whatever order the read
        returned them, drawn identically — so a Customer scrolling their requests
        met expired and no-supply ones sitting among the live ones, at the same
        weight, with nothing but a badge to tell them apart. `isClosedState`
        already existed and already knew the answer; the detail screen consulted
        it and the list never did.

        Partitioned on `request.status` rather than on the derived state: the
        only state derivation is `MATCHING → MATCHING_DELAYED`, and neither is
        closed, so the group a row belongs to cannot depend on a clock. That also
        keeps this out of the countdown hook, which lives per-row.
      */}
      {closed.length > 0 ? (
        <section className={open.length > 0 ? "mt-8" : undefined}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Closed · {closed.length}
          </h2>
          <ul className="flex list-none flex-col gap-3 p-0">
            {closed.map((request) => (
              <RequestRow
                key={request.id}
                request={request}
                href={hrefFor(request.id)}
                supportAction={supportActionFor?.(request.id)}
                isClosed
              />
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-6">
        <Button variant="outline" onClick={onRetry}>
          Refresh
        </Button>
      </div>
    </div>
  );
}
