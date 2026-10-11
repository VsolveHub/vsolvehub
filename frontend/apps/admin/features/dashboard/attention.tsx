"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import type { ReactNode } from "react";

import { useCrewVerificationQueue } from "@/features/crew-verification/queries";
import { useCustomItemReviews } from "@/features/m2-work-items/queries";
import {
  fetchOpsRentalBookings,
  fetchOpsRentalDisputes,
  fetchOpsRentals,
  fetchOpsStays,
} from "@/features/moderation/queries";
import { useApplicationQueue } from "@/features/partner-review/queries";

type Item = { label: string; href: string; count: number | null; more?: boolean };

/** Rows waiting on a decision. Exported for tests. */
export function pendingReviewCount(rows: { moderation_status?: string; public_state?: string }[]): number {
  return rows.filter((row) => row.moderation_status === "PENDING" || row.public_state === "PENDING_REVIEW").length;
}

/** Only the items with something waiting, busiest first, so an empty strip means a clear desk. */
export function itemsToShow(items: Item[]): Item[] {
  return items.filter((item) => (item.count ?? 0) > 0).sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
}

function Tile({ item }: { item: Item }) {
  return (
    <Link
      href={item.href}
      className="flex items-center justify-between gap-3 rounded-card border border-warning-line bg-warning-surface px-4 py-3 text-sm hover:border-line-strong"
    >
      <span className="font-medium text-warning-text">{item.label}</span>
      <span className="text-lg font-bold text-warning-text" data-numeric>
        {item.count}
        {item.more ? "+" : ""}
      </span>
    </Link>
  );
}

/**
 * Everything outside the case queue that is waiting on Operations, in one strip. Each tile opens
 * the screen where the decision is made. Counts are read from the same endpoints those screens
 * use, so they agree with what the operator sees when they click through.
 */
export function AttentionStrip(): ReactNode {
  const applications = useApplicationQueue({ status: "SUBMITTED" });
  const crew = useCrewVerificationQueue("PENDING");
  const customItems = useCustomItemReviews();
  const rentalListings = useQuery({ queryKey: ["ops-rentals-attention"], queryFn: fetchOpsRentals });
  const disputes = useQuery({ queryKey: ["ops-rental-disputes"], queryFn: fetchOpsRentalDisputes });
  const deliveryQuotes = useQuery({
    queryKey: ["ops-rental-bookings", "AWAITING_TRANSPORT_QUOTE"],
    queryFn: () => fetchOpsRentalBookings("AWAITING_TRANSPORT_QUOTE"),
  });
  const stays = useQuery({ queryKey: ["ops-stays-attention"], queryFn: fetchOpsStays });

  const firstPage = applications.data?.pages[0];
  const items = itemsToShow([
    {
      label: "Partner applications to review",
      href: "/reviews",
      count: firstPage ? firstPage.results.length : null,
      more: Boolean(firstPage?.next),
    },
    { label: "Crew documents to check", href: "/operations/crew-documents", count: crew.data?.memberships.length ?? null },
    { label: "Custom work items to review", href: "/operations/work-items", count: customItems.data?.reviews.length ?? null },
    {
      label: "Rental listings to review",
      href: "/operations/rentals?tab=listings",
      count: rentalListings.data ? pendingReviewCount(rentalListings.data) : null,
    },
    {
      label: "Rental deposit disputes",
      href: "/operations/rentals?tab=disputes",
      count: disputes.data ? disputes.data.filter((row) => row.awaiting_decision).length : null,
    },
    {
      label: "Deliveries waiting for an owner's price",
      href: "/operations/rentals?tab=bookings",
      count: deliveryQuotes.data?.length ?? null,
    },
    {
      label: "Stay properties to review",
      href: "/operations/stays?tab=properties",
      count: stays.data ? pendingReviewCount(stays.data) : null,
    },
  ]);

  if (items.length === 0) return null;
  return (
    <section aria-labelledby="attention-heading" className="mx-auto w-full max-w-6xl px-4 pt-6">
      <h2 id="attention-heading" className="mb-3 text-base font-bold text-text">
        Waiting on you
      </h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <Tile key={item.href} item={item} />
        ))}
      </div>
    </section>
  );
}
