"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatPrice } from "@/lib/format";
import { WALLET_BALANCE_PAISE } from "@/lib/profile/section-data";
import { RENTAL_TYPES } from "@/lib/vehicle/constants";
import { computeRentalDurationDays, computeRentalTotal } from "@/lib/vehicle/pricing";
import { uploadBookingMedia } from "@/lib/upload-media";
import { VehicleFlowHeader } from "./VehicleFlowHeader";

const STEPS = ["type", "vehicle", "dates", "license", "summary", "payment"] as const;
const STEP_LABELS: Record<string, string> = {
  type: "Type",
  vehicle: "Vehicle",
  dates: "Dates",
  license: "License",
  summary: "Summary",
  payment: "Pay",
};

type Asset = {
  id: string;
  rentalType: string;
  name: string;
  brand: string;
  model: string;
  year: number;
  pricePerDayPaise: number;
  depositPaise: number;
};

const PAYMENT_OPTIONS = [
  { id: "upi" as const, label: "UPI" },
  { id: "card" as const, label: "Card" },
  { id: "wallet" as const, label: "Wallet" },
  { id: "cod" as const, label: "Pay at pickup" },
];

export function RentalBookingFlow() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<(typeof STEPS)[number]>("type");
  const [rentalType, setRentalType] = useState("car_rental");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetId, setAssetId] = useState("");
  const [pickupDate, setPickupDate] = useState("");
  const [pickupTime, setPickupTime] = useState("10:00");
  const [returnDate, setReturnDate] = useState("");
  const [returnTime, setReturnTime] = useState("10:00");
  const [licenseUrls, setLicenseUrls] = useState<string[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<(typeof PAYMENT_OPTIONS)[number]["id"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [uploadError, setUploadError] = useState("");

  const selected = assets.find((a) => a.id === assetId);
  const durationDays =
    pickupDate && returnDate
      ? computeRentalDurationDays(pickupDate, pickupTime, returnDate, returnTime)
      : 0;
  const totals = selected
    ? computeRentalTotal(selected.pricePerDayPaise, durationDays || 1, selected.depositPaise)
    : null;

  useEffect(() => {
    if (step === "vehicle") {
      fetch(`/api/vehicle/bookings?type=rental&category=${rentalType}`)
        .then((r) => r.json())
        .then((d) => setAssets(d.assets ?? []));
    }
  }, [step, rentalType]);

  async function uploadLicense(files: FileList | null) {
    if (!files?.length) return;
    setUploadError("");
    const result = await uploadBookingMedia(files);
    if (!result.ok) {
      setUploadError(result.error);
      return;
    }
    setLicenseUrls((u) => [...u, ...result.urls].slice(0, 2));
  }

  async function confirm() {
    if (!paymentMethod || !assetId || !licenseUrls.length) {
      setError("Complete all fields");
      return;
    }
    setLoading(true);
    setError("");
    const res = await fetch("/api/vehicle/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flowType: "rental",
        serviceSlug: "vehicle-rental",
        rentalAssetId: assetId,
        pickupDate,
        pickupTime,
        returnDate,
        returnTime,
        licenseUrls,
        paymentMethod,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Booking failed");
      return;
    }
    router.push(`/vehicle/confirm?ref=${data.bookingRef}&flow=rental`);
  }

  return (
    <div className="flex flex-col gap-6 booking-flow">
      <VehicleFlowHeader steps={STEPS} labels={STEP_LABELS} currentStep={step} />

      {step === "type" && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-4">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Rental type</h2>
          <div className="grid-2">
            {RENTAL_TYPES.map((t) => (
              <button key={t.id} type="button" className={`vendor-card ${rentalType === t.id ? "selected" : ""}`} onClick={() => setRentalType(t.id)}>
                <p className="mb-1 text-[15px] font-semibold text-gray-900">{t.label}</p>
              </button>
            ))}
          </div>
          <Button onClick={() => setStep("vehicle")}>Browse vehicles</Button>
        </div>
      )}

      {step === "vehicle" && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-4">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Select vehicle</h2>
          {assets.map((a) => (
            <button key={a.id} type="button" className={`vendor-card ${assetId === a.id ? "selected" : ""}`} onClick={() => setAssetId(a.id)}>
              <p className="mb-1 text-[15px] font-semibold text-gray-900">{a.name}</p>
              <p className="text-sm text-gray-500">{a.brand} {a.model} · {a.year}</p>
              <p className="text-sm">{formatPrice(a.pricePerDayPaise)}/day · Deposit {formatPrice(a.depositPaise)}</p>
            </button>
          ))}
          <div className="mt-4 flex flex-col gap-2.5">
            <Button variant="secondary" onClick={() => setStep("type")}>Back</Button>
            <Button onClick={() => assetId && setStep("dates")} disabled={!assetId}>Continue</Button>
          </div>
        </div>
      )}

      {step === "dates" && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-4">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Pickup & return</h2>
          <Input label="Pickup date" type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} />
          <Input label="Pickup time" type="time" value={pickupTime} onChange={(e) => setPickupTime(e.target.value)} />
          <Input label="Return date" type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
          <Input label="Return time" type="time" value={returnTime} onChange={(e) => setReturnTime(e.target.value)} />
          {durationDays > 0 && <p className="text-sm text-gray-500">{durationDays} day(s)</p>}
          <div className="mt-4 flex flex-col gap-2.5">
            <Button variant="secondary" onClick={() => setStep("vehicle")}>Back</Button>
            <Button onClick={() => pickupDate && returnDate && setStep("license")} disabled={!pickupDate || !returnDate}>Continue</Button>
          </div>
        </div>
      )}

      {step === "license" && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-4">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Driving license</h2>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => uploadLicense(e.target.files)} />
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>Upload license photo</Button>
          {uploadError && <p className="rounded-xl px-4 py-3 text-sm bg-red-50 text-[var(--color-danger)]">{uploadError}</p>}
          {licenseUrls.length > 0 && <p className="text-sm text-gray-500">{licenseUrls.length} file(s) uploaded</p>}
          <div className="mt-4 flex flex-col gap-2.5">
            <Button variant="secondary" onClick={() => setStep("dates")}>Back</Button>
            <Button onClick={() => licenseUrls.length && setStep("summary")} disabled={!licenseUrls.length}>Continue</Button>
          </div>
        </div>
      )}

      {step === "summary" && totals && selected && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-4">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Booking summary</h2>
          <p className="mb-1 text-[15px] font-semibold text-gray-900">{selected.name}</p>
          <p className="text-sm text-gray-500">{durationDays} days · {formatPrice(totals.rentalPaise)} rental</p>
          <p className="text-sm text-gray-500">Security deposit: {formatPrice(totals.depositPaise)}</p>
          <p className="mb-1 text-[15px] font-semibold text-gray-900">Total: {formatPrice(totals.totalPaise)}</p>
          <div className="mt-4 flex flex-col gap-2.5">
            <Button variant="secondary" onClick={() => setStep("license")}>Back</Button>
            <Button onClick={() => setStep("payment")}>Proceed to payment</Button>
          </div>
        </div>
      )}

      {step === "payment" && totals && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-4">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Payment</h2>
          <p className="mb-1 text-[15px] font-semibold text-gray-900">{formatPrice(totals.totalPaise)}</p>
          <div className="flex flex-col gap-4">
            {PAYMENT_OPTIONS.map((p) => (
              <button key={p.id} type="button" className={`vendor-card ${paymentMethod === p.id ? "selected" : ""}`} onClick={() => setPaymentMethod(p.id)}>
                <p className="mb-1 text-[15px] font-semibold text-gray-900">{p.label}</p>
                {p.id === "wallet" && <p className="text-sm text-gray-500">Balance: {formatPrice(WALLET_BALANCE_PAISE)}</p>}
              </button>
            ))}
          </div>
          {error && <p className="rounded-xl px-4 py-3 text-sm bg-red-50 text-[var(--color-danger)]">{error}</p>}
          <div className="mt-4 flex flex-col gap-2.5">
            <Button variant="secondary" onClick={() => setStep("summary")}>Back</Button>
            <Button onClick={confirm} loading={loading} disabled={loading}>Confirm rental</Button>
          </div>
        </div>
      )}
    </div>
  );
}
