"use client";

import { describeError, queryKeys } from "@vsolve/query";
import { Button, EmptyState, ErrorState, Skeleton, buttonStyles } from "@vsolve/ui";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";

import { Money } from "@/features/booking/group/view/money";

import {
  isCursorContractFailure,
  isCursorInvalid,
  useBookingGroups,
  type BookingGroup,
} from "../queries";
import { GROUP_STATUS_MEANING, GroupStatusBadge } from "./group-status";

/**
 * The customer's bookings.
 *
 * A list, not a dashboard: it exists so someone can find the booking they want
 * to look at, and the detail view is what observes a live one. Nothing here
 * polls — a list that refreshed itself under a reading finger would move the row
 * being tapped.
 *
 * Further pages load only when the customer asks ("Load more"). Uncontrolled
 * infinite scroll would race against focus and against deciding which row was
 * tapped while the list grew underneath.
 */

function totalOf(group: BookingGroup) {
  // Deliberately not summed. Each unit carries its own server-calculated total
  // and there is no group total on this projection, so the row shows the count
  // and the per-visit money lives in the detail. Adding the units here would be
  // frontend financial arithmetic on data that has a fee allocated across it.
  return group.units.length;
}

function GroupRow({ group }: { group: BookingGroup }) {
  const first = group.units[0];

  return (
    <li>
      <Link
        href={`/bookings/${group.id}`}
        className="block rounded-card border border-line bg-surface p-4 hover:border-warm-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-text">
            {totalOf(group)} {totalOf(group) === 1 ? "visit" : "visits"}
          </h2>
          <GroupStatusBadge group={group} />
        </div>

        {first ? (
          <p className="mt-1 text-sm text-text-secondary">
            {first.lines.map((line) => line.label).join(", ")}
          </p>
        ) : null}

        <p className="mt-2 text-sm text-text-secondary">
          {GROUP_STATUS_MEANING[group.status]}
        </p>

        {first ? (
          <p className="mt-2 flex justify-between text-sm text-text-secondary">
            <span>
              First visit{" "}
              <time dateTime={first.starts_at}>
                {new Date(first.starts_at).toLocaleString("en-IN", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </time>
            </span>
            <Money value={first.total} className="tabular-nums" />
          </p>
        ) : null}
      </Link>
    </li>
  );
}

export function BookingGroupList() {
  const queryClient = useQueryClient();
  const groupsQuery = useBookingGroups();

  function restartFromPageOne() {
    void queryClient.resetQueries({ queryKey: queryKeys.booking.groups() });
  }

  if (groupsQuery.isPending) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  const groups = groupsQuery.data?.pages.flatMap((page) => page.results) ?? [];
  const listError = groupsQuery.error;

  // A failed next-page fetch still has page-one data — keep the rows and offer
  // recovery. Only a failed first page is a full-screen error.
  if (groupsQuery.isError && groups.length === 0) {
    const restartable =
      isCursorInvalid(listError) || isCursorContractFailure(listError);

    return (
      <ErrorState
        title={
          restartable
            ? "We could not continue this list"
            : "We could not load your bookings"
        }
        message={
          restartable
            ? "Start again from the beginning — older pages are still available once you do."
            : describeError(listError, "read").message
        }
        actionLabel={restartable ? "Start from the beginning" : "Try again"}
        onAction={() => {
          if (restartable) {
            restartFromPageOne();
            return;
          }
          void groupsQuery.refetch();
        }}
      />
    );
  }

  if (groups.length === 0) {
    return (
      <EmptyState
        title="No bookings yet"
        description="When you book a service it will appear here, with the progress of every visit."
        action={
          <Link href="/catalog" className={buttonStyles()}>
            Browse services
          </Link>
        }
      />
    );
  }

  return (
    <div>
      <ul className="flex flex-col gap-3">
        {groups.map((group) => (
          <GroupRow key={group.id} group={group} />
        ))}
      </ul>

      {groupsQuery.hasNextPage ? (
        <div className="mt-4">
          <Button
            variant="outline"
            onClick={() => void groupsQuery.fetchNextPage()}
            loading={groupsQuery.isFetchingNextPage}
            loadingLabel="Loading more bookings"
            disabled={groupsQuery.isFetchingNextPage}
          >
            Load more
          </Button>
        </div>
      ) : null}

      {groupsQuery.isFetchNextPageError && listError ? (
        <>
          <p className="mt-3 text-sm text-critical" role="alert">
            {isCursorInvalid(listError) || isCursorContractFailure(listError)
              ? "We could not load the next page. Start from the beginning to try again."
              : describeError(listError, "read").message}
          </p>
          {isCursorInvalid(listError) || isCursorContractFailure(listError) ? (
            <div className="mt-3">
              <Button variant="outline" onClick={restartFromPageOne}>
                Start from the beginning
              </Button>
            </div>
          ) : null}
        </>
      ) : null}

      <div className="mt-6">
        {/* Disabled for *any* fetch, including a next-page one. A refetch that
            overlaps a cursor traversal races two writers into the same page
            list, and the loser silently decides which rows survive. */}
        <Button variant="outline" onClick={() => void groupsQuery.refetch()} disabled={groupsQuery.isFetching}>
          Refresh
        </Button>
      </div>
    </div>
  );
}
