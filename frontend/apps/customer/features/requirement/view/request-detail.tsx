"use client";

import { categorizeError, describeError, useServerCountdown } from "@vsolve/query";
import { Button, ErrorState, Readout, Skeleton, cn } from "@vsolve/ui";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { StatusCard, TapRow, TapRowGroup } from "@/components/patterns";

import type { RequestRowView, TimelineEventView } from "../adapters";
import {
  isClosedState,
  isOurFailure,
  requestState,
  showsQuoteDeadline,
  splitLede,
} from "../model/request-state";
import { REQUEST_STATE_COPY } from "./request-state";
import { RequestTimeline } from "./request-timeline";

/**
 * One request, and everything that has happened to it — `M2-FE-214`, `M2-FE-215`.
 *
 * Two reads, two independent states. The header comes from the requirement and
 * the record comes from the timeline, and they fail separately on purpose: a
 * timeline that will not load must not hide the fact that the request closed
 * three days ago and the Customer is owed a refund.
 *
 * ## The shape, and why the money sits in a rail
 *
 * On a phone this is one column and reads top to bottom in the order somebody
 * asks: what is this, what is happening, what does it cost, what do I do, the
 * facts, the history.
 *
 * Above `lg` that order stops working, because one column on a 1280px display
 * is either a 1200px-wide paragraph or a 700px column with 500px of nothing
 * beside it. So the two questions split: the **left column answers "what is
 * happening"** — status, facts, the money surface, the history — and the
 * **rail answers "what now"** — the number this state turns on, the one
 * control, and the rows somebody opens or changes. The rail is sticky, because
 * the answer to "what now" should not scroll away while you read the thing it
 * is about.
 *
 * Nothing is duplicated between them. The readout and the action live on the
 * status card below `lg` and in the rail above it, never both.
 *
 * ## What the rail may never become
 *
 * A second primary action. Screens whose money surface supplies its own — the
 * A3 and A5 doors inside `children` do — pass none, so a Customer never meets
 * two orange buttons making different promises about one request.
 */

export interface RequestFact {
  label: string;
  value: ReactNode;
  /** Where the row leads, when there is somewhere. Absent renders it inert. */
  href?: string;
}

export interface RequestDetailProps {
  /** Null while the requirement itself is still loading. */
  request: RequestRowView | null;
  isRequestPending: boolean;
  requestError: unknown;

  /**
   * The line under the heading: service, place, when it was sent. Assembled by
   * the route, which is the only layer holding the requirement record.
   */
  subtitle?: string | null;

  /**
   * The facts, as cards in the reading column.
   *
   * Passed in rather than derived here for the same reason the timeline is:
   * this component renders a record it does not read. An empty list renders no
   * cards at all rather than empty ones.
   */
  facts?: readonly RequestFact[];

  /**
   * The rail's rows — where to go, and what can still be changed.
   *
   * Deliberately a different list from `facts`. The cards state what the
   * request *is*; these are things a Customer opens or acts on, and putting one
   * list in both places would be the same sentences twice on one screen.
   */
  railRows?: readonly RequestFact[];

  /**
   * The one thing to do about this request, as a control.
   *
   * Supplied by the route because the destination depends on the archetype, and
   * this feature owns no routes. A state with nothing to do passes nothing.
   */
  primaryAction?: ReactNode;

  events: readonly TimelineEventView[];
  isTimelinePending: boolean;
  timelineError: unknown;

  onRetryRequest: () => void;
  onRetryTimeline: () => void;

  /** Offered inside the state notice where we are the reason there is nothing to show. */
  supportAction?: ReactNode;
  /** What the Customer sent — photos, voice notes. Rendered under the facts. */
  attachments?: ReactNode;
  /**
   * The money surface's own rail, hoisted into this page's rail.
   *
   * The A5 visit plan draws a price rail beside its slot list. Rendered inside
   * the reading column that produced a rail inside a column, beside a page rail
   * that was nearly empty — one page, two rails, and the plan price in the
   * narrower of them. The surface now hands its rail here instead.
   */
  railTop?: ReactNode;
  /**
   * Links to the records this request became — the engagement, the receipt.
   *
   * A slot, because this component knows nothing about engagements and should
   * not learn: it renders a requirement.
   */
  railRecords?: ReactNode;
  /** The child surface owns the active lifecycle visual for this request type. */
  visualLifecycle?: boolean;
  /**
   * The money surface for this request, between the facts and the history.
   *
   * A slot rather than a prop set, because which surface it is depends on the
   * archetype and this component knows nothing about archetypes — it renders a
   * record and a timeline.
   */
  children?: ReactNode;
}

