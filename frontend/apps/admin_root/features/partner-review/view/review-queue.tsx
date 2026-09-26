"use client";

import { Badge, Button, Card, EmptyState, ErrorState, Spinner } from "@vsolve/ui";
import { useState } from "react";

import { useApplicationQueue, type QueueFilters } from "../queries";

/**
 * The work a reviewer has to get through.
 *
 * ## Cursor pages, not offsets
 *
 * Applications are submitted while a reviewer is working, so an offset would
 * silently skip or repeat rows as the list shifts underneath them. The contract
 * publishes cursors and this follows them, appending pages rather than replacing
 * the view — a reviewer who has scrolled does not lose their place.
 *
 * ## Ownership is shown, not implied
 *
 * Every row says whether someone holds it. Two reviewers opening the same
 * application is the failure this list exists to prevent, and it can only do
 * that if "claimed by someone else" is visible before the click.
 */

const FILTER_TABS: { label: string; filters: QueueFilters }[] = [
  { label: "Unassigned", filters: { unassigned: true } },
  { label: "Mine", filters: { assignedToMe: true } },
  { label: "Submitted", filters: { status: "SUBMITTED" } },
  { label: "Changes required", filters: { status: "CHANGES_REQUIRED" } },
];

export function ReviewQueue({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (applicationId: string) => void;
}) {
  const [tab, setTab] = useState(0);
  const filters = FILTER_TABS[tab]?.filters ?? {};
  const queue = useApplicationQueue(filters);

  const items = queue.data?.pages.flatMap((page) => page.results) ?? [];

  return (
    <section aria-labelledby="queue-title">
      <h2 id="queue-title" className="text-base font-bold text-text">
        Review queue
      </h2>

      <div role="tablist" aria-label="Queue filters" className="mt-3 flex flex-wrap gap-2">
        {FILTER_TABS.map((entry, index) => (
          <button
            key={entry.label}
            role="tab"
            type="button"
            aria-selected={tab === index}
            onClick={() => setTab(index)}
            className={[
              "min-h-11 rounded-control px-3 text-sm font-semibold",
              tab === index
                ? "bg-action-secondary text-action-secondary-text"
                : "bg-surface text-text-secondary hover:bg-surface-hover",
            ].join(" ")}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {queue.isPending ? (
        <p className="mt-4 flex items-center gap-2 text-text-secondary">
          <Spinner size="sm" />
          Loading the queue…
        </p>
      ) : queue.isError ? (
        <ErrorState
          className="mt-4"
          title="We could not load the queue"
          message="Nothing has changed. Check your connection and try again."
          actionLabel="Try again"
          onAction={() => void queue.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          className="mt-4"
          compact
          title="Nothing here"
          description="No applications match this filter right now."
        />
      ) : (
        <>
          <ul className="mt-4 flex list-none flex-col gap-2 p-0">
            {items.map((item) => {
              const claimed = item.review_assigned_to_id !== null;

              return (
                <li key={item.id}>
                  <Card
                    className={[
                      "cursor-pointer p-4 transition-colors hover:bg-surface-hover",
                      selectedId === item.id ? "border-action" : "",
                    ].join(" ")}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(item.id)}
                      aria-current={selectedId === item.id ? "true" : undefined}
                      className="w-full text-left"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-text">{item.display_name}</span>
                        <Badge tone={claimed ? "neutral" : "info"}>
                          {claimed ? "Claimed" : "Unassigned"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-text-secondary">
                        {item.status.toLowerCase().replace(/_/g, " ")}
                        {item.submitted_at ? (
                          <>
                            {" · submitted "}
                            <time dateTime={item.submitted_at}>
                              {new Intl.DateTimeFormat("en-IN", {
                                dateStyle: "medium",
                                timeZone: "Asia/Kolkata",
                              }).format(new Date(item.submitted_at))}
                            </time>
                          </>
                        ) : null}
                      </p>
                    </button>
                  </Card>
                </li>
              );
            })}
          </ul>

          {queue.hasNextPage ? (
            <Button
              variant="outline"
              className="mt-3"
              onClick={() => void queue.fetchNextPage()}
              loading={queue.isFetchingNextPage}
              loadingLabel="Loading more"
            >
              Load more
            </Button>
          ) : null}
        </>
      )}
    </section>
  );
}
