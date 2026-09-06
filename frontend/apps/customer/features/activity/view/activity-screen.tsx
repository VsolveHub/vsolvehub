"use client";

import React, { useState } from "react";
import { describeError } from "@vsolve/query";
import { Button, EmptyState, ErrorState, Skeleton, buttonStyles } from "@vsolve/ui";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Building2,
  Package,
  Wrench,
  Calendar,
  MapPin,
  Clock,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  X,
  Truck,
  Store,
} from "lucide-react";

import { BookingGroupRow } from "@/features/bookings/view/group-list";
import { useBookingGroups, type BookingGroup } from "@/features/bookings/queries";
import { toEngagementLists, type EngagementRowView } from "@/features/engagement/adapters";
import { useEngagements, type Engagement } from "@/features/engagement/queries";
import { EngagementListRow } from "@/features/engagement/view/engagement-list-screen";
import { toRequestRows, type RequestRowView } from "@/features/requirement/adapters";
import { useMyRequests, type RequirementSummary } from "@/features/requirement/queries";
import { RequestRow } from "@/features/requirement/view/requests-list";
import { useRentalBookings, type RentalBookingItem } from "@/features/rentals/queries";
import { useStayReservations, type StayReservationDetail } from "@/features/stays/queries";
import { requestHref } from "@/lib/routes";

export type BookingSection = "needs_you" | "active" | "past";
export type BookingCategory = "all" | "services" | "rentals" | "stays";

const CLOSED_REQUESTS: ReadonlySet<RequirementSummary["status"]> = new Set([
  "CLOSED_NO_SUPPLY",
  "CLOSED_SLA_BREACH",
  "CLOSED_EXPIRED",
  "CLOSED_ABANDONED",
  "CLOSED_COMPLETE",
  "CLOSED_CANCELLED",
]);

export function requestSection(status: RequirementSummary["status"]): BookingSection {
  if (CLOSED_REQUESTS.has(status)) return "past";
  if (status === "DRAFT" || status === "QUOTES_READY" || status === "UNLOCKED") {
    return "needs_you";
  }
  return "active";
}

export function engagementSection(row: EngagementRowView): BookingSection {
  if (
    row.nextAction === "review_stage" ||
    row.nextAction === "fund_stage" ||
    row.nextAction === "accept_completion"
  ) {
    return "needs_you";
  }
  if (row.status === "COMPLETED" || row.status === "CLOSED" || row.status === "CANCELLED") {
    return "past";
  }
  return "active";
}

export function groupSection(group: BookingGroup): BookingSection {
  if (group.status === "PAYMENT_PENDING" || group.status === "REPLAN_REQUIRED") {
    return "needs_you";
  }
  if (
    group.status === "COMPLETED" ||
    group.status === "CANCELLED" ||
    group.status === "EXPIRED" ||
    group.status === "FAILED"
  ) {
    return "past";
  }
  return "active";
}

export function rentalSection(status: string): BookingSection {
  if (
    status === "RETURN_PENDING" ||
    status === "DISPUTED" ||
    status === "PAYMENT_PENDING" ||
    status === "RECOVERY_REQUIRED"
  ) {
    return "needs_you";
  }
  if (
    status === "SETTLED" ||
    status === "COMPLETED" ||
    status === "CANCELLED" ||
    status === "EXPIRED"
  ) {
    return "past";
  }
  return "active";
}

export function staySection(status: string): BookingSection {
  if (status === "HELD" || status === "PAYMENT_PENDING" || status === "DISPUTED") {
    return "needs_you";
  }
  if (
    status === "CHECKED_OUT" ||
    status === "COMPLETED" ||
    status === "CANCELLED" ||
    status === "EXPIRED"
  ) {
    return "past";
  }
  return "active";
}

export function requestBelongsInBookings(requirement: RequirementSummary): boolean {
  return requirement.engagement_id === null;
}

export type BookingItem =
  | { kind: "request"; key: string; category: "services"; section: BookingSection; sortAt: string; row: RequestRowView }
  | { kind: "engagement"; key: string; category: "services"; section: BookingSection; sortAt: string; row: EngagementRowView }
  | { kind: "group"; key: string; category: "services"; section: BookingSection; sortAt: string; group: BookingGroup }
  | { kind: "rental"; key: string; category: "rentals"; section: BookingSection; sortAt: string; rental: RentalBookingItem }
  | { kind: "stay"; key: string; category: "stays"; section: BookingSection; sortAt: string; stay: StayReservationDetail };

