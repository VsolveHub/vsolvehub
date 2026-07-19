import { formatPrice } from "@/lib/format";
import type { Booking } from "@/lib/booking/types";
import { ReviewPanel } from "./ReviewPanel";

type Props = {
  booking: Booking;
  rating: number;
  setRating: (val: number) => void;
  review: string;
  setReview: (val: string) => void;
  reviewSubmitted: boolean;
  error: string;
  loading: boolean;
  submitReview: () => void;
  onShowDetails: () => void;
};

export function CompletedJobPanel({
  booking,
  rating,
  setRating,
  review,
  setReview,
  reviewSubmitted,
  error,
  loading,
  submitReview,
  onShowDetails,
}: Props) {
  return (
    <div className="flex flex-col gap-4">
      {/* Completed Card Banner */}
      <div className="bg-emerald-50/40 border border-emerald-100 rounded-3xl p-6 text-center flex flex-col items-center gap-3 relative overflow-hidden select-none">
        <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-2xl shadow-inner">
          ✓
        </div>
        <h2 className="font-black text-gray-900 text-lg m-0">Job Completed!</h2>
        <p className="text-xs text-gray-500 font-semibold m-0">Order #{booking.bookingRef}</p>
      </div>

      {/* Experience / rating card — submits to the real /review API which
          refreshes the partner's aggregate rating on their dashboard. */}
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

      {/* Paid Amount Card */}
      <div className="bg-purple-100/40 border border-purple-200/40 rounded-3xl p-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-sm">💵</span>
          <p className="text-xs font-bold text-purple-955 m-0">
            Paid Amount ₹{formatPrice(booking.finalAmountPaise ?? booking.quotedAmount)}
          </p>
        </div>
        <button
          type="button"
          onClick={onShowDetails}
          className="text-xs font-bold text-purple-700 hover:text-purple-950 underline decoration-2 cursor-pointer"
        >
          View Details
        </button>
      </div>

      {/* Real invoice — opens a print/save-as-PDF invoice built from DB data */}
      <a
        href={`/booking/invoice/${booking.bookingRef}`}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full py-3 bg-white border border-purple-200 text-purple-800 text-xs font-bold rounded-2xl flex items-center justify-center gap-2 no-underline hover:bg-purple-50"
      >
        ⬇ Download invoice
      </a>

      {/* Refer & Earn Card */}
      <div className="bg-gradient-to-r from-amber-400 to-amber-500 rounded-3xl p-4 text-purple-955 shadow-sm relative overflow-hidden flex justify-between items-center select-none">
        <div>
          <p className="font-extrabold text-xs m-0">Refer & Earn</p>
          <p className="text-[9px] font-medium opacity-90 mt-0.5 m-0">Get ₹50 for every friend you invite</p>
        </div>
        <span className="text-2xl opacity-60">🎉</span>
      </div>
    </div>
  );
}
