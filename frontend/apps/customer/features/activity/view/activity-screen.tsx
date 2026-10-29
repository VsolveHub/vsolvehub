"use client";

import { describeError, usePagedList } from "@vsolve/query";
import { Button, EmptyState, ErrorState, Skeleton, buttonStyles } from "@vsolve/ui";
import { Search } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { filterBookingsBySearch } from "@/features/activity/model/booking-search";
import {
  BOOKING_STATUS_COPY,
  BOOKING_TYPES,
  BOOKING_TYPE_LABELS,
  bookingStatusHref,
  countByStatus,
  engagementSection,
  groupSection,
  rentalSection,
  requestSection,
  stayEnquirySection,
  stayReservationSection,
  stayVisitSection,
  toBookingStatusTab,
  toBookingType,
  type BookingStatusTab,
  type BookingType,
} from "@/features/activity/model/booking-status";
import { BookingGroupRow } from "@/features/bookings/view/group-list";
import { useBookingGroups, type BookingGroup } from "@/features/bookings/queries";
import { toEngagementLists, type EngagementRowView } from "@/features/engagement/adapters";
import { useEngagements, type Engagement } from "@/features/engagement/queries";
import { EngagementListRow } from "@/features/engagement/view/engagement-list-screen";
import { toRequestRows, type RequestRowView } from "@/features/requirement/adapters";
import { useMyRequests, type RequirementSummary } from "@/features/requirement/queries";
import { RequestRow } from "@/features/requirement/view/requests-list";
import type { RentalBooking } from "@/features/rentals/model";
import { fetchMyRentalsPage } from "@/features/rentals/queries";
import { RentalBookingCard } from "@/features/rentals/view";
import {
  fetchMyStayEnquiriesPage,
  fetchMyStayReservationsPage,
  fetchMyStayVisitsPage,
  type StayEnquiry,
  type StayReservation,
  type StayVisit,
} from "@/features/stays/queries";
import { StayEnquiryCard, StayReservationCard, StayVisitCard } from "@/features/stays/view";
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

type ItemBase = { key: string; type: BookingType; section: BookingStatusTab; sortAt: string };

/**
 * One row of the hub. Services (visits, crew, projects) and, since stays and rentals joined
 * this page, rental bookings and stay visits, enquiries and reservations. Each keeps the card
 * it had on its old page, with every action it had there.
 */
export type BookingItem = ItemBase &
  (
    | { kind: "request"; row: RequestRowView }
    | { kind: "engagement"; row: EngagementRowView }
    | { kind: "group"; group: BookingGroup }
    | { kind: "rental"; booking: RentalBooking }
    | { kind: "stay-enquiry"; enquiry: StayEnquiry }
    | { kind: "stay-visit"; visit: StayVisit }
    | { kind: "stay-reservation"; reservation: StayReservation }
  );

export interface MarketplaceRows {
  rentals: readonly RentalBooking[];
  enquiries: readonly StayEnquiry[];
  visits: readonly StayVisit[];
  reservations: readonly StayReservation[];
}

