"use client";

import Link from "next/link";
import { formatPrice } from "@/lib/format";
import type { Booking, BookingParty } from "@/lib/booking/types";
import { ReviewPanel } from "./ReviewPanel";
import { DetailedBookingCard } from "./DetailedBookingCard";

type Props = {
  booking: Booking;
  professional: BookingParty | null;
  status: string;
  rating?: number;
  setRating?: (val: number) => void;
  review?: string;
  setReview?: (val: string) => void;
  reviewSubmitted?: boolean;
  error?: string;
  loading?: boolean;
  submitReview?: () => void;
};

export function RightInvoicePanel({
  booking,
  professional,
  status,
  rating = 5,
  setRating,
  review = "",
  setReview,
  reviewSubmitted = false,
  error = "",
  loading = false,
  submitReview,
}: Props) {
  const isCompleted = status === "COMPLETED";

  return (
    <div className="flex flex-col gap-6">
      {/* Official Invoice Document Box */}
      <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-md space-y-5">
        {/* Invoice Top Bar */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-[#ea580c]">
              OFFICIAL INVOICE &amp; DETAILS
            </span>
            <h2 className="font-heading text-lg font-black text-[#0b1c30] mt-0.5">
              Service Summary
            </h2>
          </div>
          <a
            href={`/booking/invoice/${booking.bookingRef}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-xl bg-[#fff7ed] px-3.5 py-2 text-xs font-extrabold text-[#ea580c] border border-[#ffedd5] hover:bg-[#ea580c] hover:text-white transition-all cursor-pointer no-underline"
          >
            <span>📄</span>
            <span>View PDF Invoice</span>
          </a>
        </div>

        {/* Detailed Booking & Payment Breakdown */}
        <DetailedBookingCard booking={booking} professional={professional} hideHeader hidePartnerCard />
      </div>

      {/* Partner Rating Card ONLY when Service is Completed */}
      {isCompleted && setRating && submitReview && (
        <div className="rounded-3xl border border-amber-200 bg-white p-6 shadow-md space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-[#ea580c]">
                RATE YOUR EXPERIENCE
              </span>
              <h3 className="text-sm font-extrabold text-[#0b1c30] mt-0.5">
                Rate Partner {professional?.name || "Technician"}
              </h3>
            </div>
            <span className="text-xl">⭐</span>
          </div>

          <ReviewPanel
            rating={rating}
            setRating={setRating}
            review={review}
            setReview={setReview ?? (() => {})}
            reviewSubmitted={reviewSubmitted}
            error={error}
            loading={loading}
            onSubmit={submitReview}
          />
        </div>
      )}
    </div>
  );
}
