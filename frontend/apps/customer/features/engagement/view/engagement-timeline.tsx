"use client";

import { describeError } from "@vsolve/query";
import { EmptyState, ErrorState, Skeleton, Timeline, TimelineEvent } from "@vsolve/ui";

import { toEngagementEvents } from "../adapters";
import { useEngagementEvents } from "../queries";

/**
 * Everything that has happened on this job, in order — `M2-FE-512`.
 *
 * Partial service, replacement, refund, dispute and closure in **one**
 * chronological record, which is the whole of the task: not five panels, one
 * feed. `GET /engagements/{id}/events/` is that feed and it is the agreement's
 * own history, read the same way by both parties.
 *
 * ## Nothing on this timeline is synthesised
 *
 * No row inferred from a status, no optimistic entry ahead of a server event.
 * The shared `Timeline` states the rule and this is the screen where breaking it
 * would be most tempting, because a young engagement has two rows on it. Both
 * parties rely on this record during a dispute, and a fabricated event is worse
 * than a gap because it looks like evidence.
 *
 * ## "A clock did this" is the one thing said about the actor
 *
 * `actor_is_system` is published and actor identity deliberately is not — the
 * counterparty's user id is not the caller's business. So a system row says a
 * clock moved it and a human row says a person did, and neither claims to know
 * which person. "Approved" and "approved because the review window closed" are
 * different events, and a timeline that renders them identically is lying about
 * who decided.
 *
 * ## The titles come from the server
 *
 * `reason` is the server's own user-safe words. `reason_code` has **no published
 * vocabulary**, so it is de-slugged as a fallback rather than looked up in a
 * copy table this client authored — a table over an unpublished vocabulary
 * renders "Update" for every code added after this build ships, and does it
 * silently. Logged in §7.
 */

export interface EngagementTimelineProps {
  engagementId: string;
}

export function EngagementTimeline({ engagementId }: EngagementTimelineProps) {
  const query = useEngagementEvents(engagementId);
  const events = query.data === undefined ? null : toEngagementEvents(query.data);

  return (
    <section aria-labelledby="engagement-timeline-heading" className="mt-8">
      <h2 id="engagement-timeline-heading" className="text-lg font-semibold text-text">
        Everything that has happened
      </h2>

      {query.isPending ? (
        <div className="mt-3" aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading the record</span>
          <Skeleton className="h-32 w-full" />
        </div>
      ) : events === null ? (
        <div className="mt-3">
          {(() => {
            const presentation = describeError(query.error, "read");
            return (
              <ErrorState
                title={presentation.title}
                message={`${presentation.message} The record itself is safe — this is only our reading of it.`}
                severity={presentation.severity}
                actionLabel="Try again"
                onAction={() => void query.refetch()}
                reference={presentation.reference}
                inline
              />
            );
          })()}
        </div>
      ) : events.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            title="Nothing has happened yet"
            compact
            description="Every step on this job is recorded here as it happens, for both of you."
          />
        </div>
      ) : (
        <Timeline label="Everything that has happened on this job" className="mt-3">
          {events.map((event) => (
            <TimelineEvent
              key={event.eventId}
              title={event.title}
              timestamp={event.at ?? ""}
              actor={
                event.actorIsSystem
                  ? "Automatic — no one had to do anything"
                  : "Somebody decided this"
              }
            >
              {event.transition !== null ? event.transition : null}
            </TimelineEvent>
          ))}
        </Timeline>
      )}
    </section>
  );
}
