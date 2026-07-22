"use client";

import Link from "next/link";
import { formatPrice } from "@/lib/format";
import type { Booking, BookingParty } from "@/lib/booking/types";
import { ReviewPanel } from "./ReviewPanel";

type Props = {
  booking: Booking;
  professional: BookingParty | null;
  rating: number;
  setRating: (val: number) => void;
  review: string;
  setReview: (val: string) => void;
  reviewSubmitted: boolean;
  error: string;
  loading: boolean;
  submitReview: () => void;
  onClose: () => void;
};

export function CompletedJobModal({
  booking,
  professional,
  rating,
  setRating,
  review,
  setReview,
  reviewSubmitted,
  error,
  loading,
  submitReview,
  onClose,
}: Props) {
  const totalAmount = booking.finalAmountPaise ?? booking.quotedAmount;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out] select-none">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white p-6 shadow-2xl border border-emerald-200 animate-[scaleUp_0.25s_cubic-bezier(0.16,1,0.3,1)] space-y-5">
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes scaleUp { from { transform: scale(0.92); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        `}} />

        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-sm font-bold p-1 cursor-pointer"
        >
          ✕
        </button>

        {/* Celebratory Checkmark Header */}
        <div className="text-center space-y-2 pt-2">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-3xl font-black shadow-inner">
            ✓
          </div>
          <h2 className="font-heading text-xl font-black text-[#0b1c30]">
            Job Completed Successfully!
          </h2>
          <div className="flex items-center justify-center gap-2 text-xs font-semibold text-slate-500">
            <span>Order #{booking.bookingRef}</span>
            <span>·</span>
            <span className="font-extrabold text-emerald-700">Paid {formatPrice(totalAmount)}</span>
          </div>
        </div>

        {/* Partner Rating Box */}
        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 space-y-3">
          <div className="text-center">
            <span className="text-[10px] font-black uppercase tracking-wider text-[#ea580c]">
              RATE YOUR EXPERIENCE
            </span>
            <h3 className="text-xs font-bold text-[#0b1c30] mt-0.5">
              Rate Partner {professional?.name || "Technician"}
            </h3>
          </div>

          <ReviewPanel
            rating={rating}
            setRating={setRating}
            review={review}
            setReview={setReview}
            reviewSubmitted={reviewSubmitted}
            error={error}
            loading={loading}
            onSubmit={submitReview}
          />
        </div>

        {/* Action Options */}
        <div className="space-y-2.5 pt-1">
          {/* Option 1: PDF Invoice */}
          <a
            href={`/booking/invoice/${booking.bookingRef}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#ea580c] to-[#f97316] hover:from-[#c2410c] hover:to-[#ea580c] text-white font-black text-sm shadow-md shadow-orange-500/20 transition-all cursor-pointer no-underline"
          >
            <span>📄</span>
            <span>Download PDF Invoice</span>
          </a>

          {/* Option 2: View Booking Details */}
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-bold text-xs transition-all cursor-pointer"
          >
            <span>👁️</span>
            <span>View Booking Summary</span>
          </button>

          {/* Option 3: Back to My Bookings */}
          <Link
            href="/profile/bookings"
            className="flex min-h-[40px] w-full items-center justify-center text-slate-500 hover:text-slate-800 font-bold text-xs transition-colors cursor-pointer no-underline"
          >
            ‹ Back to My Bookings
          </Link>
        </div>
      </div>
    </div>
  );
}
