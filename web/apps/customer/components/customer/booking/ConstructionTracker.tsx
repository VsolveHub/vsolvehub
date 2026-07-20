"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { normalizeBookingStatus } from "@/lib/constants";
import {
  useSimulateBookingStatusMutation,
  useSetBookingStatusMutation,
  useReviewBookingMutation,
} from "@/lib/query/hooks";
import type { Booking } from "@/lib/booking/types";
import { parseConstructionDetails } from "./construction/parseDetails";
import { ActiveJobPanel } from "./construction/ActiveJobPanel";
import { CompletedJobPanel } from "./construction/CompletedJobPanel";

type Props = {
  booking: Booking;
  onRefresh: () => void;
};

export function ConstructionTracker({ booking, onRefresh }: Props) {
  const [otp, setOtp] = useState<string[]>(["", "", "", ""]);
  const [otpVerified, setOtpVerified] = useState(false);
  const [rating, setRating] = useState(booking.rating ?? 5);
  const [review, setReview] = useState("");
  const [reviewSubmitted, setReviewSubmitted] = useState(booking.rating != null);

  const simulateStatusMutation = useSimulateBookingStatusMutation(booking.bookingRef);
  const setStatusMutation = useSetBookingStatusMutation(booking.bookingRef);
  const reviewMutation = useReviewBookingMutation(booking.bookingRef);

  const loading = simulateStatusMutation.isPending || setStatusMutation.isPending || reviewMutation.isPending;
  const [error, setError] = useState("");

  const status = normalizeBookingStatus(booking.status);
  const details = parseConstructionDetails(booking.archetypeDetails);
  const isCompleted = status === "COMPLETED";

  function updateStatus(nextStatus: string) {
    setStatusMutation.mutate(nextStatus, { onSuccess: () => onRefresh() });
  }

  function simulateNextStatus() {
    simulateStatusMutation.mutate(undefined, { onSuccess: () => onRefresh() });
  }

  // Handle OTP digit changes
  function handleOtpChange(index: number, val: string) {
    const cleaned = val.replace(/\D/g, "");
    if (!cleaned) return;

    const copy = [...otp];
    copy[index] = cleaned.slice(-1);
    setOtp(copy);

    // Auto-focus next input
    if (index < 3) {
      const nextInput = document.getElementById(`otp-input-${index + 1}`);
      nextInput?.focus();
    }

    // Auto-verify if full
    const fullCode = copy.join("");
    if (fullCode.length === 4) {
      if (fullCode === "2847") {
        setOtpVerified(true);
        setError("");
      } else {
        setError("Invalid OTP. Hint: Use 2 8 4 7");
      }
    }
  }

  function submitFeedback() {
    setError("");
    reviewMutation.mutate({ rating, review }, {
      onSuccess: () => {
        setReviewSubmitted(true);
        onRefresh();
      },
      onError: (err: any) => {
        setError(err.message || "Could not submit review");
      },
    });
  }

  // Resolve step badge and title (matches the 10-screen booking diagram)
  const badge = isCompleted ? 10 : 9;
  const title = isCompleted ? "Work Completed" : "Live Tracking";

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col bg-white md:min-h-screen">
      {/* Navbar */}
      <div className="flex items-center gap-3 bg-[var(--color-brand)] px-4 py-3 text-white shadow-sm">
        <Link href="/" className="text-xl leading-none text-white/80 transition-colors hover:text-white">
          ←
        </Link>
        <span className="truncate text-sm font-black uppercase tracking-widest">Construction Tracker</span>
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
        {!isCompleted ? (
          <ActiveJobPanel booking={booking} status={status} loading={loading} onSimulateNext={simulateNextStatus} details={details} />
        ) : (
          <CompletedJobPanel
            booking={booking}
            otp={otp}
            otpVerified={otpVerified}
            error={error}
            onOtpChange={handleOtpChange}
            reviewSubmitted={reviewSubmitted}
            rating={rating}
            setRating={setRating}
            review={review}
            setReview={setReview}
            loading={loading}
            onSubmitFeedback={submitFeedback}
          />
        )}
      </div>

      {/* Sticky bottom actions */}
      <div className="sticky bottom-0 flex gap-3 border-t border-gray-100 bg-white p-4">
        {!isCompleted ? (
          <>
            <a
              href="tel:9876543210"
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
            <Button variant="secondary" block onClick={() => updateStatus("CANCELLED")} loading={loading}>
              Cancel
            </Button>
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