function byNewest(a: BookingItem, b: BookingItem): number {
  const dateA = a.sortAt ? Date.parse(a.sortAt) : 0;
  const dateB = b.sortAt ? Date.parse(b.sortAt) : 0;
  return dateB - dateA;
}

function itemsFrom(
  requirements: readonly RequirementSummary[],
  engagements: readonly Engagement[],
  groups: readonly BookingGroup[],
  rentals: readonly RentalBookingItem[],
  stays: readonly StayReservationDetail[],
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
          category: "services",
          section: requestSection(row.status),
          sortAt: source?.last_activity_at ?? "",
          row,
        };
      }),
      ...[...engagementLists.workforce, ...engagementLists.projects].map(
        (row): BookingItem => ({
          kind: "engagement",
          key: `engagement:${row.engagementId}`,
          category: "services",
          section: engagementSection(row),
          sortAt: engagementById.get(row.engagementId)?.created_at ?? "",
          row,
        }),
      ),
      ...groups.map(
        (group): BookingItem => ({
          kind: "group",
          key: `group:${group.id}`,
          category: "services",
          section: groupSection(group),
          sortAt: group.updated_at,
          group,
        }),
      ),
      ...rentals.map(
        (rental): BookingItem => ({
          kind: "rental",
          key: `rental:${rental.id}`,
          category: "rentals",
          section: rentalSection(rental.status),
          sortAt: rental.created_at ?? rental.rental_start ?? "",
          rental,
        }),
      ),
      ...stays.map(
        (stay): BookingItem => ({
          kind: "stay",
          key: `stay:${stay.id}`,
          category: "stays",
          section: staySection(stay.status),
          sortAt: stay.created_at ?? stay.start_date ?? "",
          stay,
        }),
      ),
    ].sort(byNewest),
    unknownEngagements: engagementLists.undescribable.length,
  };
}

const SECTION_COPY: Record<BookingSection, { title: string; description: string }> = {
  needs_you: { title: "Needs you", description: "A decision, payment, or action is waiting for you." },
  active: { title: "Upcoming and active", description: "Services, tool rentals, and stays currently active." },
  past: { title: "Past", description: "Completed, returned, checked out, or cancelled." },
};

function formatCurrency(paise: number): string {
  return "₹" + (paise / 100).toLocaleString("en-IN");
}

function formatDateRange(startStr: string, endStr: string): string {
  if (!startStr) return "";
  const start = new Date(startStr);
  const end = endStr ? new Date(endStr) : null;
  const opt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  if (!end || startStr === endStr) {
    return start.toLocaleDateString("en-IN", opt);
  }
  return `${start.toLocaleDateString("en-IN", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-IN", opt)}`;
}

