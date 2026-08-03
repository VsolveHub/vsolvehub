"use client";

import { describeError } from "@vsolve/query";
import { Button, EmptyState, ErrorState, Skeleton, buttonStyles } from "@vsolve/ui";
import Link from "next/link";

import { Money } from "@/features/booking/group/view/money";

import { useBookingGroups, type BookingGroup } from "../queries";
import { GROUP_STATUS_MEANING, GroupStatusBadge } from "./group-status";

/**
 * The customer's bookings.
 *
 * A list, not a dashboard: it exists so someone can find the booking they want
 * to look at, and the detail view is what observes a live one. Nothing here
 * polls — a list that refreshed itself under a reading finger would move the row
 * being tapped.
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
  const groupsQuery = useBookingGroups();

  if (groupsQuery.isPending) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (groupsQuery.isError) {
    return (
      <ErrorState
        title="We could not load your bookings"
        message={describeError(groupsQuery.error, "read").message}
        actionLabel="Try again"
        onAction={() => void groupsQuery.refetch()}
      />
    );
  }

  const page = groupsQuery.data;
  const groups = page?.results ?? [];

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

      {/*
        The published list paginates with a cursor at runtime but exposes no
        `cursor` query parameter, so page two cannot be requested through the
        generated client — see proposal 0008. Saying the list is truncated is
        honest; presenting it as complete would not be, and a "Show more" button
        that cannot work would be worse than either.
      */}
      {page?.next ? (
        <p className="mt-4 text-sm text-text-secondary">
          Showing your most recent bookings. Older ones are not listed here yet.
        </p>
      ) : null}

      <div className="mt-6">
        <Button variant="outline" onClick={() => void groupsQuery.refetch()} disabled={groupsQuery.isFetching}>
          Refresh
        </Button>
      </div>
    </div>
  );
}
