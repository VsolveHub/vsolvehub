// Ported from frontend/apps/customer/features/activity/view/activity-screen.tsx
import { describeError, usePagedList, useServerCountdown } from "@vsolve/query/native";
import { Badge, Button, COLOR_TOKENS, EmptyState, ErrorState, Input, Skeleton, Text, buttonStyles } from "@vsolve/mobile-ui";
import { type Href, Link, useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Search, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useIsDesktop } from "@/lib/responsive";

import { filterBookingsBySearch } from "@/features/activity/model/booking-search";
import {
  BOOKING_STATUS_COPY,
  BOOKING_STATUS_TABS,
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
import { formatBookingWhen } from "@/features/bookings/view/booking-format";
import { GroupStatusBadge } from "@/features/bookings/view/group-status";
import { useBookingGroups, type BookingGroup } from "@/features/bookings/queries";
import { toEngagementLists, type EngagementRowView } from "@/features/engagement/adapters";
import { EngagementStatusBadge, nounsFor, stageKindCopy } from "@/features/engagement/view/engagement-status";
import { useEngagements, type Engagement } from "@/features/engagement/queries";
import { Money } from "@/features/payment/view/money";
import { toRequestRows, type RequestRowView } from "@/features/requirement/adapters";
import { requestState, showsQuoteDeadline, type RequestState } from "@/features/requirement/model/request-state";
import { useMyRequests, type RequirementSummary } from "@/features/requirement/queries";
import { RequestStateBadge } from "@/features/requirement/view/request-state";
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
import { CatalogServiceThumbRow } from "@/features/catalog/view/catalog-service-thumb";
import { serviceSlugFromLineCode } from "@/features/catalog/service-cover";

export function requestBelongsInBookings(requirement: RequirementSummary): boolean {
  return requirement.engagement_id === null;
}

type ItemBase = { key: string; type: BookingType; section: BookingStatusTab; sortAt: string };

/**
 * One row of the hub. Services (visits, crew, projects) and, since stays and rentals joined
 * this page, rental bookings and stay visits, enquiries and reservations.
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
        sortAt: booking.created_at ?? "",
        booking,
      }),
    ),
    ...rows.visits.map(
      (visit): BookingItem => ({
        kind: "stay-visit",
        key: `stay-visit:${visit.id}`,
        type: "stays",
        section: stayVisitSection(visit, now),
        sortAt: visit.created_at ?? "",
        visit,
      }),
    ),
    ...rows.enquiries.map(
      (enquiry): BookingItem => ({
        kind: "stay-enquiry",
        key: `stay-enquiry:${enquiry.id}`,
        type: "stays",
        section: stayEnquirySection(enquiry, now),
        sortAt: enquiry.created_at ?? "",
        enquiry,
      }),
    ),
    ...rows.reservations.map(
      (reservation): BookingItem => ({
        kind: "stay-reservation",
        key: `stay-reservation:${reservation.id}`,
        type: "stays",
        section: stayReservationSection(reservation),
        sortAt: reservation.created_at ?? "",
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
    (requirement) => titleForSlug(requirement.category_slug),
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

function titleForSlug(categorySlug: string): string {
  const words = categorySlug.replace(/-/g, " ").trim();
  if (words.length === 0) return "Your request";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

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

export function ActivityScreen() {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const requirementsQuery = useMyRequests();
  const engagementsQuery = useEngagements();
  const groupsQuery = useBookingGroups();

  // The same cache keys as My Rentals and My Stays, so a card that refreshes
  // its own list refreshes this one too.
  const rentalsList = usePagedList(["my-rentals", ""], (cursor) => fetchMyRentalsPage(undefined, cursor));
  const enquiriesList = usePagedList(["my-stay-enquiries"], (cursor) => fetchMyStayEnquiriesPage(cursor));
  const visitsList = usePagedList(["my-stay-visits"], (cursor) => fetchMyStayVisitsPage(cursor));
  const reservationsList = usePagedList(["my-stay-reservations"], (cursor) =>
    fetchMyStayReservationsPage(cursor),
  );
  const marketplaceLists = [rentalsList, enquiriesList, visitsList, reservationsList];

  const searchParams = useLocalSearchParams<{ status?: string; type?: string }>();
  const selectedTab = toBookingStatusTab(searchParams.status);
  const selectedType = toBookingType(searchParams.type);
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
    for (const list of marketplaceLists) {
      if (list.hasMore) list.loadMore();
    }
  };

  const hasDirectPay = items.some((item) => item.kind === "engagement" && item.row.mode === "lead_only");
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      requirementsQuery.refetch(),
      engagementsQuery.refetch(),
      groupsQuery.refetch(),
      ...marketplaceLists.map((list) => list.refetch()),
    ]);
    setRefreshing(false);
  };

  return (
    <ScrollView
      className="flex-1"
      style={{ paddingTop: Math.max(insets.top, 20) }}
      contentContainerClassName="mx-auto w-full max-w-4xl px-4 pb-16 pt-2"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLOR_TOKENS.action]} tintColor={COLOR_TOKENS.action} />
      }
    >
      {/* Back button with text matching user request */}
      <View className="mb-2.5">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isDesktop ? "Back to Home" : "Back"}
          hitSlop={8}
          onPress={() => {
            if (!isDesktop && router.canGoBack()) {
              router.back();
            } else {
              router.replace("/" as never);
            }
          }}
          className="flex-row items-center gap-1.5 self-start py-1 -ml-1 cursor-pointer active:opacity-70 group"
        >
          <ArrowLeft size={18} color="#0F172A" strokeWidth={2.4} />
          <Text className="text-sm font-bold text-navy-900 group-hover:text-action">
            {isDesktop ? "Back to Home" : "Back"}
          </Text>
        </Pressable>
      </View>

      <View className="gap-3">
        <Text className="shrink-0 text-2xl font-extrabold tracking-tight text-navy-900">Your Bookings</Text>
        <BookingsSearchField value={searchQuery} onChange={setSearchQuery} />
      </View>

      {hasDirectPay ? (
        <View className="mt-4 rounded-control border border-line bg-surface px-4 py-3 shadow-sm">
          <Text className="text-sm font-bold text-navy-900">ℹ️ How payments work</Text>
          <Text className="mt-2 text-xs leading-relaxed text-text-secondary">
            Some crew bookings are paid directly to the professional. Vsolve does not hold those service payments; projects funded through Vsolve show their funded amount on the card.
          </Text>
        </View>
      ) : null}

      {isFirstLoad ? (
        <View className="mt-6 gap-3" accessibilityLabel="Loading your bookings">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-36 w-full rounded-card" />
          ))}
        </View>
      ) : null}

      {errors.length > 0 ? (
        <View className="mt-6">
          <ErrorState
            inline
            title="Some bookings could not be loaded"
            message={describeError(errors[0], "read").message}
            actionLabel="Try again"
            onAction={() => {
              void requirementsQuery.refetch();
              void engagementsQuery.refetch();
              void groupsQuery.refetch();
              for (const list of marketplaceLists) {
                void list.refetch();
              }
            }}
          />
        </View>
      ) : null}

      {!isFirstLoad && typesPresent.length > 1 ? (
        <BookingTypeFilter present={typesPresent} selected={selectedType} tab={selectedTab} />
      ) : null}

      {!isFirstLoad ? (
        <BookingStatusTabs selected={selectedTab} counts={counts} type={selectedType} />
      ) : null}

      {!isFirstLoad && !isSearching && tabItems.length === 0 && errors.length === 0 ? (
        <View className="mt-8">
          <EmptyState
            title={copy.emptyTitle}
            description={copy.emptyDescription}
            action={
              selectedTab === "active" ? (
                <Link href={BROWSE[selectedType ?? "services"].href as Href} asChild>
                  <Pressable className={buttonStyles({ variant: "outline" })}>
                    <Text className="text-sm font-semibold text-text">
                      {BROWSE[selectedType ?? "services"].label}
                    </Text>
                  </Pressable>
                </Link>
              ) : undefined
            }
          />
        </View>
      ) : null}

      {!isFirstLoad && isSearching && visibleItems.length === 0 ? (
        <View className="mt-8" accessibilityRole="summary">
          <EmptyState
            title="No bookings found"
            description="Try searching with a different service name, booking ID, or keyword."
            icon={<Search size={32} color={COLOR_TOKENS.textMuted} strokeWidth={1.6} />}
          />
        </View>
      ) : null}

      {!isFirstLoad && visibleItems.length > 0 ? (
        <View className="mt-5 gap-3.5" accessibilityRole="summary">
          {visibleItems.map((item) => (
            <BookingTimelineRow key={item.key} item={item} />
          ))}
        </View>
      ) : null}

      {unknownEngagements > 0 ? (
        <Text className="mt-6 rounded-control border border-line bg-surface-sunken p-4 text-sm leading-6 text-text-secondary">
          {unknownEngagements === 1 ? "One agreement uses" : `${unknownEngagements} agreements use`} a payment type this app cannot describe yet. Contact support to open the record safely.
        </Text>
      ) : null}

      {hasOlder ? (
        <View className="mt-8">
          <Button variant="outline" loading={loadingOlder} onPress={loadOlder}>
            Show older bookings
          </Button>
        </View>
      ) : null}
    </ScrollView>
  );
}

