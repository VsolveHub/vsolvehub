"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { formatPrice } from "@/lib/format";
import { WALLET_BALANCE_PAISE } from "@/lib/profile/section-data";
import type { BookingDraft, PaymentMethodType } from "@/lib/bookings/types";

const PAYMENT_OPTIONS: { id: PaymentMethodType; label: string; detail: string }[] = [
  { id: "upi", label: "UPI", detail: "Google Pay, PhonePe, Paytm" },
  { id: "card", label: "Card", detail: "Debit / credit card" },
  { id: "wallet", label: "Wallet", detail: `Balance: ${formatPrice(WALLET_BALANCE_PAISE)}` },
  { id: "cod", label: "Cash on service", detail: "Pay after completion" },
];

type Props = {
  draft: BookingDraft;
  totalPaise: number;
  autoDispatch?: boolean;
};

export function BookingPaymentStep({ draft, totalPaise, autoDispatch = false }: Props) {
  const router = useRouter();
  const [method, setMethod] = useState<PaymentMethodType | null>(draft.paymentMethod);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function confirmBooking() {
    if (!method) {
      setError("Please select a payment method");
      return;
    }
    if (!draft.addressId || !draft.slot) {
      setError("Booking details incomplete");
      return;
    }
    if (!autoDispatch && !draft.vendorId) {
      setError("Booking details incomplete");
      return;
    }

    setLoading(true);
    setError("");

    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceId: draft.serviceId,
        addressId: draft.addressId,
        slot: draft.slot,
        ...(draft.vendorId ? { vendorId: draft.vendorId } : {}),
        issueDescription: draft.issueDescription,
        mediaUrls: draft.mediaUrls,
        scheduleType: draft.scheduleType,
        paymentMethod: method,
        vendorAssignmentMode: autoDispatch ? "auto" : draft.vendorAssignmentMode,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Payment failed. Please try again.");
      return;
    }

    router.push(`/booking/confirm?ref=${data.bookingRef}`);
  }

  return (
    <div className="stack-lg">
      <div className="card">
        <p className="text-sm text-muted">Amount to pay</p>
        <p className="detail-price">{formatPrice(totalPaise)}</p>
      </div>

      <div className="stack">
        {PAYMENT_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`card address-card ${method === opt.id ? "selected" : ""}`}
            onClick={() => setMethod(opt.id)}
          >
            <p className="address-label">{opt.label}</p>
            <p className="address-text">{opt.detail}</p>
          </button>
        ))}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <Button onClick={confirmBooking} loading={loading} disabled={loading} block>
        Confirm booking
      </Button>
    </div>
  );
}
