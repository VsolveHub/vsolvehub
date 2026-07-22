"use client";

import { useState } from "react";
import { formatPrice } from "@/lib/format";
import type { Booking, BookingParty } from "@/lib/booking/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/query/api";
import { qk } from "@/lib/query/keys";

type Props = {
  booking: Booking;
  professional: BookingParty | null;
  onRefresh?: () => void;
  hideHeader?: boolean;
  hidePartnerCard?: boolean;
};

type PaymentMethod = "upi" | "card" | "wallet" | "cod";

export function DetailedBookingCard({
  booking,
  professional,
  onRefresh,
  hideHeader = false,
  hidePartnerCard = false,
}: Props) {
  const queryClient = useQueryClient();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("upi");
  const [payError, setPayError] = useState("");

  const isUnpaid = booking.paymentStatus === "PENDING";
  const totalAmount = booking.finalAmountPaise ?? booking.quotedAmount;

  const payMutation = useMutation({
    mutationFn: () => api.payBooking(booking.bookingRef, paymentMethod),
    onSuccess: () => {
      setPayError("");
      queryClient.invalidateQueries({ queryKey: qk.booking(booking.bookingRef) });
      onRefresh?.();
    },
    onError: (e) => setPayError(e instanceof Error ? e.message : "Payment failed"),
  });

  // Extract all extra product lines & approved parts from lineItems
  const rawLineItems = Array.isArray(booking.lineItems) ? booking.lineItems : [];
  const extraLineItems = rawLineItems.filter((li: any) => {
    const val = (li.value || li.name || "").toLowerCase();
    const svcName = booking.service.name.toLowerCase();
    if (val === svcName && (li.kind === "variant" || !li.kind)) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-4 text-xs sm:text-sm">
      {/* Card Title Header */}
      {!hideHeader && (
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-[#ea580c]">
              BOOKING DETAILS &amp; INVOICE
            </span>
            <h3 className="font-heading text-base font-extrabold text-black mt-0.5">
              {booking.service.name}
            </h3>
          </div>
          <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
            #{booking.bookingRef}
          </span>
        </div>
      )}

      {/* Assigned Partner Info */}
      {!hidePartnerCard && professional && (
        <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3.5 border border-slate-200/80">
          <div className="flex items-center gap-3">
            <img
              src={professional.image || "https://images.unsplash.com/photo-1540569014015-19a7be504e3a?w=120"}
              alt={professional.name}
              className="h-10 w-10 rounded-full object-cover border-2 border-[#ea580c]"
            />
            <div>
              <div className="font-extrabold text-black text-sm">{professional.name}</div>
              <div className="text-[11px] text-[#ea580c] font-bold mt-0.5 flex items-center gap-1">
                <span>★ {professional.rating?.toFixed(1) || "5.0"}</span>
                <span className="text-slate-400">· Assigned Partner</span>
              </div>
            </div>
          </div>
          {professional.phone && (
            <a
              href={`tel:${professional.phone}`}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#ea580c] text-white shadow-xs hover:bg-[#c2410c] transition-colors"
              title="Call Partner"
            >
              📞
            </a>
          )}
        </div>
      )}

      {/* Service Address */}
      <div className="space-y-2 text-slate-700 font-medium">
        <div className="flex justify-between items-start">
          <span className="text-slate-400 font-bold shrink-0 mr-2">Service Address:</span>
          <span className="font-semibold text-black text-right">{booking.address}</span>
        </div>
      </div>

      {/* Itemized Line Breakdown Table */}
      <div className="border-t border-slate-100 pt-3">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
          ITEMIZED INVOICE BREAKDOWN
        </span>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                <th className="py-2.5 px-3">Description</th>
                <th className="py-2.5 px-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {rawLineItems.length === 0 ? (
                /* Default single base service row if lineItems snapshot is empty */
                <tr>
                  <td className="py-3 px-3">
                    <span className="font-black text-black block">{booking.service.name}</span>
                    <span className="text-[11px] text-slate-500 font-medium block">Technician</span>
                  </td>
                  <td className="py-3 px-3 text-right font-black text-black">
                    {formatPrice(booking.baseChargePaise ?? booking.quotedAmount)}
                  </td>
                </tr>
              ) : (
                /* Map directly from rawLineItems snapshot to ensure 1-to-1 exact line matching & zero duplication */
                rawLineItems.map((li: any, idx: number) => {
                  const isBaseVariant = li.kind === "variant" || (!li.kind && idx === 0);

                  if (isBaseVariant) {
                    const variantName = li.value || booking.service.name;
                    return (
                      <tr key={li.key || idx}>
                        <td className="py-3 px-3">
                          <span className="font-black text-black block">{booking.service.name}</span>
                          <span className="text-[11px] text-slate-500 font-medium block">
                            Technician {variantName !== booking.service.name ? `· ${variantName}` : ""}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-black text-[#0b1c30]">
                          {formatPrice(li.totalPaise || booking.baseChargePaise || booking.quotedAmount)}
                        </td>
                      </tr>
                    );
                  }

                  const qty = li.qty || 1;
                  const unitPricePaise = li.unitPaise || Math.round((li.totalPaise || 0) / qty);
                  const tag = li.label || (li.key?.includes("product:") ? "Extra part (approved)" : "Product");

                  return (
                    <tr key={li.key || idx}>
                      <td className="py-3 px-3">
                        <span className="font-extrabold text-[#0b1c30] block">{li.value || li.name}</span>
                        <span className="text-[11px] text-slate-500 font-medium block">
                          {tag} · {qty} × {formatPrice(unitPricePaise)} · GST 18% incl.
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-black text-[#0b1c30]">
                        {formatPrice(li.totalPaise || unitPricePaise * qty)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Total Amount & Payment Status Row */}
      <div className="flex items-center justify-between border-t border-slate-100 pt-3">
        <div>
          <span className="text-xs font-bold text-slate-500 uppercase block">Total Amount</span>
          <span className={`inline-block mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
            booking.paymentStatus === "PAID"
              ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
              : "bg-amber-100 text-amber-900 border border-amber-300"
          }`}>
            Payment Status: {booking.paymentStatus}
          </span>
        </div>
        <span className="font-heading text-2xl font-black text-[#0b1c30]">
          {formatPrice(totalAmount)}
        </span>
      </div>

      {/* Payment Stage Banner if UNPAID */}
      {isUnpaid && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-black text-amber-950 uppercase tracking-wide">
                💳 PAYMENT STAGE · PAYMENT REQUIRED
              </p>
              <p className="text-[11px] text-amber-900 font-medium mt-0.5">
                Complete payment for your booking to finalize.
              </p>
            </div>
            <span className="font-black text-amber-950 text-sm">
              {formatPrice(totalAmount)}
            </span>
          </div>

          {/* Payment Method Options */}
          <div className="grid grid-cols-4 gap-1.5">
            {(["upi", "card", "wallet", "cod"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setPaymentMethod(opt)}
                className={`rounded-lg border px-2 py-1.5 text-[10px] font-bold uppercase transition-all cursor-pointer ${
                  paymentMethod === opt
                    ? "border-[#ea580c] bg-[#fff7ed] text-[#ea580c]"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>

          {payError && (
            <p className="text-xs font-bold text-red-600">{payError}</p>
          )}

          <button
            type="button"
            onClick={() => payMutation.mutate()}
            disabled={payMutation.isPending}
            className="w-full rounded-xl bg-gradient-to-r from-[#ea580c] to-[#f97316] py-2.5 text-xs font-black text-white shadow-md transition-all hover:from-[#c2410c] hover:to-[#ea580c] cursor-pointer disabled:opacity-60"
          >
            {payMutation.isPending ? "Processing Payment…" : `Pay ${formatPrice(totalAmount)} Now`}
          </button>
        </div>
      )}
    </div>
  );
}
