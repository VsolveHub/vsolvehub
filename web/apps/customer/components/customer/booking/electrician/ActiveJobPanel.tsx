import { formatPrice } from "@/lib/format";
import type { Booking, BookingParty } from "@/lib/booking/types";
import { BookingTimeline } from "./BookingTimeline";
import { ProfessionalCard } from "./ProfessionalCard";
import { DetailedBookingCard } from "./DetailedBookingCard";
import type { StepDetails } from "./steps";

type Props = {
  booking: Booking;
  professional: BookingParty | null;
  status: string;
  currentStatusIndex: number;
  getStepDetails: (stepKey: string, idx: number) => StepDetails;
  loading: boolean;
  reviseAction: (action: "approve" | "decline") => void;
};

export function ActiveJobPanel({ booking, professional, status, currentStatusIndex, getStepDetails, loading, reviseAction }: Props) {
  return (
    <>
      {/* Revised quote — provider found extra work; customer approves the extra charge */}
      {booking.revisedAmountPaise ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-extrabold text-amber-900 m-0">Revised quote from your professional</p>
          <p className="text-xs text-amber-800 mt-1 mb-0">{booking.revisedReason ?? "Extra work found on site."}</p>
          <div className="flex items-center justify-between mt-2 text-xs">
            <span className="text-gray-600">Extra charge</span>
            <span className="font-extrabold text-amber-900">+{formatPrice(booking.revisedAmountPaise)}</span>
          </div>
          <div className="flex gap-2 mt-3">
            <button type="button" onClick={() => reviseAction("decline")} disabled={loading} className="flex-1 py-2 rounded-xl border border-gray-300 text-gray-700 text-xs font-bold disabled:opacity-50">
              Decline
            </button>
            <button type="button" onClick={() => reviseAction("approve")} disabled={loading} className="flex-1 py-2 rounded-xl bg-amber-500 text-white text-xs font-extrabold disabled:opacity-50">
              Approve +{formatPrice(booking.revisedAmountPaise)}
            </button>
          </div>
        </div>
      ) : null}

      {/* Provider Details Card at the top */}
      <ProfessionalCard professional={professional} variant="mobileTop" status={status} />

      {/* Start code — read aloud to the technician to start the job */}
      {booking.startOtp && ["ASSIGNED", "PROVIDER_ARRIVING"].includes(status) && (
        <div className="bg-purple-100/30 border border-dashed border-purple-300 rounded-2xl p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold text-purple-950 uppercase tracking-wide m-0">Start code</p>
            <p className="text-[10px] text-gray-500 m-0">Share with your technician to begin</p>
          </div>
          <p className="font-extrabold text-2xl tracking-[0.3em] text-purple-800 m-0">{booking.startOtp}</p>
        </div>
      )}

      {/* Live Tracking Map Card */}
      <div className="relative w-full h-44 bg-white border border-gray-100 rounded-2xl p-2 shadow-sm overflow-hidden">
        <div className="relative w-full h-full rounded-xl overflow-hidden bg-slate-50 border border-gray-100/60 shadow-inner">
          {/* ETA badge — real etaMinutes when the partner app has reported one */}
          {professional && status === "PROVIDER_ARRIVING" && (
            <div className="absolute top-2.5 left-1/2 -translate-x-1/2 bg-white/95 px-3 py-1 rounded-full text-[10px] font-bold text-slate-700 shadow-md border border-slate-100 flex items-center gap-1.5 z-10 select-none">
              <span className="w-1.5 h-1.5 bg-purple-600 rounded-full" />
              {professional.etaMinutes != null ? `${professional.etaMinutes} mins away` : "On the way"}
            </div>
          )}

          <svg className="absolute inset-0 w-full h-full text-slate-200" xmlns="http://www.w3.org/2000/svg">
            {/* Simulated streets */}
            <line x1="0" y1="50" x2="500" y2="50" stroke="currentColor" strokeWidth="6" />
            <line x1="0" y1="120" x2="500" y2="120" stroke="currentColor" strokeWidth="6" />
            <line x1="140" y1="0" x2="140" y2="250" stroke="currentColor" strokeWidth="6" />
            <line x1="300" y1="0" x2="300" y2="250" stroke="currentColor" strokeWidth="6" />

            {/* Route path */}
            <path d="M 140,120 L 220,120 L 220,50 L 300,50" fill="none" stroke="#7c3aed" strokeWidth="4" strokeDasharray="6" className="animate-[dash_2s_linear_infinite]" />
          </svg>

          {/* Scooter animation */}
          <div className="absolute top-[38px] left-[200px] text-2xl animate-pulse">🛵</div>
          {/* Target House */}
          <div className="absolute top-[30px] left-[285px] text-2xl drop-shadow-md">🏠</div>
          {/* Provider Position pin */}
          <div className="absolute top-[102px] left-[125px] text-2xl drop-shadow-md">👤</div>

          <div className="absolute bottom-2 left-2 bg-white/95 px-2 py-0.5 rounded-md text-[8px] font-bold text-slate-500 shadow-sm border border-slate-100">
            Live Tracking Map
          </div>
        </div>
      </div>

      {/* Detailed Booking & Partner Info Card */}
      <DetailedBookingCard booking={booking} professional={professional} />

      {/* Service Status Timeline */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex flex-col gap-4">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 pb-2 m-0">Service Status</p>
        <BookingTimeline currentStatusIndex={currentStatusIndex} getStepDetails={getStepDetails} variant="mobile" />
      </div>
    </>
  );
}