export function ActivityScreen() {
  const searchParams = useSearchParams();
  const initialCategory = (searchParams?.get("category") as BookingCategory) || "all";
  const bookedId = searchParams?.get("booked");

  const [selectedCategory, setSelectedCategory] = useState<BookingCategory>(initialCategory);
  const [showBanner, setShowBanner] = useState<boolean>(Boolean(bookedId));

  const requirementsQuery = useMyRequests();
  const engagementsQuery = useEngagements();
  const groupsQuery = useBookingGroups();
  const rentalsQuery = useRentalBookings();
  const staysQuery = useStayReservations();

  const requirements = requirementsQuery.data ?? [];
  const engagements = (engagementsQuery.data?.pages ?? []).flatMap((page) => page.results);
  const groups = (groupsQuery.data?.pages ?? []).flatMap((page) => page.results);
  const rentals = rentalsQuery.data ?? [];
  const stays = staysQuery.data ?? [];

  const { items, unknownEngagements } = itemsFrom(requirements, engagements, groups, rentals, stays);

  const isFirstLoad =
    items.length === 0 &&
    (requirementsQuery.isPending ||
      engagementsQuery.isPending ||
      groupsQuery.isPending ||
      rentalsQuery.isPending ||
      staysQuery.isPending);

  const errors = [
    requirementsQuery.error,
    engagementsQuery.error,
    groupsQuery.error,
    rentalsQuery.error,
    staysQuery.error,
  ].filter((error): error is Error => error instanceof Error);

  const hasDirectPay = items.some(
    (item) => item.kind === "engagement" && item.row.mode === "lead_only",
  );

  const servicesCount = items.filter((i) => i.category === "services").length;
  const rentalsCount = items.filter((i) => i.category === "rentals").length;
  const staysCount = items.filter((i) => i.category === "stays").length;

  const filteredItems = items.filter((item) => {
    if (selectedCategory === "all") return true;
    return item.category === selectedCategory;
  });

  const needsYouCount = filteredItems.filter((i) => i.section === "needs_you").length;
  const activeCount = filteredItems.filter((i) => i.section === "active").length;
  const pastCount = filteredItems.filter((i) => i.section === "past").length;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col px-4 pb-20 pt-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900 sm:text-3xl">
            Bookings & Activity
          </h1>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-text-secondary">
            All your Services, Equipment Rentals, and Stay accommodations in one unified place.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/catalog" className={buttonStyles({ variant: "outline", size: "sm" })}>
            Explore Services
          </Link>
          <Link href="/catalog/rental-services" className={buttonStyles({ variant: "outline", size: "sm" })}>
            Rent Tools
          </Link>
          <Link href="/stays" className={buttonStyles({ variant: "outline", size: "sm" })}>
            Find Stays
          </Link>
        </div>
      </div>

      {/* Post-Booking Celebration Banner */}
      {showBanner ? (
        <div className="mt-6 flex items-start justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 shadow-sm animate-in fade-in duration-300">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white font-bold">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-emerald-950">
                Booking confirmed!
              </h2>
              <p className="mt-0.5 text-xs text-emerald-800">
                Your order/reservation is placed and active below. Track progress, custody, check-in passes, or schedule details anytime right here.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowBanner(false)}
            aria-label="Dismiss banner"
            className="rounded-lg p-1 text-emerald-700 hover:bg-emerald-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {/* Quick Stats Summary Bar */}
      {!isFirstLoad && items.length > 0 ? (
        <div className="mt-6 grid grid-cols-3 gap-3">
          <div className="flex flex-col rounded-card border border-line bg-surface p-3.5 sm:p-4 shadow-card">
            <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Action Waiting</span>
            <span className="mt-1 text-2xl font-extrabold text-navy-900">{needsYouCount}</span>
          </div>
          <div className="flex flex-col rounded-card border border-line bg-surface p-3.5 sm:p-4 shadow-card">
            <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Active Work</span>
            <span className="mt-1 text-2xl font-extrabold text-navy-900">{activeCount}</span>
          </div>
          <div className="flex flex-col rounded-card border border-line bg-surface p-3.5 sm:p-4 shadow-card">
            <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Completed</span>
            <span className="mt-1 text-2xl font-extrabold text-navy-900">{pastCount}</span>
          </div>
        </div>
      ) : null}

      {/* Category Filter Pills */}
      <div className="mt-6 flex flex-wrap items-center gap-2 border-b border-line/60 pb-4">
        <button
          onClick={() => setSelectedCategory("all")}
          className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition-all ${
            selectedCategory === "all"
              ? "bg-navy-900 text-white shadow-sm"
              : "bg-surface border border-line text-text-secondary hover:text-navy-900 hover:border-navy-300"
          }`}
        >
          <span>All Bookings</span>
          <span
            className={`rounded-full px-1.5 py-0.2 text-[10px] ${
              selectedCategory === "all" ? "bg-navy-800 text-white" : "bg-neutral-100 text-text-muted"
            }`}
          >
            {items.length}
          </span>
        </button>

        <button
          onClick={() => setSelectedCategory("services")}
          className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition-all ${
            selectedCategory === "services"
              ? "bg-navy-900 text-white shadow-sm"
              : "bg-surface border border-line text-text-secondary hover:text-navy-900 hover:border-navy-300"
          }`}
        >
          <Wrench className="h-3.5 w-3.5" />
          <span>Services</span>
          <span
            className={`rounded-full px-1.5 py-0.2 text-[10px] ${
              selectedCategory === "services" ? "bg-navy-800 text-white" : "bg-neutral-100 text-text-muted"
            }`}
          >
            {servicesCount}
          </span>
        </button>

        <button
          onClick={() => setSelectedCategory("rentals")}
          className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition-all ${
            selectedCategory === "rentals"
              ? "bg-navy-900 text-white shadow-sm"
              : "bg-surface border border-line text-text-secondary hover:text-navy-900 hover:border-navy-300"
          }`}
        >
          <Package className="h-3.5 w-3.5" />
          <span>Equipment Rentals</span>
          <span
            className={`rounded-full px-1.5 py-0.2 text-[10px] ${
              selectedCategory === "rentals" ? "bg-navy-800 text-white" : "bg-neutral-100 text-text-muted"
            }`}
          >
            {rentalsCount}
          </span>
        </button>

        <button
          onClick={() => setSelectedCategory("stays")}
          className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition-all ${
            selectedCategory === "stays"
              ? "bg-navy-900 text-white shadow-sm"
              : "bg-surface border border-line text-text-secondary hover:text-navy-900 hover:border-navy-300"
          }`}
        >
          <Building2 className="h-3.5 w-3.5" />
          <span>Stays & Hostels</span>
          <span
            className={`rounded-full px-1.5 py-0.2 text-[10px] ${
              selectedCategory === "stays" ? "bg-navy-800 text-white" : "bg-neutral-100 text-text-muted"
            }`}
          >
            {staysCount}
          </span>
        </button>
      </div>

      {hasDirectPay ? (
        <details className="mt-4 rounded-control border border-line bg-surface px-4 py-3 text-sm text-text-secondary shadow-card transition-all">
          <summary className="cursor-pointer font-bold text-navy-900 flex items-center gap-2">
            <span>ℹ️</span> How payments work
          </summary>
          <p className="mt-2 leading-relaxed text-xs sm:text-sm">
            Some crew bookings are paid directly to the professional. Equipment rentals and stay deposits are secured through Escrow refunds upon return or inspection.
          </p>
        </details>
      ) : null}

      {isFirstLoad ? (
        <div className="mt-6 flex flex-col gap-3" aria-label="Loading your bookings">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-32 w-full rounded-card" />
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
              void rentalsQuery.refetch();
              void staysQuery.refetch();
            }}
          />
        </div>
      ) : null}

      {!isFirstLoad && filteredItems.length === 0 && errors.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title={selectedCategory === "all" ? "No bookings yet" : `No ${selectedCategory} found`}
            description={
              selectedCategory === "all"
                ? "Everything you book across Services, Equipment Rentals, and Stays will show up right here."
                : `You don't have any bookings under ${selectedCategory} at the moment.`
            }
            action={
              <div className="flex flex-wrap gap-2">
                <Link href="/catalog" className={buttonStyles({ variant: "outline", size: "sm" })}>
                  Browse Services
                </Link>
                <Link href="/catalog/rental-services" className={buttonStyles({ variant: "outline", size: "sm" })}>
                  Rent Equipment
                </Link>
                <Link href="/stays" className={buttonStyles({ variant: "outline", size: "sm" })}>
                  Explore Stays
                </Link>
              </div>
            }
          />
        </div>
      ) : null}

      {(["needs_you", "active", "past"] as const).map((section) => {
        const sectionItems = filteredItems.filter((item) => item.section === section);
        if (sectionItems.length === 0) return null;
        const copy = SECTION_COPY[section];
        return (
          <section key={section} aria-labelledby={`bookings-${section}`} className="mt-8 sm:mt-10">
            <div className="mb-4 flex items-center justify-between border-b border-line/60 pb-2.5">
              <div>
                <h2 id={`bookings-${section}`} className="text-lg font-extrabold text-navy-900 flex items-center gap-2">
                  {copy.title}
                  <span className="inline-flex items-center justify-center rounded-full bg-navy-50 px-2.5 py-0.5 text-xs font-bold text-navy-700">
                    {sectionItems.length}
                  </span>
                </h2>
                <p className="mt-0.5 text-xs sm:text-sm text-text-secondary">{copy.description}</p>
              </div>
            </div>
            <ul className="flex list-none flex-col gap-3.5 p-0">
              {sectionItems.map((item) => (
                <BookingTimelineRow key={item.key} item={item} />
              ))}
            </ul>
          </section>
        );
      })}

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
  if (item.kind === "rental") return <RentalTimelineCard rental={item.rental} />;
  if (item.kind === "stay") return <StayTimelineCard stay={item.stay} />;
  return (
    <RequestRow
      request={item.row}
      href={requestHref(item.row.id)}
      isClosed={item.section === "past"}
    />
  );
}

