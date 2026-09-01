"use client";

import { describeError } from "@vsolve/query";
import { Button, EmptyState, ErrorState, Skeleton, buttonStyles } from "@vsolve/ui";
import { Search } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { filterBookingsBySearch } from "@/features/activity/model/booking-search";
import {
  BOOKING_STATUS_COPY,
  countByStatus,
  engagementSection,
  groupSection,
  requestSection,
  toBookingStatusTab,
  type BookingStatusTab,
} from "@/features/activity/model/booking-status";
import { BookingGroupRow } from "@/features/bookings/view/group-list";
import { useBookingGroups, type BookingGroup } from "@/features/bookings/queries";
import { toEngagementLists, type EngagementRowView } from "@/features/engagement/adapters";
import { useEngagements, type Engagement } from "@/features/engagement/queries";
import { EngagementListRow } from "@/features/engagement/view/engagement-list-screen";
import { toRequestRows, type RequestRowView } from "@/features/requirement/adapters";
import { useMyRequests, type RequirementSummary } from "@/features/requirement/queries";
import { RequestRow } from "@/features/requirement/view/requests-list";
import { requestHref } from "@/lib/routes";

import { BookingStatusTabs } from "./booking-status-tabs";
import { BookingsSearchField } from "./bookings-search-field";

export {
  engagementSection,
  groupSection,
  requestSection,
} from "@/features/activity/model/booking-status";
export type { BookingStatusTab as BookingSection } from "@/features/activity/model/booking-status";

export function requestBelongsInBookings(requirement: RequirementSummary): boolean {
  return requirement.engagement_id === null;
}

type BookingItem =
  | { kind: "request"; key: string; section: BookingStatusTab; sortAt: string; row: RequestRowView }
  | { kind: "engagement"; key: string; section: BookingStatusTab; sortAt: string; row: EngagementRowView }
  | { kind: "group"; key: string; section: BookingStatusTab; sortAt: string; group: BookingGroup };

function byNewest(a: BookingItem, b: BookingItem): number {
  return Date.parse(b.sortAt) - Date.parse(a.sortAt);
}

function itemsFrom(
  requirements: readonly RequirementSummary[],
  engagements: readonly Engagement[],
  groups: readonly BookingGroup[],
): { items: BookingItem[]; unknownEngagements: number } {
  const requestRows = toRequestRows(
    requirements.filter(requestBelongsInBookings),
    (requirement) => requirement.service_name,
  );
  const requirementById = new Map(requirements.map((requirement) => [requirement.id, requirement]));
  const engagementLists = toEngagementLists(engagements);
  const engagementById = new Map(engagements.map((engagement) => [engagement.id, engagement]));

  return {
    items: [
      ...requestRows.map((row): BookingItem => {
        const source = requirementById.get(row.id);
        return {
          kind: "request",
          key: `request:${row.id}`,
          section: requestSection(row.status),
          sortAt: source?.last_activity_at ?? "",
          row,
        };
      }),
      ...[...engagementLists.workforce, ...engagementLists.projects].map(
        (row): BookingItem => ({
          kind: "engagement",
          key: `engagement:${row.engagementId}`,
          section: engagementSection(row),
          sortAt: engagementById.get(row.engagementId)?.created_at ?? "",
          row,
        }),
      ),
      ...groups.map(
        (group): BookingItem => ({
          kind: "group",
          key: `group:${group.id}`,
          section: groupSection(group),
          sortAt: group.updated_at,
          group,
        }),
      ),
    ].sort(byNewest),
    unknownEngagements: engagementLists.undescribable.length,
  };
}

