"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { useCaseQueueSummary } from "@/features/cases/queries";
import { useCrewVerificationQueue } from "@/features/crew-verification/queries";
import { useStuckQueues } from "@/features/m2-requests/queries";
import { useCustomItemReviews } from "@/features/m2-work-items/queries";
import {
  fetchOpsRentalBookingsPage,
  fetchOpsRentalDisputes,
  fetchOpsRentalsPage,
  fetchOpsStaysPage,
} from "@/features/moderation/queries";
import { useApplicationQueue } from "@/features/partner-review/queries";
import { useWithdrawals } from "@/features/payouts/queries";

import { useDashboardAggregates } from "./queries";

/** `urgent`: a customer, partner or payment is already waiting late. `review`: a decision queue. */
export type AttentionTone = "urgent" | "review";

export type Item = {
  label: string;
  /** One line on why it matters, shown under the label. */
  hint?: string;
  href: string;
  count: number | null;
  more?: boolean;
  tone?: AttentionTone;
};

/** Rows waiting on a decision. Exported for tests. */
export function pendingReviewCount(rows: { moderation_status?: string; public_state?: string }[]): number {
  return rows.filter((row) => row.moderation_status === "PENDING" || row.public_state === "PENDING_REVIEW").length;
}

/**
 * Only the items with something waiting: urgent ones first, then the busiest, so an empty list
 * means a clear desk. Exported for tests.
 */
export function itemsToShow(items: Item[]): Item[] {
  const rank = (item: Item) => (item.tone === "urgent" ? 0 : 1);
  return items
    .filter((item) => (item.count ?? 0) > 0)
    .sort((a, b) => rank(a) - rank(b) || (b.count ?? 0) - (a.count ?? 0));
}

function Row({ item }: { item: Item }) {
  const urgent = item.tone === "urgent";
  return (
    <li>
      <Link
        href={item.href}
        className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hover focus-visible:bg-surface-hover"
      >
        <span
          aria-hidden
          className={`size-2 shrink-0 rounded-full ${urgent ? "bg-danger-text" : "bg-warning-text"}`}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-text">{item.label}</span>
          {item.hint ? <span className="block text-xs text-text-secondary">{item.hint}</span> : null}
        </span>
        <span
          className={`text-lg font-bold tabular-nums ${urgent ? "text-danger-text" : "text-text"}`}
          data-numeric
        >
          {item.count}
          {item.more ? "+" : ""}
        </span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-text-muted" />
      </Link>
    </li>
  );
}

/**
 * Everything waiting on Operations, in one list, most urgent first. Each row opens the screen
 * where it is dealt with. Counts come from the same endpoints those screens use, so they agree
 * with what the operator sees when they click through.
 */
export function AttentionStrip(): ReactNode {
  const cases = useCaseQueueSummary();
  const lateVisits = useDashboardAggregates("booking");
  const stuck = useStuckQueues();
  const withdrawals = useWithdrawals("PENDING_APPROVAL");
  const applications = useApplicationQueue({ status: "SUBMITTED" });
  const crew = useCrewVerificationQueue("PENDING");
  const customItems = useCustomItemReviews();
  const rentalListings = useQuery({
    queryKey: ["ops-rentals", "PENDING", "count"],
    queryFn: () => fetchOpsRentalsPage(undefined, "PENDING"),
  });
  const disputes = useQuery({ queryKey: ["ops-rental-disputes"], queryFn: fetchOpsRentalDisputes });
  const deliveryQuotes = useQuery({
    queryKey: ["ops-rental-bookings", "AWAITING_TRANSPORT_QUOTE", "count"],
    queryFn: () => fetchOpsRentalBookingsPage(undefined, { status: "AWAITING_TRANSPORT_QUOTE" }),
  });
  const stays = useQuery({
    queryKey: ["ops-stays", "PENDING", "count"],
    queryFn: () => fetchOpsStaysPage(undefined, "PENDING"),
  });

  const applicationsPage = applications.data?.pages[0];
  const withdrawalsPage = withdrawals.data?.pages[0];
  const overdueVisits = lateVisits.data?.overdue_bookings;
  const stuckRequests = stuck.data
    ? stuck.data.queues.reduce((sum, queue) => sum + queue.depth, 0)
    : null;

  const items = itemsToShow([
    {
      tone: "urgent",
      label: "Cases past their deadline",
      hint: "Oldest first in the case queue",
      href: "/operations/cases",
      count: cases.data?.breaching_sla ?? null,
    },
    {
      tone: "urgent",
      label: "Visits running late",
      hint: "Start time passed and the professional hasn't started",
      href: "/operations/dispatch",
      count: typeof overdueVisits === "number" ? overdueVisits : null,
    },
    {
      tone: "urgent",
      label: "Stuck crew and project requests",
      hint: "Past a deadline with no next step",
      href: "/operations/requests",
      count: stuckRequests,
    },
    {
      tone: "urgent",
      label: "Partner withdrawals to approve",
      hint: "A partner is waiting for their money",
      href: "/operations/payouts?tab=withdrawals",
      count: withdrawalsPage ? withdrawalsPage.results.length : null,
      more: Boolean(withdrawalsPage?.next),
    },
    {
      tone: "urgent",
      label: "Cases holding a partner payout",
      href: "/operations/cases",
      count: cases.data?.holding_payout ?? null,
    },
    {
      label: "Partner applications to review",
      href: "/reviews",
      count: applicationsPage ? applicationsPage.results.length : null,
      more: Boolean(applicationsPage?.next),
    },
    { label: "Crew documents to check", href: "/operations/crew-documents", count: crew.data?.memberships.length ?? null },
    { label: "Custom work items to review", href: "/operations/work-items", count: customItems.data?.reviews.length ?? null },
    {
      label: "Rental listings to review",
      href: "/operations/rentals?tab=listings",
      count: rentalListings.data ? pendingReviewCount(rentalListings.data.results) : null,
      more: Boolean(rentalListings.data?.next),
    },
    {
      label: "Rental deposit disputes",
      href: "/operations/rentals?tab=disputes",
      count: disputes.data ? disputes.data.filter((row) => row.awaiting_decision).length : null,
    },
    {
      label: "Deliveries waiting for an owner's price",
      href: "/operations/rentals?tab=bookings",
      count: deliveryQuotes.data?.results.length ?? null,
      more: Boolean(deliveryQuotes.data?.next),
    },
    {
      label: "Stay properties to review",
      href: "/operations/stays?tab=properties",
      count: stays.data ? pendingReviewCount(stays.data.results) : null,
      more: Boolean(stays.data?.next),
    },
  ]);

  const loading = cases.isPending || applications.isPending;

  return (
    <section aria-labelledby="attention-heading" className="rounded-card border border-line bg-surface shadow-card">
      <div className="flex items-baseline justify-between gap-2 border-b border-line px-4 py-3">
        <h2 id="attention-heading" className="text-base font-bold text-text">
          Needs your attention
        </h2>
        {items.length > 0 ? (
          <span className="text-xs text-text-secondary">Most urgent first</span>
        ) : null}
      </div>
      {items.length > 0 ? (
        <ul className="divide-y divide-line">
          {items.map((item) => (
            <Row key={item.label} item={item} />
          ))}
        </ul>
      ) : (
        <p className="px-4 py-6 text-sm text-text-secondary">
          {loading ? "Checking every queue…" : "All clear. Nothing is waiting on Operations right now."}
        </p>
      )}
    </section>
  );
}