function BookingTypeFilter({
  present,
  selected,
  tab,
}: {
  present: readonly BookingType[];
  selected: BookingType | null;
  tab: BookingStatusTab;
}) {
  const options: { type: BookingType | null; label: string }[] = [
    { type: null, label: "All" },
    ...present.map((type) => ({ type, label: BOOKING_TYPE_LABELS[type] })),
  ];
  return (
    <View accessibilityRole="tablist" accessibilityLabel="Booking type" className="mt-4">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="flex-row gap-2">
        {options.map(({ type, label }) => {
          const active = selected === type;
          return (
            <Link key={label} href={bookingStatusHref(tab, type) as Href} asChild>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                className={
                  active
                    ? "inline-flex min-h-9 items-center justify-center rounded-full bg-navy-900 px-4 py-1.5"
                    : "inline-flex min-h-9 items-center justify-center rounded-full border border-line bg-surface px-4 py-1.5 active:bg-surface-sunken"
                }
              >
                <Text className={active ? "text-sm font-bold text-white" : "text-sm font-semibold text-text-secondary"}>
                  {label}
                </Text>
              </Pressable>
            </Link>
          );
        })}
      </ScrollView>
    </View>
  );
}

function BookingStatusTabs({
  selected,
  counts,
  type,
}: {
  selected: BookingStatusTab;
  counts: Record<BookingStatusTab, number>;
  type: BookingType | null;
}) {
  return (
    <View className="mt-5 border-b border-line/80">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="-mx-4 flex-row gap-1 px-4">
        {BOOKING_STATUS_TABS.map((tab) => {
          const isSelected = tab === selected;
          const tabCopy = BOOKING_STATUS_COPY[tab];
          return (
            <Link key={tab} href={bookingStatusHref(tab, type) as Href} asChild>
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${tabCopy.label} ${counts[tab]}`}
                className={`min-h-11 flex-row items-center gap-2 border-b-2 px-2.5 pb-2.5 pt-1 ${
                  isSelected ? "border-action" : "border-transparent"
                }`}
              >
                <Text className={isSelected ? "text-sm font-extrabold text-navy-900" : "text-sm font-semibold text-text-secondary"}>
                  {tabCopy.label}
                </Text>
                <Text className={isSelected ? "text-sm font-extrabold tabular-nums text-navy-900" : "text-sm font-bold tabular-nums text-text-secondary"}>
                  {counts[tab]}
                </Text>
              </Pressable>
            </Link>
          );
        })}
      </ScrollView>
    </View>
  );
}

function BookingsSearchField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <View className="w-full min-w-0">
      <Text className="sr-only">Search bookings</Text>
      <View className="relative">
        <View className="absolute left-3.5 top-1/2 z-10 -translate-y-1/2">
          <Search size={18} color={COLOR_TOKENS.textMuted} strokeWidth={1.8} />
        </View>
        <Input
          value={value}
          onChangeText={onChange}
          placeholder="Search by service name, booking ID or keyword…"
          autoComplete="off"
          enterKeyHint="search"
          accessibilityLabel="Search bookings"
          className="h-12 rounded-card border border-line bg-surface pl-11 pr-11 text-sm text-navy-900"
        />
        {value.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            hitSlop={8}
            onPress={() => onChange("")}
            className="absolute right-2 top-1/2 size-8 -translate-y-1/2 items-center justify-center rounded-control"
          >
            <X size={16} color={COLOR_TOKENS.textMuted} strokeWidth={2} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

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
        <View className="gap-1.5" testID={`booking-${item.kind}`}>
          <Text className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
            {MARKETPLACE_LABEL[item.kind]}
          </Text>
          {item.kind === "rental" ? <RentalBookingCard booking={item.booking} /> : null}
          {item.kind === "stay-visit" ? <StayVisitCard visit={item.visit} /> : null}
          {item.kind === "stay-enquiry" ? <StayEnquiryCard enquiry={item.enquiry} /> : null}
          {item.kind === "stay-reservation" ? (
            <StayReservationCard reservation={item.reservation} />
          ) : null}
        </View>
      );
  }
}

function BookingGroupRow({ group }: { group: BookingGroup }) {
  const first = group.units[0];
  const serviceLine = first?.lines.find((line) => line.kind === "SERVICE") ?? first?.lines[0] ?? null;
  const quantity = serviceLine?.quantity ?? 1;
  const baseName = serviceLine?.label ?? "Booking";
  const displayName = quantity > 0 ? `${baseName} x ${quantity}` : baseName;
  const hidePrice = new Set<BookingGroup["status"]>(["REPLAN_REQUIRED", "CANCELLED", "EXPIRED", "FAILED"]).has(group.status);
  const showPrice = first !== undefined && first.total.amount_paise > 0 && !hidePrice;
  const detail =
    group.recovery_action === "REPLAN"
      ? "Choose a new arrangement"
      : group.recovery_action === "PAYMENT_REQUIRED"
        ? "Payment is needed to confirm"
        : first === undefined
          ? null
          : formatBookingWhen(first.starts_at);

  const serviceSlug = serviceLine ? serviceSlugFromLineCode(serviceLine.code) : null;

  return (
    <Link href={`/bookings/${group.id}`} asChild>
      <Pressable className="overflow-hidden rounded-2xl border border-line bg-surface p-3.5 shadow-2xs active:bg-surface-sunken">
        <CatalogServiceThumbRow hint={{ slug: serviceSlug, name: baseName }}>
          <View className="gap-1.5">
            <View className="flex-row items-start justify-between gap-2">
              <Text numberOfLines={2} className="min-w-0 flex-1 text-base font-extrabold leading-snug text-navy-900">
                {displayName}
              </Text>
              <GroupStatusBadge group={group} />
            </View>

            <View className="flex-row items-baseline justify-between gap-2 pt-0.5">
              {detail ? (
                <Text numberOfLines={1} className="min-w-0 flex-1 text-xs text-text-secondary">
                  {detail}
                </Text>
              ) : (
                <View />
              )}
              {showPrice && first ? (
                <Money value={first.total} className="shrink-0 text-base font-extrabold tabular-nums text-navy-900" />
              ) : null}
            </View>
          </View>
        </CatalogServiceThumbRow>
      </Pressable>
    </Link>
  );
}

function EngagementListRow({ row }: { row: EngagementRowView }) {
  const nouns = nounsFor(row.mode);
  const title = row.serviceName ?? row.activeStageLabel ?? nouns.engagementTitle;
  const line = engagementListLine(row, nouns);
  return (
    <Link href={`/jobs/${row.engagementId}`} asChild>
      <Pressable className="overflow-hidden rounded-2xl border border-line bg-surface p-3.5 shadow-2xs active:bg-surface-sunken">
        <CatalogServiceThumbRow hint={{ slug: row.serviceSlug, name: row.serviceName }}>
          <View className="gap-1.5">
            <View className="flex-row items-start justify-between gap-2">
              <Text numberOfLines={2} className="min-w-0 flex-1 text-base font-extrabold leading-snug text-navy-900">
                {title}
              </Text>
              <View className="flex-row flex-wrap items-center gap-1.5">
                {row.isDisputed ? <Badge tone="danger">Problem raised</Badge> : null}
                <EngagementStatusBadge status={row.status} />
              </View>
            </View>
            <View className="flex-row items-baseline justify-between gap-2 pt-0.5">
              {line ? <Text numberOfLines={1} className="min-w-0 flex-1 text-xs text-text-secondary">{line}</Text> : <View />}
              {row.stagedTotalPaise > 0 ? (
                <Text className="shrink-0 text-base font-extrabold tabular-nums text-navy-900">{row.stagedTotalLabel}</Text>
              ) : null}
            </View>
          </View>
        </CatalogServiceThumbRow>
      </Pressable>
    </Link>
  );
}

function engagementListLine(row: EngagementRowView, nouns: ReturnType<typeof nounsFor>): string | null {
  switch (row.nextAction) {
    case "review_stage":
      return row.actionStageKind === "material_advance" ? "Check the materials" : "Check the work";
    case "accept_completion":
      return "Confirm the work is finished";
    case "fund_stage":
      return stageKindCopy(row.actionStageKind ?? "unknown", nouns).fundNextAction;
    default:
      return row.activeStageOn;
  }
}

function RequestRow({ request, href, isClosed }: { request: RequestRowView; href: string; isClosed?: boolean }) {
  const countdown = useServerCountdown(request.deadlineAt, 60_000);
  const state: RequestState = requestState({
    status: request.status,
    quoteDeadlineRemainingMs: countdown?.remainingMs ?? null,
  });
  const remaining =
    showsQuoteDeadline(state) && countdown !== null && !countdown.isExpired
      ? countdown.announce.replace(/ left$/, "")
      : null;
  const line =
    request.teaserCount > 0
      ? request.teaserCount === 1
        ? "1 quote waiting"
        : `${request.teaserCount} quotes waiting`
      : state === "DRAFT"
        ? "Finish and send"
        : showsQuoteDeadline(state) && remaining !== null
          ? `Quotes promised in ${remaining}`
          : state === "UNLOCKED"
            ? "Compare them and choose one"
            : isClosed
              ? "Closed"
              : request.serviceBy;
  return (
    <Link href={href} asChild>
      <Pressable className="overflow-hidden rounded-2xl border border-line bg-surface p-3.5 shadow-2xs active:bg-surface-sunken">
        <CatalogServiceThumbRow hint={{ name: request.title, categorySlug: request.categorySlug }}>
          <View className="gap-1.5">
            <View className="flex-row items-start justify-between gap-2">
              <Text numberOfLines={2} className="min-w-0 flex-1 text-base font-extrabold leading-snug text-navy-900">
                {request.title}
              </Text>
              <RequestStateBadge state={state} />
            </View>
            <View className="flex-row items-baseline justify-between gap-2 pt-0.5">
              <Text numberOfLines={1} className="min-w-0 flex-1 text-xs text-text-secondary">
                {line}
              </Text>
            </View>
          </View>
        </CatalogServiceThumbRow>
      </Pressable>
    </Link>
  );
}
