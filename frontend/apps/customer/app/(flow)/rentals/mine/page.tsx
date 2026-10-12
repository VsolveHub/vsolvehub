"use client";

import Link from "next/link";
import { useState } from "react";
import { usePagedList } from "@vsolve/query";
import { ArrowLeft } from "lucide-react";
import { Button, EmptyState, ErrorState, LoadMore, Skeleton } from "@vsolve/ui";

import { RENTAL_TAB_STATUSES, type RentalMineTab } from "@/features/rentals/model";
import { fetchMyRentalsPage } from "@/features/rentals/queries";
import { RentalBookingCard } from "@/features/rentals/view";

const TABS: { key: RentalMineTab; label: string }[] = [
  { key: "ALL", label: "All Rentals" },
  { key: "UPCOMING", label: "Upcoming" },
  { key: "ONGOING", label: "Ongoing" },
  { key: "RETURNED", label: "Returned" },
  { key: "INACTIVE", label: "Cancelled / Disputed" },
];

export default function MyRentalsPage() {
  const [activeTab, setActiveTab] = useState<RentalMineTab>("ALL");

  const statuses = RENTAL_TAB_STATUSES[activeTab];
  const list = usePagedList(["my-rentals", statuses], (cursor) =>
    fetchMyRentalsPage(cursor, statuses || undefined),
  );
  const { isLoading, error, refetch } = list;
  const filteredBookings = list.items;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-2">
        <Link
          href="/rentals"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-text-secondary hover:text-text transition"
        >
          <ArrowLeft className="size-3.5" />
          Back to Equipment Rentals
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div>
            <h1 className="text-2xl font-extrabold text-text sm:text-3xl">My Rentals</h1>
            <p className="mt-0.5 text-xs text-text-secondary">
              Track equipment bookings, pickup dates, and security deposit refunds.
            </p>
          </div>
          <Link href="/rentals">
            <Button size="sm" variant="secondary" className="font-bold">
              + Rent Another Tool
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-line pb-2">
        {TABS.map((tab) => {
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
                activeTab === tab.key
                  ? "bg-action text-white"
                  : "bg-surface border border-line text-text-secondary hover:text-text"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 2 }).map((_, idx) => (
            <div key={idx} className="rounded-[var(--radius-card)] border border-line p-5 space-y-3">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-8 w-1/3" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      ) : error ? (
        <ErrorState
          title="Could not load your rentals"
          message={(error as Error).message}
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      ) : filteredBookings.length === 0 ? (
        <EmptyState
          title="No rental bookings found"
          description={
            activeTab === "ALL"
              ? "You haven't rented any tools or equipment yet. Explore our verified rental catalog."
              : activeTab === "INACTIVE"
                ? "No cancelled or disputed rental bookings right now."
                : `No ${activeTab.toLowerCase()} rental bookings right now.`
          }
          action={
            <Link href="/rentals">
              <Button className="font-bold">Browse Equipment Rentals</Button>
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {filteredBookings.map((booking) => (
            <RentalBookingCard key={booking.id} booking={booking} />
          ))}
          <LoadMore hasMore={list.hasMore} loading={list.loadingMore} onLoadMore={list.loadMore} />
        </div>
      )}
    </main>
  );
}
