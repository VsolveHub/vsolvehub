import Link from "next/link";
import { formatPrice } from "@/lib/format";
import type { Booking, BookingParty } from "@/lib/booking/types";
import { TeamActivePanel } from "./TeamActivePanel";
import { TeamCompletedPanel } from "./TeamCompletedPanel";
import type { StepDetails } from "./steps";

type Props = {
  booking: Booking;
  professional: BookingParty | null;
  isCompleted: boolean;
  currentStatusIndex: number;
  getStepDetails: (stepKey: string, idx: number) => StepDetails | null;
  rating: number;
  setRating: (val: number) => void;
  review: string;
  setReview: (val: string) => void;
  cancelBooking: () => void;
  loading: boolean;
};

export function TeamTrackerView({
  booking,
  professional,
  isCompleted,
  currentStatusIndex,
  getStepDetails,
  rating,
  setRating,
  review,
  setReview,
  cancelBooking,
  loading,
}: Props) {
  const badge = isCompleted ? 12 : 11;
  const title = isCompleted ? "Confirm Completion" : "Live Tracking";
  const teamName = professional?.name || "Raju Electricals";
  const crewTotal = formatPrice(booking.finalAmountPaise ?? booking.quotedAmount);

  return (
    <div className="flow-page-shell">
      <div className="flow-page-shell__inner flex flex-col">
      {/* Header Bar */}
      <div className="flex items-center gap-3 px-4 py-3 bg-purple-900 text-white shadow-sm select-none">
        <Link href="/" className="text-xl leading-none text-purple-200 hover:text-white cursor-pointer no-underline">
          ←
        </Link>
        <span className="font-semibold text-sm truncate">Electrician — Team</span>
      </div>

      {/* Numbered Step Progress Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-purple-50 border-b border-purple-100/60 select-none">
        <span className="w-5 h-5 flex items-center justify-center bg-purple-600 text-white font-bold rounded-full text-[10px] shadow-sm">
          {badge}
        </span>
        <span className="font-bold text-xs text-purple-900">{title}</span>
      </div>

      {/* Scrollable Tracker Content */}
      <div className="flex-grow overflow-y-auto p-4 flex flex-col gap-4 pb-20">
        {!isCompleted ? (
          <TeamActivePanel teamName={teamName} currentStatusIndex={currentStatusIndex} getStepDetails={getStepDetails} />
        ) : (
          <TeamCompletedPanel
            bookingRef={booking.bookingRef}
            crewTotal={crewTotal}
            rating={rating}
            setRating={setRating}
            review={review}
            setReview={setReview}
          />
        )}
      </div>

      {/* Component Footer Bar (inside simulator frame) */}
      {!isCompleted ? (
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 flex gap-3.5 z-40 select-none items-center justify-between">
          <div className="flex gap-2">
            <button type="button" className="w-11 h-11 rounded-2xl bg-purple-50 text-purple-800 flex items-center justify-center text-lg border border-purple-100/50">
              📞
            </button>
            <button type="button" className="w-11 h-11 rounded-2xl bg-purple-50 text-purple-800 flex items-center justify-center text-lg border border-purple-100/50">
              💬
            </button>
          </div>
          <button type="button" onClick={cancelBooking} disabled={loading} className="border border-red-500 hover:bg-red-50 text-red-500 font-extrabold text-xs rounded-2xl py-3 flex-grow text-center cursor-pointer transition-all disabled:opacity-50">
            Cancel
          </button>
        </div>
      ) : (
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 flex justify-between items-center gap-4 z-40 select-none">
          <div>
            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Total Amount Paid</span>
            <p className="font-black text-purple-955 text-sm m-0">₹{crewTotal}</p>
          </div>
          <Link
            href="/"
            className="py-3 bg-purple-900 hover:bg-purple-955 text-white text-xs font-bold rounded-full px-8 text-center cursor-pointer transition-all no-underline shadow"
          >
            Back to Home
          </Link>
        </div>
      )}

      </div>
    </div>
  );
}
