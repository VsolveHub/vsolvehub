"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { normalizeBookingStatus } from "@/lib/constants";
import { useReviewBookingMutation } from "@/lib/query/hooks";
import type { Booking } from "@/lib/booking/types";
import { TrackStep } from "./beautician/TrackStep";
import { CompletedStep } from "./beautician/CompletedStep";
import { InvoiceStep } from "./beautician/InvoiceStep";

type Props = {
  booking: Booking;
  onRefresh: () => void;
};

function getStepInfo(step: "track" | "completed" | "invoice", status: string): { badge: number; title: string } {
  if (step === "invoice") {
    return { badge: 14, title: "Invoice & Review" };
  }
  if (step === "completed") {
    return { badge: 13, title: "Service Completed" };
  }
  if (status === "PROVIDER_ARRIVING") {
    return { badge: 12, title: "Beautician Arrived" };
  }
  if (status === "STARTED") {
    return { badge: 13, title: "Service In Progress" };
  }
  return { badge: 11, title: "Live Tracking" };
}

export function BeauticianTracker({ booking, onRefresh }: Props) {
  const [rating, setRating] = useState(booking.rating ?? 5);
  const [review, setReview] = useState("");
  const [tip, setTip] = useState<number>(0);
  const [step, setStep] = useState<"track" | "completed" | "invoice">(booking.status === "COMPLETED" ? "completed" : "track");

  const [error, setError] = useState("");

  const status = normalizeBookingStatus(booking.status);
  const professional = booking.provider ?? booking.vendor;
  const partnerName = professional?.name ?? "Assigned Partner";

  const reviewMutation = useReviewBookingMutation(booking.bookingRef);

  // Status is driven by the partner (in the partner app). The customer tracker
  // only reflects the real status it polls — it never advances the booking.
  useEffect(() => {
    if (booking.status === "COMPLETED" && step === "track") {
      setStep("completed");
    }
  }, [booking.status, step]);

  function submitFeedback() {
    setError("");
    reviewMutation.mutate(
      { rating, review },
      {
        onSuccess: () => {
          onRefresh();
          setStep("invoice");
        },
        onError: (err: any) => setError(err?.message || "Could not submit review"),
      },
    );
  }

  const { badge, title } = getStepInfo(step, status);

  const inTransit =
    step === "track" &&
    ["PENDING", "SEARCHING_PROVIDER", "ASSIGNED", "ON_THE_WAY", "PROVIDER_ARRIVING"].includes(status);

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col bg-white md:min-h-screen">
      {/* Navbar */}
      <div className="flex items-center gap-3 bg-[var(--color-brand)] px-4 py-3 text-white shadow-sm">
        <Link href="/" className="text-xl leading-none text-white/80 transition-colors hover:text-white">
          ←
        </Link>
        <span className="truncate text-sm font-black uppercase tracking-widest">Booking Details</span>
      </div>

      {/* Step header */}
      <div className="flex items-center gap-3 border-b border-[var(--color-brand)]/20 bg-[var(--color-brand-light)] px-4 py-2.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-brand)] text-[10px] font-black text-white shadow-sm">
          {badge}
        </span>
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-brand)]">{title}</span>
      </div>

      {/* Scrollable content */}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 pb-28">
        {step === "track" && <TrackStep booking={booking} status={status} partnerName={partnerName} />}

        {step === "completed" && (
          <CompletedStep
            partnerName={partnerName}
            rating={rating}
            setRating={setRating}
            tip={tip}
            setTip={setTip}
            review={review}
            setReview={setReview}
            error={error}
            loading={reviewMutation.isPending}
            onSubmit={submitFeedback}
          />
        )}

        {step === "invoice" && <InvoiceStep booking={booking} partnerName={partnerName} tip={tip} />}
      </div>

      {/* Sticky bottom actions */}
      <div className="sticky bottom-0 flex gap-3 border-t border-gray-100 bg-white p-4">
        {inTransit ? (
          <>
            <a
              href={`tel:${professional?.phone ?? "9876543210"}`}
              className="flex flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white py-3 text-sm font-bold text-gray-900 transition-colors hover:bg-gray-50"
            >
              Call
            </a>
            <Link
              href="/profile/messages"
              className="flex flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white py-3 text-sm font-bold text-gray-900 transition-colors hover:bg-gray-50"
            >
              Chat
            </Link>
          </>
        ) : (
          <Link
            href="/"
            className="flex flex-1 items-center justify-center rounded-xl bg-[var(--color-brand)] py-3 text-sm font-bold text-white transition-colors hover:bg-blue-900"
          >
            Back to dashboard
          </Link>
        )}
      </div>
    </div>
  );
}
