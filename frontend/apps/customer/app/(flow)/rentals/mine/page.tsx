"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Clock, PackageCheck, Wrench } from "lucide-react";
import { Button, EmptyState, ErrorState, Skeleton } from "@vsolve/ui";

import { rentalMineBucket } from "@/features/rentals/model";
import { fetchMyRentals } from "@/features/rentals/queries";
import { RentalBookingCard } from "@/features/rentals/view";

export default function MyRentalsPage() {
  const [activeTab, setActiveTab] = useState<"ALL" | "UPCOMING" | "ONGOING" | "RETURNED">("ALL");

  const {
    data: bookings = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["my-rentals"],
    queryFn: fetchMyRentals,
  });

  const filteredBookings = bookings.filter((b) => {
    const s = (b.status ?? "").toUpperCase();
    if (activeTab !== "ALL" && rentalMineBucket(s) !== activeTab) return false;
    return true;
  });

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      {/* Navigation and Header */}
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

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-line pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("ALL")}
          className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
            activeTab === "ALL"
              ? "bg-action text-white"
              : "bg-surface border border-line text-text-secondary hover:text-text"
          }`}
        >
          All Rentals ({bookings.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("UPCOMING")}
          className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
            activeTab === "UPCOMING"
              ? "bg-action text-white"
              : "bg-surface border border-line text-text-secondary hover:text-text"
          }`}
        >
          Upcoming
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("ONGOING")}
          className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
            activeTab === "ONGOING"
              ? "bg-action text-white"
              : "bg-surface border border-line text-text-secondary hover:text-text"
          }`}
        >
          Ongoing
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("RETURNED")}
          className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
            activeTab === "RETURNED"
              ? "bg-action text-white"
              : "bg-surface border border-line text-text-secondary hover:text-text"
          }`}
        >
          Returned
        </button>
      </div>

      {/* Content State */}
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
        </div>
      )}
    </main>
  );
}