/**
 * How much history shows before the reader asks for the rest.
 *
 * Three, because the useful question a timeline answers on arrival is "what
 * happened most recently", and a request open a fortnight has twenty entries of
 * which nineteen are context. The full list is one tap away; nothing is
 * summarised or dropped.
 */
const TIMELINE_PREVIEW = 3;

function RequestBreadcrumb({ current }: { current: string }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-3 text-sm font-semibold text-text-muted">
      <ol className="flex flex-wrap items-center gap-2">
        <li>
          <Link href="/activity" className="hover:text-text">
            Activity
          </Link>
        </li>
        <li aria-hidden className="text-warm-400">
          ›
        </li>
        <li>
          <Link href="/requests" className="hover:text-text">
            Requests
          </Link>
        </li>
        <li aria-hidden className="text-warm-400">
          ›
        </li>
        <li className="font-extrabold text-text" aria-current="page">
          {current}
        </li>
      </ol>
    </nav>
  );
}

function headlineForRequest(
  request: RequestRowView,
  state: ReturnType<typeof requestState>,
  fallback: string,
): string {
  if (state !== "QUOTES_READY" && state !== "UNLOCKED") return fallback;
  if (request.teaserCount <= 0) return fallback;
  const count = request.teaserCount === 1 ? "One professional has" : `${request.teaserCount} professionals have`;
  return `${count} quoted for this job.`;
}

