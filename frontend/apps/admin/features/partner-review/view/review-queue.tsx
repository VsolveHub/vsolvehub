"use client";

import { useCurrentSession } from "@vsolve/query";
import { Badge, Button, Card, EmptyState, ErrorState, Spinner } from "@vsolve/ui";
import { Clock, Search, X } from "lucide-react";
import { useState, useMemo } from "react";


import { getApiClient } from "@/lib/api/browser";
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
  { label: "All in-review", filters: {} },
  { label: "Unassigned", filters: { unassigned: true } },
  { label: "Mine", filters: { assignedToMe: true } },
  { label: "Submitted", filters: { status: "SUBMITTED" } },
  { label: "Under review", filters: { status: "UNDER_REVIEW" } },
  { label: "Changes requested", filters: { status: "CHANGES_REQUIRED" } },
];

const STATUS_TONE: Record<string, "info" | "warning" | "success" | "danger" | "neutral"> = {
  SUBMITTED: "info",
  UNDER_REVIEW: "warning",
  CHANGES_REQUIRED: "warning",
  APPROVED: "success",
  DECLINED: "danger",
  SUSPENDED: "danger",
  OFFBOARDED: "neutral",
};

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  CHANGES_REQUIRED: "Changes requested",
  APPROVED: "Approved",
  DECLINED: "Declined",
  SUSPENDED: "Suspended",
  OFFBOARDED: "Offboarded",
};

export function ReviewQueue({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (applicationId: string) => void;
}) {
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState("");
  const session = useCurrentSession(getApiClient());
  const myId = session.data?.user?.id ?? null;

  const filters = FILTER_TABS[tab]?.filters ?? {};
  const queue = useApplicationQueue(filters);

  const allItems = useMemo(
    () => queue.data?.pages.flatMap((page) => page.results) ?? [],
    [queue.data],
  );

  const items = useMemo(() => {
    if (!search.trim()) return allItems;
    const query = search.toLowerCase().trim();
    return allItems.filter((item) =>
      item.display_name.toLowerCase().includes(query),
    );
  }, [allItems, search]);

  return (
    <section aria-labelledby="queue-title" className="p-4 sm:p-5 flex flex-col h-full">
      <div className="flex items-center justify-between gap-2">
        <h2 id="queue-title" className="text-base font-bold text-text flex items-center gap-2">
          <span>Review queue</span>
          <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-semibold text-text-secondary border border-line">
            {allItems.length}
          </span>
        </h2>
      </div>

      {/* Filter Tabs */}
      <div role="tablist" aria-label="Queue filters" className="mt-3 flex flex-wrap gap-1.5">
        {FILTER_TABS.map((entry, index) => {
          const isSelected = tab === index;
          return (
            <button
              key={entry.label}
              role="tab"
              type="button"
              aria-selected={isSelected}
              onClick={() => setTab(index)}
              className={[
                "min-h-11 rounded-control px-3 text-xs font-semibold transition-colors md:min-h-8 md:px-2.5",
                isSelected
                  ? "bg-action-secondary text-action-secondary-text shadow-xs"
                  : "bg-surface text-text-secondary hover:bg-surface-hover hover:text-text border border-line",
              ].join(" ")}
            >
              {entry.label}
            </button>
          );
        })}
      </div>

      {/* Instant Search Filter */}
      <div className="relative mt-3">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-text-muted">
          <Search className="h-3.5 w-3.5" />
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by applicant name…"
          className="h-9 w-full rounded-control border border-line bg-surface pl-8 pr-7 text-xs text-text placeholder:text-text-muted focus:border-action focus:outline-none"
        />
        {search ? (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute inset-y-0 right-0 flex items-center pr-2 text-text-muted hover:text-text"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {/* Content Area */}
      <div className="mt-3 flex-1 overflow-y-auto">
        {queue.isPending ? (
          <p className="mt-4 flex items-center gap-2 text-text-secondary text-sm">
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
            title={search ? "No matches" : "Nothing here"}
            description={
              search
                ? `No applications matched "${search}".`
                : "No applications match this filter right now."
            }
          />
        ) : (
          <div className="flex flex-col gap-2">
            <ul className="flex list-none flex-col gap-2 p-0 m-0">
              {items.map((item) => {
                const isClaimedByMe =
                  item.review_assigned_to_id !== null && item.review_assigned_to_id === myId;
                const isClaimedByOther =
                  item.review_assigned_to_id !== null && !isClaimedByMe;
                const isSelected = selectedId === item.id;

                return (
                  <li key={item.id}>
                    <Card
                      className={[
                        "cursor-pointer p-3.5 transition-all text-left relative",
                        isSelected
                          ? "border-action bg-surface shadow-xs ring-1 ring-action"
                          : "border-line bg-surface hover:bg-surface-hover hover:border-line-strong",
                      ].join(" ")}
                    >
                      <button
                        type="button"
                        onClick={() => onSelect(item.id)}
                        aria-current={isSelected ? "true" : undefined}
                        className="w-full text-left focus:outline-none"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <span className="font-bold text-sm text-text">
                            {item.display_name}
                          </span>

                          {/* Ownership Badge */}
                          {isClaimedByMe ? (
                            <Badge tone="success" className="text-[11px]">
                              Assigned to you
                            </Badge>
                          ) : isClaimedByOther ? (
                            <Badge tone="neutral" className="text-[11px]">
                              Claimed
                            </Badge>
                          ) : (
                            <Badge tone="info" className="text-[11px]">
                              Unassigned
                            </Badge>
                          )}
                        </div>

                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                          {/* Status Badge */}
                          <Badge
                            tone={STATUS_TONE[item.status] ?? "neutral"}
                            className="text-[11px]"
                          >
                            {STATUS_LABELS[item.status] ?? item.status.toLowerCase().replace(/_/g, " ")}
                          </Badge>

                          {/* Submitted Date */}
                          {item.submitted_at ? (
                            <span className="flex items-center gap-1 text-text-secondary text-[11px]">
                              <Clock className="h-3 w-3 text-text-muted" />
                              <time dateTime={item.submitted_at}>
                                {new Intl.DateTimeFormat("en-IN", {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  timeZone: "Asia/Kolkata",
                                }).format(new Date(item.submitted_at))}
                              </time>
                            </span>
                          ) : null}
                        </div>
                      </button>
                    </Card>
                  </li>
                );
              })}
            </ul>

            {queue.hasNextPage ? (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full"
                onClick={() => void queue.fetchNextPage()}
                loading={queue.isFetchingNextPage}
                loadingLabel="Loading more…"
              >
                Load more applications
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

