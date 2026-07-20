"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadBookingMedia } from "@/lib/upload-media";
import type { AccommodationBookingDraft } from "@/lib/accommodation/types";
import type { PropertyDetail } from "@/lib/accommodation/types";
import { TypeStep } from "./accommodationBookingFlow/TypeStep";
import { RequirementsStep } from "./accommodationBookingFlow/RequirementsStep";
import { PaymentStep } from "./accommodationBookingFlow/PaymentStep";

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
  const [uploadError, setUploadError] = useState("");
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

  async function uploadIdProof(files: FileList | null) {
    if (!files?.length) return;
    setUploadError("");
    const result = await uploadBookingMedia(files);
    if (!result.ok) {
      setUploadError(result.error);
      return;
    }
    setDraft((d) => ({ ...d, idProofUrls: [...d.idProofUrls, ...result.urls].slice(0, 3) }));
  }

  function goToPayment() {
    if (!draft.occupation.trim()) {
      setError("Occupation is required");
      return;
    }
    setError("");
    setStep("payment");
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
    <div className="flex flex-col gap-6 booking-flow">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-[15px] font-semibold text-gray-900">{property.title}</h2>
        <p className="text-sm text-gray-500">{property.location}</p>
      </div>

      {step === "type" && (
        <TypeStep
          bookingType={draft.bookingType}
          setBookingType={(bookingType) => setDraft((d) => ({ ...d, bookingType }))}
          onNext={() => setStep("requirements")}
        />
      )}

      {step === "requirements" && (
        <RequirementsStep
          draft={draft}
          setDraft={setDraft}
          fileRef={fileRef}
          uploadError={uploadError}
          onUploadIdProof={uploadIdProof}
          onNext={goToPayment}
        />
      )}

      {step === "payment" && (
        <PaymentStep
          propertyPricePaise={property.pricePaise}
          draft={draft}
          setDraft={setDraft}
          loading={loading}
          onConfirm={confirmBooking}
        />
      )}

      {error && <div className="rounded-xl px-4 py-3 text-sm bg-red-50 text-[var(--color-danger)]">{error}</div>}
    </div>
  );
}
