"use client";

import Image from "next/image";
import { formatPrice } from "@/lib/format";
import type { Booking, BookingParty } from "@/lib/booking/types";

type Props = {
  booking: Booking;
  professional: BookingParty | null;
  loading: boolean;
  onApprove: () => void;
  onDecline: () => void;
  onClose?: () => void;
};

export function RevisedQuoteModal({
  booking,
  professional,
  loading,
  onApprove,
  onDecline,
  onClose,
}: Props) {
  if (!booking.revisedAmountPaise) return null;

  // Clean reason format: "Extra parts: Modular Switch 6A (1-Way) ×1 (₹75)"
  const rawReason = booking.revisedReason ?? "Extra parts requested by technician";
  const displayParts = rawReason.replace(/^Extra parts:\s*/i, "").trim();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white p-6 shadow-2xl border border-amber-200 animate-[scaleUp_0.25s_cubic-bezier(0.16,1,0.3,1)] select-none">
        {/* Style animations */}
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes scaleUp { from { transform: scale(0.92); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        `}} />

        {/* Top Header Badge */}
        <div className="flex items-center justify-between border-b border-amber-100 pb-3.5 mb-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700 font-extrabold text-base">
              🔧
            </span>
            <div>
              <span className="block text-[10px] font-black uppercase tracking-wider text-amber-700">
                ACTION REQUIRED
              </span>
              <h3 className="text-sm font-extrabold text-gray-900">
                Technician Requested Extra Parts
              </h3>
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-sm font-bold p-1"
            >
              ✕
            </button>
          )}
        </div>

        {/* Technician info card */}
        {professional && (
          <div className="mb-4 flex items-center gap-3 rounded-2xl bg-slate-50 p-3 border border-slate-200/80">
            <Image
              src={professional.image || "https://images.unsplash.com/photo-1540569014015-19a7be504e3a?w=120"}
              alt={professional.name}
              width={40}
              height={40}
              className="h-10 w-10 rounded-full object-cover border border-amber-300"
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-extrabold text-gray-900 truncate">{professional.name}</p>
              <p className="text-[10px] font-bold text-amber-700 mt-0.5">
                ★ {professional.rating?.toFixed(1) || "5.0"} · Assigned Technician
              </p>
            </div>
          </div>
        )}

        {/* Part Item Details Box */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="inline-block rounded-md bg-amber-200/70 px-2 py-0.5 text-[10px] font-extrabold text-amber-900 uppercase">
                Awaiting customer approval
              </span>
              <p className="mt-2 text-sm font-black text-gray-900 leading-snug">
                {displayParts}
              </p>
            </div>
            <div className="text-right shrink-0">
              <span className="text-[10px] font-bold text-gray-400 uppercase block">Price</span>
              <span className="text-lg font-black text-amber-900">
                +{formatPrice(booking.revisedAmountPaise)}
              </span>
            </div>
          </div>

          <p className="text-xs text-amber-900/90 font-medium leading-relaxed border-t border-amber-200/60 pt-2.5">
            Your technician requested this part to finish the job safely. Approving adds this amount directly to your final booking invoice.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onApprove}
            disabled={loading}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#ea580c] to-[#f97316] hover:from-[#c2410c] hover:to-[#ea580c] text-white font-black text-sm shadow-md shadow-orange-500/20 transition-all cursor-pointer disabled:opacity-60"
          >
            <span>{loading ? "Approving..." : `Approve & Add to Invoice (+${formatPrice(booking.revisedAmountPaise)})`}</span>
          </button>

          <button
            type="button"
            onClick={onDecline}
            disabled={loading}
            className="flex min-h-[42px] w-full items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-600 font-bold text-xs hover:bg-gray-50 transition-all cursor-pointer disabled:opacity-60"
          >
            Decline Request
          </button>
        </div>
      </div>
    </div>
  );
}
