"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button, EmptyState, ErrorState, Skeleton } from "@vsolve/ui";

import { fetchMyStayEnquiries, fetchMyStayReservations } from "@/features/stays/queries";
import { StayEnquiryCard, StayReservationCard } from "@/features/stays/view";

export default function MyStayEnquiriesPage() {
  const [activeTab, setActiveTab] = useState<"ALL" | "PENDING" | "RESPONDED" | "RESERVATIONS">("RESERVATIONS");

  const {
    data: enquiries = [],
    isLoading: enquiriesLoading,
    error: enquiriesError,
    refetch: refetchEnquiries,
  } = useQuery({
    queryKey: ["my-stay-enquiries"],
    queryFn: fetchMyStayEnquiries,
  });

  const {
    data: reservations = [],
    isLoading: reservationsLoading,
    error: reservationsError,
    refetch: refetchReservations,
  } = useQuery({
    queryKey: ["my-stay-reservations"],
    queryFn: fetchMyStayReservations,
  });

  const filteredEnquiries = enquiries.filter((e) => {
    const s = (e.status ?? "").toUpperCase();
    if (activeTab === "PENDING") {
      return s === "SUBMITTED";
    }
    if (activeTab === "RESPONDED") {
      return ["RESPONDED", "DECLINED", "WITHDRAWN", "EXPIRED"].includes(s);
    }
    return true;
  });

  const isLoading = activeTab === "RESERVATIONS" ? reservationsLoading : enquiriesLoading;
  const error = activeTab === "RESERVATIONS" ? reservationsError : enquiriesError;
  const refetch = activeTab === "RESERVATIONS" ? refetchReservations : refetchEnquiries;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      {/* Navigation and Header */}
      <div className="flex flex-col gap-2">
        <Link
          href="/stays"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-text-secondary hover:text-text transition"
        >
          <ArrowLeft className="size-3.5" />
          Back to Stays & PG
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div>
            <h1 className="text-2xl font-extrabold text-text sm:text-3xl">My Stays</h1>
            <p className="mt-0.5 text-xs text-text-secondary">
              Track your reservations, host responses, and availability.
            </p>
          </div>
          <Link href="/stays">
            <Button size="sm" variant="secondary" className="font-bold">
              + Explore Stays
            </Button>
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-line pb-2 flex-wrap">
        <button
          type="button"
          onClick={() => setActiveTab("RESERVATIONS")}
          className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
            activeTab === "RESERVATIONS"
              ? "bg-action text-white"
              : "bg-surface border border-line text-text-secondary hover:text-text"
          }`}
        >
          Reservations ({reservations.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("ALL")}
          className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
            activeTab === "ALL"
              ? "bg-action text-white"
              : "bg-surface border border-line text-text-secondary hover:text-text"
          }`}
        >
          All Enquiries ({enquiries.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("PENDING")}
          className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
            activeTab === "PENDING"
              ? "bg-action text-white"
              : "bg-surface border border-line text-text-secondary hover:text-text"
          }`}
        >
          Awaiting Host Response
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("RESPONDED")}
          className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
            activeTab === "RESPONDED"
              ? "bg-action text-white"
              : "bg-surface border border-line text-text-secondary hover:text-text"
          }`}
        >
          Host Responded
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
          title="Could not load your data"
          message={(error as Error).message}
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      ) : activeTab === "RESERVATIONS" ? (
        reservations.length === 0 ? (
          <EmptyState
            title="No stay reservations found"
            description="You don't have any confirmed stay reservations yet."
            action={
              <Link href="/stays">
                <Button className="font-bold">Explore Rooms & Stays</Button>
              </Link>
            }
          />
        ) : (
          <div className="flex flex-col gap-4">
            {reservations.map((reservation) => (
              <StayReservationCard key={reservation.id} reservation={reservation} />
            ))}
          </div>
        )
      ) : filteredEnquiries.length === 0 ? (
        <EmptyState
          title="No stay enquiries found"
          description={
            activeTab === "ALL"
              ? "You haven't enquired about any rooms or stays yet. Check out verified properties in your area."
              : `No ${activeTab.toLowerCase()} stay enquiries at this time.`
          }
          action={
            <Link href="/stays">
              <Button className="font-bold">Explore Rooms & Stays</Button>
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {filteredEnquiries.map((enquiry) => (
            <StayEnquiryCard key={enquiry.id} enquiry={enquiry} />
          ))}
        </div>
      )}
    </main>
  );
}