export function RequestDetail({
  request,
  isRequestPending,
  requestError,
  subtitle = null,
  facts = [],
  railRows = [],
  primaryAction,
  events,
  isTimelinePending,
  timelineError,
  onRetryRequest,
  onRetryTimeline,
  supportAction,
  attachments,
  railTop,
  railRecords,
  visualLifecycle = false,
  children,
}: RequestDetailProps) {
  // Hooks run before any early return, so neither the countdown nor the
  // timeline toggle can be conditional on the request having arrived.
  const countdown = useServerCountdown(request?.deadlineAt ?? null, 60_000);
  const [showAllEvents, setShowAllEvents] = useState(false);

  const shownEvents = showAllEvents ? events : events.slice(0, TIMELINE_PREVIEW);
  const hiddenCount = events.length - shownEvents.length;

  const remainingMs = countdown?.remainingMs ?? null;
  const remainingAnnounce = countdown?.isExpired === false ? countdown.announce : null;

  // Derived during render from the server clock, so the delayed state appears
  // the moment the promise passes rather than on the next refetch.
  const state =
    request === null
      ? null
      : requestState({ status: request.status, quoteDeadlineRemainingMs: remainingMs });
  const copy = state === null ? null : REQUEST_STATE_COPY[state];

  const readout = buildReadout(request, state, remainingAnnounce);
  const hideStateSummary =
    state === "MATCHING" ||
    state === "ENGAGED" ||
    (visualLifecycle && state !== null && !isClosedState(state));
  const hideInlineFacts = state === "MATCHING";
  const hasRailHead = railTop === undefined || railTop === null
    ? readout !== null || primaryAction !== undefined
    : false;

  return (
    <div className="mx-auto w-full max-w-[1170px] px-4 py-5 sm:px-6 lg:px-0">
      <RequestBreadcrumb current={request?.title ?? "Request"} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,788px)_348px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          {isRequestPending || (request === null && requestError === null) ? (
            <div aria-busy="true" aria-live="polite">
              <span className="sr-only">Loading this request</span>
              <Skeleton className="h-28 w-full" />
            </div>
          ) : request === null || state === null || copy === null ? (
            // The header failed and there is nothing to show in its place. The
            // timeline below still renders whatever it has — which is the point
            // of failing them separately — so this is inline rather than a
            // full-screen takeover.
            <RequestHeaderError error={requestError} onRetry={onRetryRequest} />
          ) : (
            <>
              <header className="flex flex-col gap-1">
                <h1 className="text-[1.75rem] font-extrabold leading-tight text-text sm:text-[1.875rem]">
                  {request.title}
                </h1>
                {subtitle !== null ? (
                  <p className="text-sm font-medium text-text-secondary">{subtitle}</p>
                ) : null}
              </header>

              {hideStateSummary ? null : (
                <StatusCard
                  label={copy.label}
                  tone={copy.tone}
                  // One string in the table, split here — see `splitLede`. Three
                  // states used to carry a headline written identically to their
                  // own explanation, and the card printed the sentence twice.
                  headline={headlineForRequest(request, state, splitLede(copy.explanation).lede)}
                  explanation={splitLede(copy.explanation).rest}
                  nextStep={copy.nextStep}
                  // Offered only where we are the reason there is nothing to
                  // show. Attaching it to every state trains people to ignore it
                  // on the two that need it — and puts "talk to us about this"
                  // under a booking that is going perfectly well.
                  supportAction={isOurFailure(state) ? supportAction : undefined}
                  // Both are repeated in the rail above `lg`, so the card drops
                  // them there rather than showing each twice.
                  readout={readout}
                  action={primaryAction}
                  railedAbove="lg"
                  className="min-h-[205px]"
                />
              )}
            </>
          )}

          {/* What is happening and what it costs, between the facts and the
              history. It was below the timeline, which put a list of things
              that have already happened above the only part of the page a
              Customer can act on. */}
          {children}

          {!hideInlineFacts && facts.length > 0 ? (
            <RequestFactsDisclosure facts={facts} />
          ) : null}

          {railRecords ? <div className="lg:hidden">{railRecords}</div> : null}

          {attachments}

          <section
            aria-labelledby="timeline-heading"
            className="rounded-[10px] border border-line bg-surface px-5 py-4 shadow-card"
          >
            <h2 id="timeline-heading" className="text-base font-bold text-text">
              What has happened
            </h2>
            <div className="mt-3">
              <RequestTimeline
                events={shownEvents}
                isPending={isTimelinePending}
                error={timelineError}
                onRetry={onRetryTimeline}
              />
            </div>

            {/* Only when there is something behind it. A control that reveals
                nothing is worse than no control. */}
            {events.length > TIMELINE_PREVIEW ? (
              <div className="mt-3">
                <Button variant="ghost" onClick={() => setShowAllEvents((open) => !open)}>
                  {showAllEvents
                    ? "Show less"
                    : `Show ${hiddenCount} earlier update${hiddenCount === 1 ? "" : "s"}`}
                </Button>
              </div>
            ) : null}
          </section>
        </div>

        {/* The rail. Absent below `lg`, where the status card carries its
            contents — never rendered twice at any width. */}
        <aside className="hidden lg:sticky lg:top-20 lg:flex lg:flex-col lg:gap-4">
          {railTop}

          {hasRailHead ? (
            <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card">
              {readout}
              {primaryAction}
            </div>
          ) : null}

          {railRecords}

          {railRows.length > 0 ? <RequestRailDetails rows={railRows} /> : null}

          {/* The one promise on this page that is about the Customer rather
              than the work. It is true in every state, which is why it sits
              here rather than inside a state's own explanation. */}
          <div className="flex items-start gap-2.5 rounded-card bg-info-surface p-4 ring-1 ring-inset ring-info-line">
            <svg
              viewBox="0 0 24 24"
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth={1.9}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mt-0.5 size-4 shrink-0 text-info-text"
            >
              <path d="M12 3 4 6.5v5c0 4.6 3.2 8.4 8 9.5 4.8-1.1 8-4.9 8-9.5v-5z" />
            </svg>
            <p className="text-pretty text-[0.8125rem] leading-6 text-info-text">
              Nobody sees your phone number or your door number until you choose a
              professional and they confirm.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function RequestFactsDisclosure({ facts }: { facts: readonly RequestFact[] }) {
  return (
    <details className="group lg:hidden">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-[10px] border border-line bg-surface px-4 py-3 shadow-card transition-colors duration-fast hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring [&::-webkit-details-marker]:hidden">
        <FactIcon kind="brief" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-extrabold text-text">Request details</span>
          <span className="block text-xs font-medium text-text-secondary">
            Address, timing and budget
          </span>
        </span>
        <ChevronDown />
      </summary>
      <dl className="mt-2 overflow-hidden rounded-[10px] border border-line bg-surface shadow-card">
        {facts.map((fact, index) => (
          <div
            key={fact.label}
            className={cn(
              "flex min-h-14 items-center gap-3 px-4 py-3",
              index < facts.length - 1 ? "border-b border-line" : null,
            )}
          >
            <FactIcon kind={fact.label.toLowerCase().includes("where") ? "pin" : fact.label.toLowerCase().includes("budget") ? "wallet" : "calendar"} />
            <div className="min-w-0">
              <dt className="text-[0.6875rem] font-bold uppercase text-text-muted">
                {fact.label}
              </dt>
              <dd className="mt-0.5 text-sm font-bold leading-snug text-text">{fact.value}</dd>
            </div>
          </div>
        ))}
      </dl>
    </details>
  );
}

function RequestRailDetails({ rows }: { rows: readonly RequestFact[] }) {
  return (
    <details className="group">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-[10px] border border-line bg-surface px-4 py-3 shadow-card transition-colors duration-fast hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring [&::-webkit-details-marker]:hidden">
        <FactIcon kind="brief" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-extrabold text-text">Request details</span>
          <span className="block text-xs font-medium text-text-secondary">Place, date and changes</span>
        </span>
        <ChevronDown />
      </summary>
      <div className="mt-2">
        <TapRowGroup>
          {rows.map((row, index) => (
            <TapRow
              key={row.label}
              label={row.label}
              value={row.value}
              href={row.href}
              isLast={index === rows.length - 1}
            />
          ))}
        </TapRowGroup>
      </div>
    </details>
  );
}

function FactIcon({ kind }: { kind: "brief" | "pin" | "calendar" | "wallet" }) {
  const path = {
    brief: "M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7m-9 0h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Zm-2 5h14M10 12v2h4v-2",
    pin: "M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Zm-8 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
    calendar: "M7 3v3m10-3v3M5 8h14M6 5h12a1 1 0 0 1 1 1v13H5V6a1 1 0 0 1 1-1Z",
    wallet: "M5 6h12a2 2 0 0 1 2 2v10H5a2 2 0 0 1-2-2V6Zm0 0 10-3v3m1 6h3",
  }[kind];

  return (
    <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-sunken text-text-secondary">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="size-4.5">
        <path d={path} />
      </svg>
    </span>
  );
}

function ChevronDown() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4 shrink-0 text-text-muted transition-transform duration-fast group-open:rotate-180">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/**
 * The number this state turns on, or nothing.
 *
 * Two candidates and they are mutually exclusive by construction: a request
 * still inside its quote promise shows the promise, and one that has quotes
 * shows how many. A state with neither renders no plate rather than an empty
 * one — the plate is the system's signal that a value matters, and one standing
 * over nothing spends that signal.
 */
function buildReadout(
  request: RequestRowView | null,
  state: ReturnType<typeof requestState> | null,
  remainingAnnounce: string | null,
): ReactNode {
  if (request === null || state === null) return null;

  if (showsQuoteDeadline(state) && remainingAnnounce !== null) {
    return (
      <Readout
        label="Quotes promised in"
        // The countdown's coarse phrasing is the right grain for a
        // business-hours promise; the trailing "left" goes because the label
        // already supplies the verb.
        value={remainingAnnounce.replace(/ left$/, "")}
        announce={remainingAnnounce}
        tone="active"
      />
    );
  }

  if (request.teaserCount > 0) {
    return (
      <Readout
        label={request.teaserCount === 1 ? "Quote waiting" : "Quotes waiting"}
        // A count, never an identity. Who quoted is withheld until unlock, and
        // this plate is the first place that rule could be broken.
        value={String(request.teaserCount)}
        tone="active"
      />
    );
  }

  return null;
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
