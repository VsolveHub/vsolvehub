"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button, EmptyState, ErrorState, Skeleton } from "@vsolve/ui";

import {
  fetchMyStayEnquiries,
  fetchMyStayReservations,
  fetchMyStayVisits,
} from "@/features/stays/queries";
import { StayEnquiryCard, StayReservationCard, StayVisitCard } from "@/features/stays/view";

type Tab = "enquiries" | "visits" | "reservations";

function MyStays() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = searchParams?.get("tab");
  const activeTab: Tab =
    requested === "visits" || requested === "reservations" ? requested : "enquiries";

  const enquiries = useQuery({ queryKey: ["my-stay-enquiries"], queryFn: fetchMyStayEnquiries });
  const visits = useQuery({ queryKey: ["my-stay-visits"], queryFn: fetchMyStayVisits });
  // Paid reservations are a legacy mode; the tab only appears for guests who have one.
  const reservations = useQuery({
    queryKey: ["my-stay-reservations"],
    queryFn: fetchMyStayReservations,
  });

  const enquiryRows = enquiries.data ?? [];
  const visitRows = visits.data ?? [];
  const reservationRows = reservations.data ?? [];
  const openVisits = visitRows.filter((v) => v.status === "REQUESTED" || v.status === "ACCEPTED");

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "enquiries", label: `Enquiries (${enquiryRows.length})` },
    { key: "visits", label: `Visits (${openVisits.length})` },
    ...(reservationRows.length > 0
      ? [{ key: "reservations" as const, label: `Reservations (${reservationRows.length})` }]
      : []),
  ];

  const current =
    activeTab === "visits" ? visits : activeTab === "reservations" ? reservations : enquiries;

  function setTab(next: Tab) {
    router.replace(next === "enquiries" ? "/stays/mine" : `/stays/mine?tab=${next}`, {
      scroll: false,
    });
  }

  const explore = (
    <Link href="/stays">
      <Button className="font-bold">Explore Rooms & Stays</Button>
    </Link>
  );

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-2">
        <Link
          href="/stays"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-text-secondary transition hover:text-text"
        >
          <ArrowLeft className="size-3.5" />
          Back to Stays & PG
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div>
            <h1 className="text-2xl font-extrabold text-text sm:text-3xl">My Stays</h1>
            <p className="mt-0.5 text-xs text-text-secondary">
              Your enquiries and visits, with the owner&apos;s number to call.
            </p>
          </div>
          <Link href="/stays">
            <Button size="sm" variant="secondary" className="font-bold">
              + Explore Stays
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-line pb-2" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setTab(tab.key)}
            className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
              activeTab === tab.key
                ? "bg-action text-white"
                : "border border-line bg-surface text-text-secondary hover:text-text"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {current.isLoading ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 2 }).map((_, idx) => (
            <div key={idx} className="space-y-3 rounded-[var(--radius-card)] border border-line p-5">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-8 w-1/3" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      ) : current.error ? (
        <ErrorState
          title="Could not load your stays"
          message={(current.error as Error).message}
          actionLabel="Retry"
          onAction={() => void current.refetch()}
        />
      ) : activeTab === "visits" ? (
        visitRows.length === 0 ? (
          <EmptyState
            title="No visits yet"
            description="Open a property and choose “Schedule a visit” to see it in person."
            action={explore}
          />
        ) : (
          <div className="flex flex-col gap-4">
            {visitRows.map((visit) => (
              <StayVisitCard key={visit.id} visit={visit} />
            ))}
          </div>
        )
      ) : activeTab === "reservations" ? (
        <div className="flex flex-col gap-4">
          {reservationRows.map((reservation) => (
            <StayReservationCard key={reservation.id} reservation={reservation} />
          ))}
        </div>
      ) : enquiryRows.length === 0 ? (
        <EmptyState
          title="No enquiries yet"
          description="Enquire about a room and the owner's number appears here."
          action={explore}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {enquiryRows.map((enquiry) => (
            <StayEnquiryCard key={enquiry.id} enquiry={enquiry} />
          ))}
        </div>
      )}
    </main>
  );
}

export default function MyStayEnquiriesPage() {
  return (
    <Suspense fallback={null}>
      <MyStays />
    </Suspense>
  );
}