function RentalTimelineCard({ rental }: { rental: RentalBookingItem }) {
  const isPast = ["SETTLED", "COMPLETED", "CANCELLED", "EXPIRED"].includes(rental.status);
  const isNeedsYou = ["RETURN_PENDING", "DISPUTED", "PAYMENT_PENDING", "RECOVERY_REQUIRED"].includes(
    rental.status,
  );

  return (
    <li>
      <Link
        href={`/rentals/bookings/${rental.id}`}
        className="group block rounded-card border border-line bg-surface p-4 hover:border-warm-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action shadow-card transition-all"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700">
              <Package className="h-3 w-3" /> Equipment Rental
            </span>
            <span className="text-xs text-text-muted">•</span>
            <span className="text-xs font-semibold text-text-secondary">{rental.vendor_name}</span>
          </div>

          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
              isNeedsYou
                ? "bg-amber-50 text-amber-800 border border-amber-200"
                : isPast
                  ? "bg-neutral-100 text-neutral-700 border border-neutral-200"
                  : "bg-emerald-50 text-emerald-700 border border-emerald-200"
            }`}
          >
            {rental.status.replace(/_/g, " ")}
          </span>
        </div>

        <div className="mt-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-navy-900 group-hover:text-action transition-colors">
              {rental.asset_title}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-text-secondary">
              <span className="flex items-center gap-1 font-medium">
                <Calendar className="h-3.5 w-3.5 text-text-muted" />
                {formatDateRange(rental.rental_start, rental.rental_end)}
              </span>
              <span className="flex items-center gap-1 font-medium">
                {rental.delivery_mode === "DELIVERY" ? (
                  <>
                    <Truck className="h-3.5 w-3.5 text-text-muted" /> Doorstep Delivery
                  </>
                ) : (
                  <>
                    <Store className="h-3.5 w-3.5 text-text-muted" /> Hub Pickup
                  </>
                )}
              </span>
              {rental.deposit?.status ? (
                <span className="flex items-center gap-1 font-medium text-emerald-700">
                  <ShieldCheck className="h-3.5 w-3.5" /> Deposit: {rental.deposit.status}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-center">
            <div className="text-right">
              <div className="text-xs font-bold text-navy-900">
                {formatCurrency(rental.daily_price_paise)} / day
              </div>
              <div className="text-[11px] text-text-muted">
                + {formatCurrency(rental.deposit_paise)} deposit
              </div>
            </div>
            <span className="text-xs font-bold text-action group-hover:translate-x-0.5 transition-transform">
              Manage &rarr;
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}

function StayTimelineCard({ stay }: { stay: StayReservationDetail }) {
  const isPast = ["CHECKED_OUT", "COMPLETED", "CANCELLED", "EXPIRED"].includes(stay.status);
  const isNeedsYou = ["HELD", "PAYMENT_PENDING", "DISPUTED"].includes(stay.status);

  return (
    <li>
      <Link
        href={`/stays/bookings/${stay.id}`}
        className="group block rounded-card border border-line bg-surface p-4 hover:border-warm-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action shadow-card transition-all"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md bg-orange-50 px-2 py-0.5 text-xs font-bold text-orange-700">
              <Building2 className="h-3 w-3" /> Stay & Accommodation
            </span>
            <span className="text-xs text-text-muted">•</span>
            <span className="text-xs font-semibold text-text-secondary">{stay.unit_name}</span>
          </div>

          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
              isNeedsYou
                ? "bg-amber-50 text-amber-800 border border-amber-200"
                : isPast
                  ? "bg-neutral-100 text-neutral-700 border border-neutral-200"
                  : "bg-emerald-50 text-emerald-700 border border-emerald-200"
            }`}
          >
            {stay.status.replace(/_/g, " ")}
          </span>
        </div>

        <div className="mt-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-navy-900 group-hover:text-action transition-colors">
              {stay.property_title}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-text-secondary">
              <span className="flex items-center gap-1 font-medium">
                <Calendar className="h-3.5 w-3.5 text-text-muted" />
                {formatDateRange(stay.start_date, stay.end_date)}
              </span>
              {stay.property_locality ? (
                <span className="flex items-center gap-1 font-medium">
                  <MapPin className="h-3.5 w-3.5 text-text-muted" /> {stay.property_locality}
                </span>
              ) : null}
              <span className="flex items-center gap-1 font-medium text-text-muted">
                {stay.guest_count} {stay.guest_count === 1 ? "guest" : "guests"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-center">
            <div className="text-right">
              <div className="text-xs font-bold text-navy-900">
                {formatCurrency(stay.total_amount_paise)}
              </div>
              <div className="text-[11px] text-text-muted">
                {stay.duration_mode === "MONTHLY" ? "Monthly stay" : `${stay.total_nights || 1} nights`}
              </div>
            </div>
            <span className="text-xs font-bold text-action group-hover:translate-x-0.5 transition-transform">
              View pass &rarr;
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}