/** Rentals and stays as hub rows, sorted into the same three tabs as everything else. */
export function marketplaceItems(rows: MarketplaceRows, now: Date = new Date()): BookingItem[] {
  return [
    ...rows.rentals.map(
      (booking): BookingItem => ({
        kind: "rental",
        key: `rental:${booking.id}`,
        type: "rentals",
        section: rentalSection(booking),
        sortAt: booking.created_at,
        booking,
      }),
    ),
    ...rows.visits.map(
      (visit): BookingItem => ({
        kind: "stay-visit",
        key: `stay-visit:${visit.id}`,
        type: "stays",
        section: stayVisitSection(visit, now),
        sortAt: visit.created_at,
        visit,
      }),
    ),
    ...rows.enquiries.map(
      (enquiry): BookingItem => ({
        kind: "stay-enquiry",
        key: `stay-enquiry:${enquiry.id}`,
        type: "stays",
        section: stayEnquirySection(enquiry, now),
        sortAt: enquiry.created_at,
        enquiry,
      }),
    ),
    ...rows.reservations.map(
      (reservation): BookingItem => ({
        kind: "stay-reservation",
        key: `stay-reservation:${reservation.id}`,
        type: "stays",
        section: stayReservationSection(reservation),
        sortAt: reservation.created_at,
        reservation,
      }),
    ),
  ];
}

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
          type: "services",
          section: requestSection(row.status),
          sortAt: source?.last_activity_at ?? "",
          row,
        };
      }),
      ...[...engagementLists.workforce, ...engagementLists.projects].map(
        (row): BookingItem => ({
          kind: "engagement",
          key: `engagement:${row.engagementId}`,
          type: "services",
          section: engagementSection(row),
          sortAt: engagementById.get(row.engagementId)?.created_at ?? "",
          row,
        }),
      ),
      ...groups.map(
        (group): BookingItem => ({
          kind: "group",
          key: `group:${group.id}`,
          type: "services",
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
  // The same cache keys as the old My Rentals and My Stays pages, so a card that refreshes
  // its own list (after paying, accepting a delivery price) refreshes this one.
  const rentalsList = usePagedList(["my-rentals", ""], (cursor) => fetchMyRentalsPage(undefined, cursor));
  const enquiriesList = usePagedList(["my-stay-enquiries"], (cursor) => fetchMyStayEnquiriesPage(cursor));
  const visitsList = usePagedList(["my-stay-visits"], (cursor) => fetchMyStayVisitsPage(cursor));
  const reservationsList = usePagedList(["my-stay-reservations"], (cursor) =>
    fetchMyStayReservationsPage(cursor),
  );
  const marketplaceLists = [rentalsList, enquiriesList, visitsList, reservationsList];

  const searchParams = useSearchParams();
  const selectedTab = toBookingStatusTab(searchParams.get("status"));
  const selectedType = toBookingType(searchParams.get("type"));
  const [searchQuery, setSearchQuery] = useState("");

  const requirements = requirementsQuery.data ?? [];
  const engagements = (engagementsQuery.data?.pages ?? []).flatMap((page) => page.results);
  const groups = (groupsQuery.data?.pages ?? []).flatMap((page) => page.results);
  const services = itemsFrom(requirements, engagements, groups);
  const unknownEngagements = services.unknownEngagements;
  const allItems = [
    ...services.items,
    ...marketplaceItems({
      rentals: rentalsList.items,
      enquiries: enquiriesList.items,
      visits: visitsList.items,
      reservations: reservationsList.items,
    }),
  ].sort(byNewest);
  const typesPresent = BOOKING_TYPES.filter((type) => allItems.some((item) => item.type === type));
  const items = selectedType ? allItems.filter((item) => item.type === selectedType) : allItems;
  const counts = countByStatus(items);
  const tabItems = items.filter((item) => item.section === selectedTab);
  const visibleItems = filterBookingsBySearch(tabItems, searchQuery);
  const isSearching = searchQuery.trim().length > 0;
  const copy = BOOKING_STATUS_COPY[selectedTab];
  const isFirstLoad =
    allItems.length === 0 &&
    (requirementsQuery.isPending ||
      engagementsQuery.isPending ||
      groupsQuery.isPending ||
      marketplaceLists.some((list) => list.isLoading));
  const errors = [
    requirementsQuery.error,
    engagementsQuery.error,
    groupsQuery.error,
    ...marketplaceLists.map((list) => list.error),
  ].filter((error): error is Error => error instanceof Error);
  const hasOlder =
    Boolean(engagementsQuery.hasNextPage || groupsQuery.hasNextPage) ||
    marketplaceLists.some((list) => list.hasMore);
  const loadingOlder =
    engagementsQuery.isFetchingNextPage ||
    groupsQuery.isFetchingNextPage ||
    marketplaceLists.some((list) => list.loadingMore);
  const loadOlder = () => {
    if (engagementsQuery.hasNextPage) void engagementsQuery.fetchNextPage();
    if (groupsQuery.hasNextPage) void groupsQuery.fetchNextPage();
    for (const list of marketplaceLists) if (list.hasMore) list.loadMore();
  };
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
              for (const list of marketplaceLists) void list.refetch();
            }}
          />
        </div>
      ) : null}

      {!isFirstLoad && typesPresent.length > 1 ? (
        <BookingTypeFilter present={typesPresent} selected={selectedType} tab={selectedTab} />
      ) : null}

      {!isFirstLoad ? (
        <BookingStatusTabs selected={selectedTab} counts={counts} type={selectedType} />
      ) : null}

      {!isFirstLoad && !isSearching && tabItems.length === 0 && errors.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title={copy.emptyTitle}
            description={copy.emptyDescription}
            action={
              selectedTab === "active" ? (
                <Link
                  href={BROWSE[selectedType ?? "services"].href}
                  className={buttonStyles({ variant: "outline" })}
                >
                  {BROWSE[selectedType ?? "services"].label}
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

      {hasOlder ? (
        <div className="mt-8">
          <Button variant="outline" loading={loadingOlder} onClick={loadOlder}>
            Show older bookings
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Where an empty tab sends the customer to book one, by the type they are looking at. */
const BROWSE: Record<BookingType, { href: string; label: string }> = {
  services: { href: "/catalog", label: "Browse services" },
  rentals: { href: "/rentals", label: "Browse rentals" },
  stays: { href: "/stays", label: "Browse stays" },
};

const MARKETPLACE_LABEL: Partial<Record<BookingItem["kind"], string>> = {
  rental: "Rental",
  "stay-visit": "Stay visit",
  "stay-enquiry": "Stay enquiry",
  "stay-reservation": "Stay reservation",
};

function BookingTimelineRow({ item }: { item: BookingItem }) {
  switch (item.kind) {
    case "group":
      return <BookingGroupRow group={item.group} />;
    case "engagement":
      return <EngagementListRow row={item.row} />;
    case "request":
      return (
        <RequestRow
          request={item.row}
          href={requestHref(item.row.id)}
          isClosed={item.section === "past" || item.section === "cancelled"}
        />
      );
    default:
      return (
        <li className="flex flex-col gap-1.5" data-testid={`booking-${item.kind}`}>
          {/* Services rows say what they are already; these name their kind in a mixed list. */}
          <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
            {MARKETPLACE_LABEL[item.kind]}
          </span>
          {item.kind === "rental" ? <RentalBookingCard booking={item.booking} /> : null}
          {item.kind === "stay-visit" ? <StayVisitCard visit={item.visit} /> : null}
          {item.kind === "stay-enquiry" ? <StayEnquiryCard enquiry={item.enquiry} /> : null}
          {item.kind === "stay-reservation" ? (
            <StayReservationCard reservation={item.reservation} />
          ) : null}
        </li>
      );
  }
}

/** All · Services · Rentals · Stays. Only the kinds this customer has are offered. */
function BookingTypeFilter({
  present,
  selected,
  tab,
}: {
  present: readonly BookingType[];
  selected: BookingType | null;
  tab: BookingStatusTab;
}) {
  const options: Array<{ type: BookingType | null; label: string }> = [
    { type: null, label: "All" },
    ...present.map((type) => ({ type, label: BOOKING_TYPE_LABELS[type] })),
  ];
  return (
    <nav aria-label="Booking type" className="mt-5 flex flex-wrap gap-2">
      {options.map(({ type, label }) => {
        const active = selected === type;
        return (
          <Link
            key={label}
            href={bookingStatusHref(tab, type)}
            scroll={false}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "inline-flex min-h-9 items-center rounded-full bg-navy-900 px-4 text-sm font-bold text-white"
                : "inline-flex min-h-9 items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold text-text-secondary hover:border-line-strong hover:text-text"
            }
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
