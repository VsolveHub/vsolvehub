import { formatPrice } from "@/lib/format";
import Link from "next/link";
import type { Booking, BookingParty } from "@/lib/booking/types";
import { BookingTimeline } from "./BookingTimeline";
import { ProfessionalCard } from "./ProfessionalCard";
import { DetailedBookingCard } from "./DetailedBookingCard";
import { RightInvoicePanel } from "./RightInvoicePanel";
import type { StepDetails } from "./steps";

type Props = {
  booking: Booking;
  professional: BookingParty | null;
  status: string;
  currentStatusIndex: number;
  getStepDetails: (stepKey: string, idx: number) => StepDetails;
  onShowDetails: () => void;
  loading?: boolean;
  reviseAction?: (action: "approve" | "decline") => void;
  rating?: number;
  setRating?: (val: number) => void;
  review?: string;
  setReview?: (val: string) => void;
  reviewSubmitted?: boolean;
  error?: string;
  submitReview?: () => void;
};

export function DesktopPanel({
  booking,
  professional,
  status,
  currentStatusIndex,
  getStepDetails,
  onShowDetails,
  loading = false,
  reviseAction,
  rating,
  setRating,
  review,
  setReview,
  reviewSubmitted,
  error,
  submitReview,
}: Props) {
  // Show map ONLY while provider is searching/en-route. Hide map when arrived at location / working / completed.
  const showMap = ["SEARCHING_PROVIDER", "ASSIGNED", "PROVIDER_ARRIVING"].includes(status) && status !== "ON_THE_WAY" && status !== "STARTED" && status !== "COMPLETED";

  return (
    <div className="grid w-full gap-6 lg:grid-cols-[minmax(0,440px)_1fr]">
      {/* Left: live tracking card */}
      <div className="flex flex-col rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-[#ea580c]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            Live tracking
          </span>
          <span className="rounded-full bg-[#fff7ed] px-3 py-1 text-xs font-bold text-[#ea580c] border border-[#ffedd5]">
            {status === "STARTED" ? "Work in progress" : status === "ON_THE_WAY" ? "Arrived at location" : status === "COMPLETED" ? "Completed" : "On the way"}
          </span>
        </div>

        <h2 className="mt-4 text-2xl font-black text-black">{booking.service.name}</h2>
        <p className="mt-1 text-sm text-gray-400">ID: #{booking.bookingRef}</p>

        <div className="mt-5">
          <ProfessionalCard professional={professional} variant="desktop" />
        </div>

        {/* Revised quote banner for extra parts */}
        {booking.revisedAmountPaise && reviseAction ? (
          <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
            <div className="flex items-center gap-2 text-amber-900 font-extrabold text-xs">
              <span>🔧</span>
              <span>Extra parts requested by technician</span>
            </div>
            <p className="mt-1 text-xs text-amber-800 font-bold">
              {booking.revisedReason?.replace(/^Extra parts:\s*/i, "") || "Additional parts required"}
            </p>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-gray-600 font-medium">Extra Charge</span>
              <span className="font-black text-amber-950 text-sm">+{formatPrice(booking.revisedAmountPaise)}</span>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => reviseAction("decline")}
                disabled={loading}
                className="flex-1 rounded-xl border border-gray-300 bg-white py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={() => reviseAction("approve")}
                disabled={loading}
                className="flex-1 rounded-xl bg-[#ea580c] py-2 text-xs font-black text-white hover:bg-[#c2410c] shadow-sm disabled:opacity-50"
              >
                Approve +{formatPrice(booking.revisedAmountPaise)}
              </button>
            </div>
          </div>
        ) : null}

        {/* Start code — read aloud to the technician to start the job (desktop) */}
        {booking.startOtp && ["ASSIGNED", "PROVIDER_ARRIVING"].includes(status) && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-dashed border-[#ea580c]/30 bg-[#fff7ed] p-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#ea580c]">Start code</p>
              <p className="text-[10px] text-gray-500">Share with your technician to begin</p>
            </div>
            <p className="text-2xl font-extrabold tracking-[0.3em] text-[#ea580c]">{booking.startOtp}</p>
          </div>
        )}

        {/* Tracking updates */}
        <div className="mt-6">
          <h3 className="mb-4 text-[11px] font-black uppercase tracking-widest text-gray-400">
            Tracking updates
          </h3>
          <BookingTimeline currentStatusIndex={currentStatusIndex} getStepDetails={getStepDetails} variant="desktop" />
        </div>

        {/* Footer actions */}
        <div className="mt-6 flex gap-3 border-t border-gray-100 pt-5">
          <button
            type="button"
            onClick={onShowDetails}
            className="flex-1 rounded-xl border border-gray-200 py-3 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-50 cursor-pointer"
          >
            Booking details
          </button>
          <Link
            href="/profile/messages"
            className="flex flex-1 items-center justify-center rounded-xl bg-[#ea580c] py-3 text-xs font-bold text-white transition-colors hover:bg-[#c2410c] no-underline"
          >
            Chat with partner
          </Link>
        </div>
      </div>

      {/* Right Column: If arrived / working / completed -> Show Detailed Invoice & Rating. Otherwise -> Show Map */}
      {!showMap ? (
        <RightInvoicePanel
          booking={booking}
          professional={professional}
          status={status}
          rating={rating}
          setRating={setRating}
          review={review}
          setReview={setReview}
          reviewSubmitted={reviewSubmitted}
          error={error}
          loading={loading}
          submitReview={submitReview}
        />
      ) : (
        <div className="relative min-h-[420px] overflow-hidden rounded-3xl border border-gray-200 shadow-sm">
          <img
            src="https://images.unsplash.com/photo-1524661135-423995f22d0b?w=1200"
            alt="Live tracking map"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0">
            {/* User location pin */}
            <div className="absolute -translate-x-1/2" style={{ top: "60%", left: "55%" }}>
              <div className="mx-auto h-3.5 w-3.5 rounded-full border-2 border-white bg-gray-700 shadow" />
              <div className="mt-1 whitespace-nowrap rounded-md bg-white/90 px-2 py-0.5 text-[10px] font-bold text-gray-700 shadow">
                My location
              </div>
            </div>

            {/* Provider location pin */}
            {professional && (
              <div className="absolute -translate-x-1/2" style={{ top: "45%", left: "33%" }}>
                <div className="relative mx-auto h-3.5 w-3.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ea580c] opacity-60" />
                  <span className="relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-white bg-[#ea580c] shadow" />
                </div>
                <div className="mt-1 whitespace-nowrap rounded-md bg-[#ea580c] px-2 py-0.5 text-[10px] font-bold text-white shadow">
                  Expert: {professional.name.split(" ")[0]} J.
                </div>
              </div>
            )}

            {/* Route line */}
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <path d="M 33,45 L 40,45 L 40,60 L 55,60" fill="none" stroke="#ea580c" strokeWidth="0.5" strokeDasharray="1" />
            </svg>
          </div>

          {/* Map controls */}
          <div className="absolute right-4 top-4 flex flex-col gap-2">
            <button type="button" aria-label="Zoom in" className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg font-bold text-gray-700 shadow-md transition-colors hover:bg-gray-50">
              +
            </button>
            <button type="button" aria-label="Zoom out" className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg font-bold text-gray-700 shadow-md transition-colors hover:bg-gray-50">
              −
            </button>
            <button type="button" aria-label="Recenter" className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-base shadow-md transition-colors hover:bg-gray-50">
              🎯
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

