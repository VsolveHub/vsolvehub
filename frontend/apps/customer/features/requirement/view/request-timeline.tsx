"use client";

import { categorizeError, describeError } from "@vsolve/query";
import { EmptyState, ErrorState, Skeleton, Timeline, TimelineEvent } from "@vsolve/ui";
import type { TimelineTone } from "@vsolve/ui";

import type { TimelineEventView } from "../adapters";
import type { TimelineEventKind } from "../model/timeline";

/**
 * The request detail timeline — `M2-FE-214`.
 *
 * Requirement, matching, invitations **at aggregate level**, questions, site
 * visits, quote delivery and recovery, in one chronological record.
 *
 * ## Invitations are a count, and that is a privacy rule not a layout choice
 *
 * Before unlock the Customer may know that professionals were invited and how
 * many. They may not know which ones. That is the entire point of the teaser
 * design — identity is the thing the INR 149 buys — and a timeline is the
 * easiest place to leak it, because "5 vendors invited" and "Ravi, Sunil and 3
 * others invited" are the same sentence to whoever writes the serializer.
 *
 * The enforcement is not here. It is `DETAIL_ALLOWLIST` in `../adapters/`, which
 * drops every wire field this build has not reviewed, so a serializer that
 * starts sending names cannot render them. This component can only display what
 * survived that filter.
 *
 * ## An unrecognised event is drawn, not dropped
 *
 * Proposal 0012 is explicit and it is the opposite of the workspace-key rule: an
 * unknown *navigation target* renders nothing, an unknown *record entry* renders
 * as a neutral dated row. Here the record is the point. Both parties rely on it
 * during a dispute, and a silent gap in it looks like nothing happened.
 *
 * ## Nothing on this timeline is synthesised
 *
 * No "matching started" inferred from a status, no optimistic row ahead of a
 * server event. The shared `Timeline` documents the rule; this is the screen
 * where breaking it would be most tempting, because `MATCHING` with one event
 * looks sparse. A sparse honest record beats a full invented one.
 */

interface EventCopy {
  title: string;
  tone: TimelineTone;
}

/**
 * Keyed on the *client's* union, so adding a kind the build claims to know
 * without giving it words is a type error rather than an "Update" row nobody
 * notices in production.
 */
const EVENT_COPY: Record<TimelineEventKind, EventCopy> = {
  REQUIREMENT_SUBMITTED: { title: "You sent this request", tone: "active" },
  REQUIREMENT_EDITED: { title: "You changed this request", tone: "neutral" },
  MATCHING_WAVE_SENT: { title: "We invited professionals", tone: "neutral" },
  QUESTION_ASKED: { title: "A professional asked a question", tone: "warning" },
  QUESTION_ANSWERED: { title: "You answered", tone: "neutral" },
  SITE_VISIT_REQUESTED: { title: "A site visit was requested", tone: "neutral" },
  SITE_VISIT_SCHEDULED: { title: "A site visit was scheduled", tone: "success" },
  QUOTE_RECEIVED: { title: "A quote arrived", tone: "success" },
  SLA_BREACHED: { title: "We missed our quote deadline", tone: "danger" },
  REQUIREMENT_CLOSED: { title: "This request was closed", tone: "neutral" },
};

/** The row an event type this build does not know about gets. Dated, neutral, present. */
const UNKNOWN_EVENT: EventCopy = { title: "Update", tone: "neutral" };

function formatAt(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * The detail line under an event, built only from allowlisted fields.
 *
 * Returns null rather than an empty string when there is nothing to say, so the
 * shared `TimelineEvent` skips the block entirely instead of drawing an empty
 * one.
 */
function detailLine(event: TimelineEventView): string | null {
  switch (event.type) {
    case "MATCHING_WAVE_SENT": {
      const invited = event.detail.vendors_invited;
      if (typeof invited !== "number") return null;
      return invited === 1
        ? "1 professional invited"
        : `${invited} professionals invited`;
    }

    case "QUESTION_ASKED":
    case "QUESTION_ANSWERED": {
      const body = event.detail.body;
      return typeof body === "string" && body.length > 0 ? body : null;
    }

    case "SITE_VISIT_SCHEDULED": {
      const at = event.detail.scheduled_for;
      return typeof at === "string" ? `For ${formatAt(at)}` : null;
    }

    default:
      return null;
  }
}

export interface RequestTimelineProps {
  events: readonly TimelineEventView[];
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
}

export function RequestTimeline({ events, isPending, error, onRetry }: RequestTimelineProps) {
  if (isPending) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading what has happened</span>
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (error !== null && error !== undefined && events.length === 0) {
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
        inline
      />
    );
  }

  if (events.length === 0) {
    return (
      <EmptyState
        title="Nothing has happened yet"
        description="Everything we do with this request is recorded here, as it happens."
        compact
      />
    );
  }

  return (
    <div>
      {/* A failed refresh with a record already on screen keeps the record and
          says it may be incomplete. Silently showing a partial history in a
          document people argue from is worse than saying it is partial. */}
      {error !== null && error !== undefined ? (
        <div className="mb-3">
          <ErrorState
            title="This may not be up to date"
            message={describeError(error, "read").message}
            severity="warning"
            actionLabel="Try again"
            onAction={onRetry}
            inline
          />
        </div>
      ) : null}

      <Timeline label="What has happened with this request">
        {events.map((event) => {
          const copy = event.type === null ? UNKNOWN_EVENT : EVENT_COPY[event.type];
          const detail = detailLine(event);

          return (
            <TimelineEvent
              key={event.id}
              title={copy.title}
              tone={copy.tone}
              timestamp={formatAt(event.at)}
            >
              {detail}
            </TimelineEvent>
          );
        })}
      </Timeline>
    </div>
  );
}
