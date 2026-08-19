"use client";

import { categorizeError, describeError, useServerCountdown } from "@vsolve/query";
import { ErrorState, Skeleton } from "@vsolve/ui";
import type { ReactNode } from "react";

import type { RequestRowView, TimelineEventView } from "../adapters";
import { requestState, showsQuoteDeadline } from "../model/request-state";
import { RequestStateNotice } from "./request-state";
import { RequestTimeline } from "./request-timeline";

/**
 * One request, and everything that has happened to it — `M2-FE-214`, `M2-FE-215`.
 *
 * Two reads, two independent states. The header comes from the requirement and
 * the record comes from the timeline, and they fail separately on purpose: a
 * timeline that will not load must not hide the fact that the request closed
 * three days ago and the Customer is owed a refund. The old shape — one spinner
 * over both — is how the important half waits on the unimportant one.
 *
 * ## Where the state comes from
 *
 * The header renders `RequestStateNotice`, the same component the list row's
 * copy comes from, so "closed because nobody covers this" reads identically in
 * both places. A Customer who sees two different explanations of one request
 * phones support, and they are right to.
 *
 * ## No query here either
 *
 * `GET /requirements/{id}/` and `GET /requirements/{id}/timeline/` are requested
 * in proposal 0012 and do not exist. This takes what a pair of hooks would give
 * it, so integration is a call site rather than a rewrite.
 */

export interface RequestDetailProps {
  /** Null while the requirement itself is still loading. */
  request: RequestRowView | null;
  isRequestPending: boolean;
  requestError: unknown;

  events: readonly TimelineEventView[];
  isTimelinePending: boolean;
  timelineError: unknown;

  onRetryRequest: () => void;
  onRetryTimeline: () => void;

  /** Offered inside the state notice where we are the reason there is nothing to show. */
  supportAction?: ReactNode;
  /**
   * The money surface for this request, placed between the heading and the
   * history.
   *
   * A slot rather than a prop set, because which surface it is depends on the
   * archetype and this component knows nothing about archetypes — it renders a
   * record and a timeline.
   */
  children?: ReactNode;
}

export function RequestDetail({
  request,
  isRequestPending,
  requestError,
  events,
  isTimelinePending,
  timelineError,
  onRetryRequest,
  onRetryTimeline,
  supportAction,
  children,
}: RequestDetailProps) {
  // Hooks run before any early return, so the countdown cannot be conditional on
  // the request having arrived. Null is a legitimate input to it.
  const countdown = useServerCountdown(request?.deadlineAt ?? null, 60_000);

  return (
    // One page width, and the reading column is a constraint *inside* it rather
    // than a narrower container above it. The record used to be `max-w-2xl` and
    // the money surface below it `max-w-6xl`, so the page visibly changed width
    // halfway down and the two halves read as different screens.
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="max-w-3xl">
        <RequestHeader
          request={request}
          isPending={isRequestPending}
          error={requestError}
          onRetry={onRetryRequest}
          remainingMs={countdown?.remainingMs ?? null}
          remainingAnnounce={countdown?.isExpired === false ? countdown.announce : null}
          supportAction={supportAction}
        />
      </div>

      {/* What is happening and what it costs, between the heading and the
          history. It was below the timeline, which put a list of things that
          have already happened above the only part of the page a Customer can
          act on. */}
      {children}

      <section aria-labelledby="timeline-heading" className="max-w-3xl">
        <h2 id="timeline-heading" className="text-lg font-semibold text-text">
          What has happened
        </h2>
        <div className="mt-3">
          <RequestTimeline
            events={events}
            isPending={isTimelinePending}
            error={timelineError}
            onRetry={onRetryTimeline}
          />
        </div>
      </section>
    </div>
  );
}

function RequestHeader({
  request,
  isPending,
  error,
  onRetry,
  remainingMs,
  remainingAnnounce,
  supportAction,
}: {
  request: RequestRowView | null;
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
  remainingMs: number | null;
  remainingAnnounce: string | null;
  supportAction?: ReactNode;
}) {
  if (isPending || (request === null && error === null)) {
    return (
      <div aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading this request</span>
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  if (request === null) {
    // The header failed and there is nothing to show in its place. The timeline
    // below still renders whatever it has — which is the point of failing them
    // separately — so this is inline rather than a full-screen takeover.
    return <RequestHeaderError error={error} onRetry={onRetry} />;
  }

  const state = requestState({ status: request.status, quoteDeadlineRemainingMs: remainingMs });

  return (
    <header>
      <h1 className="text-xl font-semibold text-text">{request.title}</h1>
      {request.lifecycleExplanation !== null ? (
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          {request.lifecycleExplanation}
        </p>
      ) : null}

      <div className="mt-4">
        <RequestStateNotice state={state} supportAction={supportAction} />
      </div>

      {showsQuoteDeadline(state) && remainingAnnounce !== null ? (
        <p className="mt-2 text-sm text-text-secondary">
          Quotes promised in{" "}
          <span className="font-medium text-text">
            {remainingAnnounce.replace(/ left$/, "")}
          </span>
        </p>
      ) : null}

      {/* A count, never an identity. Who quoted is withheld until unlock. */}
      {request.teaserCount > 0 ? (
        <p className="mt-2 text-sm text-text">
          {request.teaserCount === 1 ? "1 quote waiting" : `${request.teaserCount} quotes waiting`}
        </p>
      ) : null}
    </header>
  );
}

function RequestHeaderError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const presentation = describeError(error, "read");
  const retryable = categorizeError(error) !== "forbidden";

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
