"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { formatPrice } from "@/lib/format";
import { WALLET_BALANCE_PAISE } from "@/lib/profile/section-data";
import { REPAIR_ISSUES } from "@/lib/vehicle/constants";
import { VehicleFlowHeader } from "./VehicleFlowHeader";

const STEPS = ["issue", "vehicle", "pickup", "schedule", "mechanic", "payment"] as const;
const STEP_LABELS: Record<string, string> = {
  issue: "Issue",
  vehicle: "Vehicle",
  pickup: "Service",
  schedule: "Schedule",
  mechanic: "Mechanic",
  payment: "Pay",
};

type Vendor = { id: string; name: string; phone: string; rating: number };

const PAYMENT_OPTIONS = [
  { id: "upi" as const, label: "UPI" },
  { id: "card" as const, label: "Card" },
  { id: "wallet" as const, label: "Wallet" },
  { id: "cod" as const, label: "Pay after service" },
];

export function RepairBookingFlow() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<(typeof STEPS)[number]>("issue");
  const [issue, setIssue] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [pickupOption, setPickupOption] = useState<"garage" | "doorstep">("doorstep");
  const [serviceAddress, setServiceAddress] = useState("");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("10:00");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<(typeof PAYMENT_OPTIONS)[number]["id"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (step === "mechanic") {
      fetch("/api/vendors/nearby?category=vehicle-services")
        .then((r) => r.json())
        .then((d) => setVendors(d.vendors ?? []));
    }
  }, [step]);

  async function uploadImages(files: FileList | null) {
    if (!files?.length) return;
    const formData = new FormData();
    Array.from(files).forEach((f) => formData.append("files", f));
    const res = await fetch("/api/bookings/media", { method: "POST", body: formData });
    const data = await res.json();
    if (res.ok) setMediaUrls((u) => [...u, ...data.urls].slice(0, 5));
  }

  async function confirm() {
    if (!paymentMethod || !vendorId) {
      setError("Select mechanic and payment");
      return;
    }
    setLoading(true);
    setError("");
    const res = await fetch("/api/vehicle/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flowType: "repair",
        serviceSlug: "vehicle-repair",
        issue,
        vehicleType,
        brand,
        model,
        year,
        pickupOption,
        serviceAddress,
        scheduleDate,
        scheduleTime,
        mediaUrls,
        vendorId,
        paymentMethod,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Booking failed");
      return;
    }
    router.push(`/vehicle/confirm?ref=${data.bookingRef}&flow=repair`);
  }

  return (
    <div className="stack-lg booking-flow">
      <VehicleFlowHeader steps={STEPS} labels={STEP_LABELS} currentStep={step} />

      {step === "issue" && (
        <div className="card stack">
          <h2 className="section-title">What&apos;s the issue?</h2>
          <div className="stack">
            {REPAIR_ISSUES.map((i) => (
              <button key={i} type="button" className={`vendor-card ${issue === i ? "selected" : ""}`} onClick={() => setIssue(i)}>
                <p className="card-title">{i}</p>
              </button>
            ))}
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => uploadImages(e.target.files)} />
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>Upload vehicle photos</Button>
          {mediaUrls.length > 0 && <p className="text-sm text-muted">{mediaUrls.length} photo(s)</p>}
          <Button onClick={() => issue && setStep("vehicle")} disabled={!issue}>Continue</Button>
        </div>
      )}

      {step === "vehicle" && (
        <div className="card stack">
          <h2 className="section-title">Vehicle details</h2>
          <Input label="Vehicle type" value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} placeholder="e.g. Car, Bike" />
          <Input label="Brand" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Maruti" />
          <Input label="Model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. Swift" />
          <Input label="Year" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2020" maxLength={4} />
          <div className="booking-action-row">
            <Button variant="secondary" onClick={() => setStep("issue")}>Back</Button>
            <Button onClick={() => vehicleType && brand && model && year.length === 4 && setStep("pickup")} disabled={!vehicleType || !brand || !model || year.length !== 4}>Continue</Button>
          </div>
        </div>
      )}

      {step === "pickup" && (
        <div className="card stack">
          <h2 className="section-title">Service location</h2>
          <div className="booking-mode-tabs">
            <button type="button" className={`booking-mode-tab ${pickupOption === "garage" ? "active" : ""}`} onClick={() => setPickupOption("garage")}>At garage</button>
            <button type="button" className={`booking-mode-tab ${pickupOption === "doorstep" ? "active" : ""}`} onClick={() => setPickupOption("doorstep")}>Doorstep service</button>
          </div>
          <Textarea label="Address" value={serviceAddress} onChange={(e) => setServiceAddress(e.target.value)} placeholder="Service location address" />
          <div className="booking-action-row">
            <Button variant="secondary" onClick={() => setStep("vehicle")}>Back</Button>
            <Button onClick={() => serviceAddress.trim().length >= 5 && setStep("schedule")} disabled={serviceAddress.trim().length < 5}>Continue</Button>
          </div>
        </div>
      )}

      {step === "schedule" && (
        <div className="card stack">
          <h2 className="section-title">Schedule</h2>
          <Input label="Date" type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} />
          <Input label="Time" type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} />
          <div className="booking-action-row">
            <Button variant="secondary" onClick={() => setStep("pickup")}>Back</Button>
            <Button onClick={() => scheduleDate && setStep("mechanic")} disabled={!scheduleDate}>Find mechanic</Button>
          </div>
        </div>
      )}

      {step === "mechanic" && (
        <div className="card stack">
          <h2 className="section-title">Assign mechanic</h2>
          {vendors.map((v) => (
            <button key={v.id} type="button" className={`vendor-card ${vendorId === v.id ? "selected" : ""}`} onClick={() => setVendorId(v.id)}>
              <p className="card-title">{v.name}</p>
              <p className="text-sm text-muted">★ {v.rating.toFixed(1)}</p>
            </button>
          ))}
          <div className="booking-action-row">
            <Button variant="secondary" onClick={() => setStep("schedule")}>Back</Button>
            <Button onClick={() => vendorId && setStep("payment")} disabled={!vendorId}>Continue</Button>
          </div>
        </div>
      )}

      {step === "payment" && (
        <div className="card stack">
          <h2 className="section-title">Payment</h2>
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
            <Button variant="secondary" onClick={() => setStep("mechanic")}>Back</Button>
            <Button onClick={confirm} loading={loading} disabled={loading}>Confirm repair</Button>
          </div>
        </div>
      )}
    </div>
  );
}
