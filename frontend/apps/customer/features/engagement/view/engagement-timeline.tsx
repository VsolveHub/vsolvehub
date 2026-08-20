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
    <section aria-label="Project activity" className="mt-6">
      <details className="group overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 transition-colors duration-fast hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring sm:px-5 [&::-webkit-details-marker]:hidden">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-sunken text-action-active">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="size-4"><path d="M12 8v4l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-extrabold text-text">Project activity</span>
            <span className="block text-xs font-medium text-text-secondary">
              {events === null ? "Loading the shared record" : `${events.length} recorded update${events.length === 1 ? "" : "s"}`}
            </span>
          </span>
          <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4 shrink-0 text-text-muted transition-transform duration-fast group-open:rotate-180"><path d="m6 9 6 6 6-6" /></svg>
        </summary>
        <div className="border-t border-line bg-canvas px-4 py-4 sm:px-5">
      {query.isPending ? (
        <div aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading the record</span>
          <Skeleton className="h-32 w-full" />
        </div>
      ) : events === null ? (
        <div>
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
        <div>
          <EmptyState
            title="Nothing has happened yet"
            compact
            description="Every step on this job is recorded here as it happens, for both of you."
          />
        </div>
      ) : (
        <Timeline label="Everything that has happened on this job">
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
        </div>
      </details>
    </section>
  );
}
