"use client";

import { describeError, queryKeys } from "@vsolve/query";
import { Button, EmptyState, ErrorState, Skeleton, buttonStyles } from "@vsolve/ui";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import type { ReactNode } from "react";

import {
  BookingListBody,
  CatalogServiceThumbRow,
  formatBookingWhen,
} from "@/features/catalog/components/catalog-service-thumb";
import { serviceSlugFromLineCode } from "@/features/catalog/service-cover";
import { Money } from "@/features/checkout/view/money";

import {
  isCursorContractFailure,
  isCursorInvalid,
  useBookingGroups,
  type BookingGroup,
} from "../queries";
import { GroupStatusBadge } from "./group-status";

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

function primaryServiceLine(group: BookingGroup) {
  const first = group.units[0];
  if (!first) return null;
  return first.lines.find((line) => line.kind === "SERVICE") ?? first.lines[0] ?? null;
}

const HIDE_PRICE_STATUSES = new Set<BookingGroup["status"]>([
  "REPLAN_REQUIRED",
  "CANCELLED",
  "EXPIRED",
  "FAILED",
]);

function groupListLine(group: BookingGroup): { text: ReactNode; action: boolean } | null {
  if (group.recovery_action === "REPLAN") {
    return { text: "Choose a new arrangement", action: true };
  }
  if (group.recovery_action === "PAYMENT_REQUIRED") {
    return { text: "Payment is needed to confirm", action: true };
  }
  const first = group.units[0];
  if (first === undefined) return null;
  return {
    text: <time dateTime={first.starts_at}>{formatBookingWhen(first.starts_at)}</time>,
    action: false,
  };
}

export function BookingGroupRow({ group }: { group: BookingGroup }) {
  const first = group.units[0];
  const serviceLine = primaryServiceLine(group);
  const serviceName = serviceLine?.label ?? "Booking";
  const line = groupListLine(group);
  const showPrice =
    first !== undefined &&
    first.total.amount_paise > 0 &&
    !HIDE_PRICE_STATUSES.has(group.status);

  return (
    <li>
      <Link
        href={`/bookings/${group.id}`}
        className="block rounded-card border border-line bg-surface p-4 hover:border-warm-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
      >
        <CatalogServiceThumbRow
          hint={{
            slug: serviceLine ? serviceSlugFromLineCode(serviceLine.code) : null,
            name: serviceName,
          }}
        >
          <BookingListBody
            title={serviceName}
            badge={<GroupStatusBadge group={group} />}
            detail={line?.text}
            detailAction={line?.action === true}
            price={
              showPrice ? (
                <Money
                  value={first.total}
                  className="shrink-0 font-semibold tabular-nums text-navy-900"
                />
              ) : undefined
            }
          />
        </CatalogServiceThumbRow>
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
          <Skeleton key={index} className="h-36 w-full" />
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
          <BookingGroupRow key={group.id} group={group} />
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
