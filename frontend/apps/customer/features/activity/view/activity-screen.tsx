"use client";

import { describeError } from "@vsolve/query";
import { Button, EmptyState, ErrorState, Skeleton, buttonStyles } from "@vsolve/ui";
import Link from "next/link";

import { BookingGroupRow } from "@/features/bookings/view/group-list";
import { useBookingGroups, type BookingGroup } from "@/features/bookings/queries";
import { toEngagementLists, type EngagementRowView } from "@/features/engagement/adapters";
import { useEngagements, type Engagement } from "@/features/engagement/queries";
import { EngagementListRow } from "@/features/engagement/view/engagement-list-screen";
import { toRequestRows, type RequestRowView } from "@/features/requirement/adapters";
import { useMyRequests, type RequirementSummary } from "@/features/requirement/queries";
import { RequestRow } from "@/features/requirement/view/requests-list";
import { requestHref } from "@/lib/routes";

export type BookingSection = "needs_you" | "active" | "past";

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

export function requestBelongsInBookings(requirement: RequirementSummary): boolean {
  return requirement.engagement_id === null;
}

type BookingItem =
  | { kind: "request"; key: string; section: BookingSection; sortAt: string; row: RequestRowView }
  | { kind: "engagement"; key: string; section: BookingSection; sortAt: string; row: EngagementRowView }
  | { kind: "group"; key: string; section: BookingSection; sortAt: string; group: BookingGroup };

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

const SECTION_COPY: Record<BookingSection, { title: string; description: string }> = {
  needs_you: { title: "Needs you", description: "A decision or payment is waiting for you." },
  active: { title: "Upcoming and active", description: "Visits, requests and work still moving." },
  past: { title: "Past", description: "Finished, cancelled or closed work." },
};

export function ActivityScreen() {
  const requirementsQuery = useMyRequests();
  const engagementsQuery = useEngagements();
  const groupsQuery = useBookingGroups();

  const requirements = requirementsQuery.data ?? [];
  const engagements = (engagementsQuery.data?.pages ?? []).flatMap((page) => page.results);
  const groups = (groupsQuery.data?.pages ?? []).flatMap((page) => page.results);
  const { items, unknownEngagements } = itemsFrom(requirements, engagements, groups);
  const isFirstLoad =
    items.length === 0 &&
    (requirementsQuery.isPending || engagementsQuery.isPending || groupsQuery.isPending);
  const errors = [requirementsQuery.error, engagementsQuery.error, groupsQuery.error].filter(
    (error): error is Error => error instanceof Error,
  );
  const hasDirectPay = items.some(
    (item) => item.kind === "engagement" && item.row.mode === "lead_only",
  );

  const needsYouCount = items.filter((i) => i.section === "needs_you").length;
  const activeCount = items.filter((i) => i.section === "active").length;
  const pastCount = items.filter((i) => i.section === "past").length;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900 sm:text-3xl">Bookings & Activity</h1>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-text-secondary">
            Everything you have booked or asked us to arrange, in one place.
          </p>
        </div>
        <Link href="/requests/new" className={buttonStyles({ size: "md" })}>
          + Describe a job
        </Link>
      </div>

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
            }}
          />
        </div>
      ) : null}

      {!isFirstLoad && items.length === 0 && errors.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="No bookings yet"
            description="Describe what you need and it will stay here from the first request to the finished work."
            action={
              <Link href="/catalog" className={buttonStyles({ variant: "outline" })}>
                Browse services
              </Link>
            }
          />
        </div>
      ) : null}

      {(["needs_you", "active", "past"] as const).map((section) => {
        const sectionItems = items.filter((item) => item.section === section);
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
  return (
    <RequestRow
      request={item.row}
      href={requestHref(item.row.id)}
      isClosed={item.section === "past"}
    />
  );
}
