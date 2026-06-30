"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { formatPrice } from "@/lib/format";
import { WALLET_BALANCE_PAISE } from "@/lib/profile/section-data";
import { computeAccommodationPayment } from "@/lib/accommodation/pricing";
import type { AccommodationBookingDraft } from "@/lib/accommodation/types";
import type { PropertyDetail } from "@/lib/accommodation/types";

const PAYMENT_OPTIONS = [
  { id: "upi" as const, label: "UPI", detail: "Google Pay, PhonePe, Paytm" },
  { id: "card" as const, label: "Card", detail: "Debit / credit card" },
  { id: "wallet" as const, label: "Wallet", detail: `Balance: ${formatPrice(WALLET_BALANCE_PAISE)}` },
  { id: "cod" as const, label: "Pay at property", detail: "Cash on arrival" },
];

type Props = {
  property: PropertyDetail;
  initialMode: "move_in" | "visit";
};

export function AccommodationBookingFlow({ property, initialMode }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"type" | "requirements" | "payment">("type");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<AccommodationBookingDraft>({
    propertyId: property.id,
    bookingType: initialMode,
    moveInDate: "",
    visitDate: "",
    durationMonths: 6,
    numberOfPeople: 1,
    occupation: "",
    specialRequirements: "",
    idProofUrls: [],
    includeFirstMonthRent: false,
    paymentMethod: null,
  });

  const payment = computeAccommodationPayment(property.pricePaise, draft.includeFirstMonthRent);

  async function uploadIdProof(files: FileList | null) {
    if (!files?.length) return;
    const formData = new FormData();
    Array.from(files).forEach((f) => formData.append("files", f));
    const res = await fetch("/api/bookings/media", { method: "POST", body: formData });
    const data = await res.json();
    if (res.ok) {
      setDraft((d) => ({ ...d, idProofUrls: [...d.idProofUrls, ...data.urls].slice(0, 3) }));
    }
  }

  async function confirmBooking() {
    if (!draft.paymentMethod) {
      setError("Select a payment method");
      return;
    }
    setLoading(true);
    setError("");

    const res = await fetch("/api/accommodation/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        propertyId: draft.propertyId,
        bookingType: draft.bookingType,
        moveInDate: draft.bookingType === "move_in" ? draft.moveInDate : undefined,
        visitDate: draft.bookingType === "visit" ? draft.visitDate : undefined,
        durationMonths: draft.bookingType === "move_in" ? draft.durationMonths : undefined,
        numberOfPeople: draft.numberOfPeople,
        occupation: draft.occupation,
        specialRequirements: draft.specialRequirements,
        idProofUrls: draft.idProofUrls,
        includeFirstMonthRent: draft.includeFirstMonthRent,
        paymentMethod: draft.paymentMethod,
      }),
    });

    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Booking failed");
      return;
    }
    router.push(`/accommodation/confirm?ref=${data.bookingRef}`);
  }

  return (
    <div className="stack-lg booking-flow">
      <div className="card">
        <h2 className="card-title">{property.title}</h2>
        <p className="text-sm text-muted">{property.location}</p>
      </div>

      {step === "type" && (
        <>
          <div className="booking-mode-tabs">
            <button
              type="button"
              className={`booking-mode-tab ${draft.bookingType === "move_in" ? "active" : ""}`}
              onClick={() => setDraft((d) => ({ ...d, bookingType: "move_in" }))}
            >
              Immediate move-in
            </button>
            <button
              type="button"
              className={`booking-mode-tab ${draft.bookingType === "visit" ? "active" : ""}`}
              onClick={() => setDraft((d) => ({ ...d, bookingType: "visit" }))}
            >
              Schedule visit
            </button>
          </div>
          <Button block onClick={() => setStep("requirements")}>
            Next
          </Button>
        </>
      )}

      {step === "requirements" && (
        <>
          <div className="card stack">
            <h2 className="section-title">Stay requirements</h2>
            {draft.bookingType === "move_in" ? (
              <Input
                label="Move-in date"
                type="date"
                value={draft.moveInDate}
                onChange={(e) => setDraft((d) => ({ ...d, moveInDate: e.target.value }))}
              />
            ) : (
              <Input
                label="Visit date"
                type="date"
                value={draft.visitDate}
                onChange={(e) => setDraft((d) => ({ ...d, visitDate: e.target.value }))}
              />
            )}
            {draft.bookingType === "move_in" && (
              <Input
                label="Duration of stay (months)"
                type="number"
                min={1}
                max={24}
                value={draft.durationMonths}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, durationMonths: Number(e.target.value) || 1 }))
                }
              />
            )}
            <Input
              label="Number of people"
              type="number"
              min={1}
              max={10}
              value={draft.numberOfPeople}
              onChange={(e) =>
                setDraft((d) => ({ ...d, numberOfPeople: Number(e.target.value) || 1 }))
              }
            />
            <Input
              label="Occupation"
              placeholder="Student, IT professional, etc."
              value={draft.occupation}
              onChange={(e) => setDraft((d) => ({ ...d, occupation: e.target.value }))}
            />
            <Textarea
              label="Special requirements"
              placeholder="Dietary needs, accessibility, etc."
              value={draft.specialRequirements}
              onChange={(e) => setDraft((d) => ({ ...d, specialRequirements: e.target.value }))}
            />
            <div>
              <p className="section-title">ID proof upload</p>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.pdf"
                hidden
                onChange={(e) => uploadIdProof(e.target.files)}
              />
              <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                Upload ID proof
              </Button>
              {draft.idProofUrls.length > 0 && (
                <p className="text-sm text-muted">{draft.idProofUrls.length} file(s) uploaded</p>
              )}
            </div>
          </div>
          <Button
            block
            onClick={() => {
              if (!draft.occupation.trim()) {
                setError("Occupation is required");
                return;
              }
              setError("");
              setStep("payment");
            }}
          >
            Next
          </Button>
        </>
      )}

      {step === "payment" && (
        <>
          <div className="card stack">
            <h2 className="section-title">Payment breakdown</h2>
            <div className="flex-between">
              <span>Token advance</span>
              <span>{formatPrice(payment.tokenAdvancePaise)}</span>
            </div>
            <div className="flex-between">
              <span>Booking fee</span>
              <span>{formatPrice(payment.bookingFeePaise)}</span>
            </div>
            <label className="acc-filter-check">
              <input
                type="checkbox"
                checked={draft.includeFirstMonthRent}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, includeFirstMonthRent: e.target.checked }))
                }
              />
              Pay first month rent now ({formatPrice(property.pricePaise)}) — optional
            </label>
            <div className="flex-between" style={{ borderTop: "1px solid var(--color-border)", paddingTop: "0.5rem" }}>
              <span className="card-title">Total</span>
              <span className="detail-price" style={{ margin: 0 }}>
                {formatPrice(
                  computeAccommodationPayment(property.pricePaise, draft.includeFirstMonthRent)
                    .totalPaidPaise
                )}
              </span>
            </div>
          </div>

          <div className="stack">
            {PAYMENT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`card address-card ${draft.paymentMethod === opt.id ? "selected" : ""}`}
                onClick={() => setDraft((d) => ({ ...d, paymentMethod: opt.id }))}
              >
                <p className="address-label">{opt.label}</p>
                <p className="address-text">{opt.detail}</p>
              </button>
            ))}
          </div>

          <Button block onClick={confirmBooking} loading={loading} disabled={loading}>
            Confirm booking
          </Button>
        </>
      )}

      {error && <div className="alert alert-error">{error}</div>}
    </div>
  );
}
