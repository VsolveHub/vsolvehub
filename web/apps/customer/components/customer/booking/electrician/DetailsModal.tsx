import Image from "next/image";
import { formatDate, formatPrice } from "@/lib/format";
import type { Booking, BookingParty } from "@/lib/booking/types";

type Props = {
  booking: Booking;
  professional: BookingParty | null;
  onClose: () => void;
};

export function DetailsModal({ booking, professional, onClose }: Props) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-end md:items-center justify-center p-4 transition-all duration-300 select-none">
      <div className="bg-white w-full max-w-sm rounded-t-3xl md:rounded-2xl p-5 shadow-2xl relative flex flex-col gap-4 animate-[slideUp_0.2s_ease-out]">
        {/* Modal style override */}
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes slideUp {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
        `}} />

        {/* Header */}
        <div className="flex justify-between items-center border-b border-gray-100 pb-3">
          <span className="font-extrabold text-sm text-purple-955">Booking Details</span>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xs font-bold"
          >
            ✕
          </button>
        </div>

        {/* Partner Details */}
        {professional ? (
          <div className="bg-purple-50/50 border border-purple-100 rounded-2xl p-3 flex items-center gap-3">
            <Image
              src={professional.image || "https://images.unsplash.com/photo-1540569014015-19a7be504e3a?w=120"}
              alt={professional.name}
              width={40}
              height={40}
              className="w-10 h-10 rounded-full object-cover border border-purple-250"
            />
            <div>
              <p className="font-bold text-xs text-gray-800 m-0">{professional.name}</p>
              <p className="text-[10px] text-purple-700 font-bold mt-0.5 m-0">
                ★ {professional.rating?.toFixed(1) || "4.9"} · Assigned Partner
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-purple-50/50 border border-purple-100 rounded-2xl p-3 text-center">
            <p className="text-[10px] font-bold text-purple-700 m-0">No partner details available</p>
          </div>
        )}

        {/* Booking Stats List */}
        <div className="flex flex-col gap-3.5 my-1 text-xs">
          <div className="flex justify-between items-center">
            <span className="font-bold text-gray-400">Service Booked:</span>
            <span className="font-extrabold text-purple-955">{booking.service.name}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="font-bold text-gray-400">Booking Reference:</span>
            <span className="font-mono font-bold text-gray-800">#{booking.bookingRef}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="font-bold text-gray-400">Booked On:</span>
            <span className="font-bold text-gray-800">{formatDate(booking.createdAt ?? "")}</span>
          </div>
          <div className="flex justify-between items-start">
            <span className="font-bold text-gray-400 flex-shrink-0 mr-4">Service Address:</span>
            <span className="font-semibold text-gray-800 text-right leading-snug">{booking.address}</span>
          </div>

          {/* Itemized Price Breakdown */}
          <div className="border-t border-gray-100 pt-3 space-y-2">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">ITEMIZED BREAKDOWN</span>
            <div className="flex justify-between items-center text-[#0b1c30]">
              <span className="font-medium">{booking.service.name} (Base)</span>
              <strong className="font-bold">{formatPrice(booking.baseChargePaise ?? booking.quotedAmount)}</strong>
            </div>
            {booking.lineItems && booking.lineItems.length > 0 && (
              <div className="space-y-1 pl-2 border-l-2 border-[#ea580c]/30">
                {booking.lineItems
                  .filter((li: any) => li.kind === "product" || li.kind === "addon")
                  .map((li: any, idx: number) => (
                    <div key={`${li.key || idx}`} className="flex justify-between items-center text-slate-700 text-[11px]">
                      <span>📦 {li.value} {li.qty > 1 ? `× ${li.qty}` : ""}</span>
                      <strong className="font-bold text-[#0b1c30]">{formatPrice(li.totalPaise)}</strong>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div className="flex justify-between items-center border-t border-gray-100 pt-3">
            <span className="font-bold text-gray-500">Total Amount:</span>
            <span className="font-black text-[#ea580c] text-base">{formatPrice(booking.finalAmountPaise ?? booking.quotedAmount)}</span>
          </div>
        </div>

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 bg-purple-900 hover:bg-purple-955 text-white font-bold text-xs rounded-full text-center cursor-pointer transition-all shadow"
        >
          Close
        </button>
      </div>
    </div>
  );
}
