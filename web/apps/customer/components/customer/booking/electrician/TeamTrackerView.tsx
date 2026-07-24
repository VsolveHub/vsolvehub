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
  const teamName = professional?.name || "Assigned team";
  const crewTotal = formatPrice(booking.finalAmountPaise ?? booking.quotedAmount);

  return (
    <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col bg-white md:min-h-screen">
      {/* Header bar */}
      <div className="flex items-center gap-3 bg-[var(--color-brand)] px-4 py-3 text-white shadow-sm">
        <Link href="/" className="text-xl leading-none text-white/80 transition-colors hover:text-white">
          ←
        </Link>
        <span className="truncate text-sm font-black uppercase tracking-widest">Electrician — Team</span>
      </div>

      {/* Numbered step progress header */}
      <div className="flex items-center gap-3 border-b border-[var(--color-brand)]/20 bg-[var(--color-brand-light)] px-4 py-2.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-brand)] text-[10px] font-black text-white shadow-sm">
          {badge}
        </span>
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-brand)]">{title}</span>
      </div>

      {/* Scrollable tracker content */}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 pb-28">
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

      {/* Footer action bar */}
      {!isCompleted ? (
        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-gray-100 bg-white p-4">
          <div className="flex gap-2">
            <a
              href={`tel:${professional?.phone ?? ""}`}
              aria-label="Call team"
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--color-brand)]/20 bg-[var(--color-brand-light)] text-lg text-[var(--color-brand)]"
            >
              📞
            </a>
            <Link
              href="/profile/messages"
              aria-label="Chat with team"
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--color-brand)]/20 bg-[var(--color-brand-light)] text-lg text-[var(--color-brand)]"
            >
              💬
            </Link>
          </div>
          <button
            type="button"
            onClick={cancelBooking}
            disabled={loading}
            className="flex-1 rounded-2xl border border-red-500 py-3 text-xs font-extrabold text-red-500 transition-colors hover:bg-red-50 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="sticky bottom-0 flex items-center justify-between gap-4 border-t border-gray-100 bg-white p-4">
          <div>
            <span className="block text-[9px] font-bold uppercase tracking-wider text-gray-400">
              Total amount paid
            </span>
            <p className="text-sm font-black text-[var(--color-brand)]">{crewTotal}</p>
          </div>
          <Link
            href="/"
            className="rounded-full bg-[var(--color-brand)] px-8 py-3 text-xs font-bold text-white shadow transition-colors hover:bg-blue-900"
          >
            Back to home
          </Link>
        </div>
      )}
    </div>
  );
}