export function ActivityScreen() {
  const requirementsQuery = useMyRequests();
  const engagementsQuery = useEngagements();
  const groupsQuery = useBookingGroups();
  const searchParams = useSearchParams();
  const selectedTab = toBookingStatusTab(searchParams.get("status"));
  const [searchQuery, setSearchQuery] = useState("");

  const requirements = requirementsQuery.data ?? [];
  const engagements = (engagementsQuery.data?.pages ?? []).flatMap((page) => page.results);
  const groups = (groupsQuery.data?.pages ?? []).flatMap((page) => page.results);
  const { items, unknownEngagements } = itemsFrom(requirements, engagements, groups);
  const counts = countByStatus(items);
  const tabItems = items.filter((item) => item.section === selectedTab);
  const visibleItems = filterBookingsBySearch(tabItems, searchQuery);
  const isSearching = searchQuery.trim().length > 0;
  const copy = BOOKING_STATUS_COPY[selectedTab];
  const isFirstLoad =
    items.length === 0 &&
    (requirementsQuery.isPending || engagementsQuery.isPending || groupsQuery.isPending);
  const errors = [requirementsQuery.error, engagementsQuery.error, groupsQuery.error].filter(
    (error): error is Error => error instanceof Error,
  );
  const hasDirectPay = items.some(
    (item) => item.kind === "engagement" && item.row.mode === "lead_only",
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-6">
        <h1 className="shrink-0 text-2xl font-extrabold tracking-tight text-navy-900 sm:text-3xl">
          Your Bookings
        </h1>
        <div className="w-full min-w-0 md:max-w-md md:flex-1 lg:max-w-lg">
          <BookingsSearchField value={searchQuery} onChange={setSearchQuery} />
        </div>
      </div>

      {hasDirectPay ? (
        <details className="mt-4 rounded-control border border-line bg-surface px-4 py-3 text-sm text-text-secondary shadow-card transition-all">
          <summary className="cursor-pointer font-bold text-navy-900 flex items-center gap-2">
            <span>ℹ️</span> How payments work
          </summary>
          <p className="mt-2 leading-relaxed text-xs sm:text-sm">
            Some crew bookings are paid directly to the professional. Vsolve does not hold those
            service payments; projects funded through Vsolve show their funded amount on the card.
          </p>
        </details>
      ) : null}

      {isFirstLoad ? (
        <div className="mt-6 flex flex-col gap-3" aria-label="Loading your bookings">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-36 w-full rounded-card" />
          ))}
        </div>
      ) : null}

      {errors.length > 0 ? (
        <div className="mt-6">
          <ErrorState
            inline
            title="Some bookings could not be loaded"
            message={describeError(errors[0], "read").message}
            actionLabel="Try again"
            onAction={() => {
              void requirementsQuery.refetch();
              void engagementsQuery.refetch();
              void groupsQuery.refetch();
            }}
          />
        </div>
      ) : null}

      {!isFirstLoad ? <BookingStatusTabs selected={selectedTab} counts={counts} /> : null}

      {!isFirstLoad && !isSearching && tabItems.length === 0 && errors.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title={copy.emptyTitle}
            description={copy.emptyDescription}
            action={
              selectedTab === "active" ? (
                <Link href="/catalog" className={buttonStyles({ variant: "outline" })}>
                  Browse services
                </Link>
              ) : undefined
            }
          />
        </div>
      ) : null}

      {!isFirstLoad && isSearching && visibleItems.length === 0 ? (
        <div className="mt-8" role="status">
          <EmptyState
            title="No bookings found"
            description="Try searching with a different service name, booking ID, or keyword."
            icon={<Search className="size-8" strokeWidth={1.6} />}
          />
        </div>
      ) : null}

      {!isFirstLoad && visibleItems.length > 0 ? (
        <section
          id="booking-status-panel"
          role="tabpanel"
          aria-labelledby={`booking-tab-${selectedTab}`}
          className="mt-5 sm:mt-6"
        >
          <ul className="flex list-none flex-col gap-3.5 p-0">
            {visibleItems.map((item) => (
              <BookingTimelineRow key={item.key} item={item} />
            ))}
          </ul>
        </section>
      ) : null}

      {unknownEngagements > 0 ? (
        <p className="mt-6 rounded-control border border-line bg-surface-sunken p-4 text-sm leading-6 text-text-secondary">
          {unknownEngagements === 1
            ? "One agreement uses"
            : `${unknownEngagements} agreements use`} a payment type this app cannot describe yet.
          Contact support to open the record safely.
        </p>
      ) : null}

      {engagementsQuery.hasNextPage || groupsQuery.hasNextPage ? (
        <div className="mt-8 flex flex-wrap gap-3">
          {engagementsQuery.hasNextPage ? (
            <Button
              variant="outline"
              loading={engagementsQuery.isFetchingNextPage}
              onClick={() => void engagementsQuery.fetchNextPage()}
            >
              Show older work
            </Button>
          ) : null}
          {groupsQuery.hasNextPage ? (
            <Button
              variant="outline"
              loading={groupsQuery.isFetchingNextPage}
              onClick={() => void groupsQuery.fetchNextPage()}
            >
              Show older bookings
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function BookingTimelineRow({ item }: { item: BookingItem }) {
  if (item.kind === "group") return <BookingGroupRow group={item.group} />;
  if (item.kind === "engagement") return <EngagementListRow row={item.row} />;
  return (
    <RequestRow
      request={item.row}
      href={requestHref(item.row.id)}
      isClosed={item.section === "past" || item.section === "cancelled"}
    />
  );
}
