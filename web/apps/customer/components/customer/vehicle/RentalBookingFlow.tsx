"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatPrice } from "@/lib/format";
import { WALLET_BALANCE_PAISE } from "@/lib/profile/section-data";
import { RENTAL_TYPES } from "@/lib/vehicle/constants";
import { computeRentalDurationDays, computeRentalTotal } from "@/lib/vehicle/pricing";
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
    const formData = new FormData();
    Array.from(files).forEach((f) => formData.append("files", f));
    const res = await fetch("/api/bookings/media", { method: "POST", body: formData });
    const data = await res.json();
    if (res.ok) setLicenseUrls((u) => [...u, ...data.urls].slice(0, 2));
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
    <div className="stack-lg booking-flow">
      <VehicleFlowHeader steps={STEPS} labels={STEP_LABELS} currentStep={step} />

      {step === "type" && (
        <div className="card stack">
          <h2 className="section-title">Rental type</h2>
          <div className="grid-2">
            {RENTAL_TYPES.map((t) => (
              <button key={t.id} type="button" className={`vendor-card ${rentalType === t.id ? "selected" : ""}`} onClick={() => setRentalType(t.id)}>
                <p className="card-title">{t.label}</p>
              </button>
            ))}
          </div>
          <Button onClick={() => setStep("vehicle")}>Browse vehicles</Button>
        </div>
      )}

      {step === "vehicle" && (
        <div className="card stack">
          <h2 className="section-title">Select vehicle</h2>
          {assets.map((a) => (
            <button key={a.id} type="button" className={`vendor-card ${assetId === a.id ? "selected" : ""}`} onClick={() => setAssetId(a.id)}>
              <p className="card-title">{a.name}</p>
              <p className="text-sm text-muted">{a.brand} {a.model} · {a.year}</p>
              <p className="text-sm">{formatPrice(a.pricePerDayPaise)}/day · Deposit {formatPrice(a.depositPaise)}</p>
            </button>
          ))}
          <div className="booking-action-row">
            <Button variant="secondary" onClick={() => setStep("type")}>Back</Button>
            <Button onClick={() => assetId && setStep("dates")} disabled={!assetId}>Continue</Button>
          </div>
        </div>
      )}

      {step === "dates" && (
        <div className="card stack">
          <h2 className="section-title">Pickup & return</h2>
          <Input label="Pickup date" type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} />
          <Input label="Pickup time" type="time" value={pickupTime} onChange={(e) => setPickupTime(e.target.value)} />
          <Input label="Return date" type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
          <Input label="Return time" type="time" value={returnTime} onChange={(e) => setReturnTime(e.target.value)} />
          {durationDays > 0 && <p className="text-sm text-muted">{durationDays} day(s)</p>}
          <div className="booking-action-row">
            <Button variant="secondary" onClick={() => setStep("vehicle")}>Back</Button>
            <Button onClick={() => pickupDate && returnDate && setStep("license")} disabled={!pickupDate || !returnDate}>Continue</Button>
          </div>
        </div>
      )}

      {step === "license" && (
        <div className="card stack">
          <h2 className="section-title">Driving license</h2>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => uploadLicense(e.target.files)} />
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>Upload license photo</Button>
          {licenseUrls.length > 0 && <p className="text-sm text-muted">{licenseUrls.length} file(s) uploaded</p>}
          <div className="booking-action-row">
            <Button variant="secondary" onClick={() => setStep("dates")}>Back</Button>
            <Button onClick={() => licenseUrls.length && setStep("summary")} disabled={!licenseUrls.length}>Continue</Button>
          </div>
        </div>
      )}

      {step === "summary" && totals && selected && (
        <div className="card stack">
          <h2 className="section-title">Booking summary</h2>
          <p className="card-title">{selected.name}</p>
          <p className="text-sm text-muted">{durationDays} days · {formatPrice(totals.rentalPaise)} rental</p>
          <p className="text-sm text-muted">Security deposit: {formatPrice(totals.depositPaise)}</p>
          <p className="card-title">Total: {formatPrice(totals.totalPaise)}</p>
          <div className="booking-action-row">
            <Button variant="secondary" onClick={() => setStep("license")}>Back</Button>
            <Button onClick={() => setStep("payment")}>Proceed to payment</Button>
          </div>
        </div>
      )}

      {step === "payment" && totals && (
        <div className="card stack">
          <h2 className="section-title">Payment</h2>
          <p className="card-title">{formatPrice(totals.totalPaise)}</p>
          <div className="stack">
            {PAYMENT_OPTIONS.map((p) => (
              <button key={p.id} type="button" className={`vendor-card ${paymentMethod === p.id ? "selected" : ""}`} onClick={() => setPaymentMethod(p.id)}>
                <p className="card-title">{p.label}</p>
                {p.id === "wallet" && <p className="text-sm text-muted">Balance: {formatPrice(WALLET_BALANCE_PAISE)}</p>}
              </button>
            ))}
          </div>
          {error && <p className="alert alert-error">{error}</p>}
          <div className="booking-action-row">
            <Button variant="secondary" onClick={() => setStep("summary")}>Back</Button>
            <Button onClick={confirm} loading={loading} disabled={loading}>Confirm rental</Button>
          </div>
        </div>
      )}
    </div>
  );
}
