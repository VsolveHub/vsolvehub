"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { formatPrice } from "@/lib/format";
import { WALLET_BALANCE_PAISE } from "@/lib/profile/section-data";
import { TRANSPORT_VEHICLE_TYPES } from "@/lib/vehicle/constants";
import { estimateDistanceKm, estimateTransportFare } from "@/lib/vehicle/pricing";
import { VehicleFlowHeader } from "./VehicleFlowHeader";
import { FlaticonIcon } from "@/components/ui/FlaticonIcon";

const STEPS = ["pickup", "drop", "goods", "vehicle", "fare", "driver", "payment"] as const;
const STEP_LABELS: Record<string, string> = {
  pickup: "Pickup",
  drop: "Drop",
  goods: "Goods",
  vehicle: "Vehicle",
  fare: "Fare",
  driver: "Driver",
  payment: "Pay",
};

type Driver = { id: string; name: string; phone: string; rating: number; vehicleNumber: string; vehicleCategory: string };

const PAYMENT_OPTIONS = [
  { id: "upi" as const, label: "UPI" },
  { id: "card" as const, label: "Card" },
  { id: "wallet" as const, label: "Wallet" },
  { id: "cod" as const, label: "Pay on delivery" },
];

export function TransportBookingFlow() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<(typeof STEPS)[number]>("pickup");
  const [pickup, setPickup] = useState("");
  const [drop, setDrop] = useState("");
  const [goodsType, setGoodsType] = useState("");
  const [weightKg, setWeightKg] = useState(50);
  const [sizeDescription, setSizeDescription] = useState("");
  const [vehicleType, setVehicleType] = useState("tata_ace");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [driverId, setDriverId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<(typeof PAYMENT_OPTIONS)[number]["id"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const distanceKm = pickup && drop ? estimateDistanceKm(pickup, drop) : 0;
  const fare = estimateTransportFare(vehicleType, distanceKm);

  useEffect(() => {
    if (step === "driver") {
      fetch(`/api/vehicle/bookings?type=drivers&category=${vehicleType}`)
        .then((r) => r.json())
        .then((d) => setDrivers(d.drivers ?? []));
    }
  }, [step, vehicleType]);

  async function uploadImages(files: FileList | null) {
    if (!files?.length) return;
    const formData = new FormData();
    Array.from(files).forEach((f) => formData.append("files", f));
    const res = await fetch("/api/bookings/media", { method: "POST", body: formData });
    const data = await res.json();
    if (res.ok) setMediaUrls((u) => [...u, ...data.urls].slice(0, 5));
  }

  async function confirm() {
    if (!paymentMethod || !driverId) {
      setError("Select driver and payment");
      return;
    }
    setLoading(true);
    setError("");
    const res = await fetch("/api/vehicle/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flowType: "transport",
        serviceSlug: "goods-transport",
        pickupAddress: pickup,
        dropAddress: drop,
        goodsType,
        weightKg,
        sizeDescription,
        vehicleType,
        mediaUrls,
        driverId,
        paymentMethod,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Booking failed");
      return;
    }
    router.push(`/vehicle/confirm?ref=${data.bookingRef}&flow=transport`);
  }

  return (
    <div className="stack-lg booking-flow">
      <VehicleFlowHeader steps={STEPS} labels={STEP_LABELS} currentStep={step} />

      {step === "pickup" && (
        <div className="card stack">
          <h2 className="section-title">Pickup address</h2>
          <Input label="Pickup location" value={pickup} onChange={(e) => setPickup(e.target.value)} placeholder="Full pickup address" />
          <Button onClick={() => pickup.trim().length >= 5 && setStep("drop")} disabled={pickup.trim().length < 5}>Continue</Button>
        </div>
      )}

      {step === "drop" && (
        <div className="card stack">
          <h2 className="section-title">Drop address</h2>
          <Input label="Drop location" value={drop} onChange={(e) => setDrop(e.target.value)} placeholder="Full delivery address" />
          <div className="booking-action-row">
            <Button variant="secondary" onClick={() => setStep("pickup")}>Back</Button>
            <Button onClick={() => drop.trim().length >= 5 && setStep("goods")} disabled={drop.trim().length < 5}>Continue</Button>
          </div>
        </div>
      )}

      {step === "goods" && (
        <div className="card stack">
          <h2 className="section-title">Goods details</h2>
          <Input label="Goods type" value={goodsType} onChange={(e) => setGoodsType(e.target.value)} placeholder="e.g. Furniture, boxes" />
          <Input label="Weight (kg)" type="number" value={String(weightKg)} onChange={(e) => setWeightKg(Number(e.target.value))} />
          <Textarea label="Size / dimensions" value={sizeDescription} onChange={(e) => setSizeDescription(e.target.value)} placeholder="Optional size details" />
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => uploadImages(e.target.files)} />
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>Upload photos</Button>
          <div className="booking-action-row">
            <Button variant="secondary" onClick={() => setStep("drop")}>Back</Button>
            <Button onClick={() => goodsType.trim().length >= 2 && setStep("vehicle")} disabled={goodsType.trim().length < 2}>Continue</Button>
          </div>
        </div>
      )}

      {step === "vehicle" && (
        <div className="card stack">
          <h2 className="section-title">Select vehicle</h2>
          <div className="grid-2">
            {TRANSPORT_VEHICLE_TYPES.map((t) => (
              <button key={t.id} type="button" className={`vendor-card ${vehicleType === t.id ? "selected" : ""}`} onClick={() => setVehicleType(t.id)}>
                <FlaticonIcon name={t.icon} size={28} color="var(--color-brand)" />
                <p className="card-title">{t.label}</p>
                <p className="text-sm text-muted">from {formatPrice(t.basePaise)}</p>
              </button>
            ))}
          </div>
          <div className="booking-action-row">
            <Button variant="secondary" onClick={() => setStep("goods")}>Back</Button>
            <Button onClick={() => setStep("fare")}>Get fare estimate</Button>
          </div>
        </div>
      )}

      {step === "fare" && (
        <div className="card stack">
          <h2 className="section-title">Fare estimate</h2>
          <p className="text-sm text-muted">{pickup} → {drop}</p>
          <p className="card-title">~{distanceKm} km · {formatPrice(fare)}</p>
          <div className="booking-action-row">
            <Button variant="secondary" onClick={() => setStep("vehicle")}>Back</Button>
            <Button onClick={() => setStep("driver")}>Find driver</Button>
          </div>
        </div>
      )}

      {step === "driver" && (
        <div className="card stack">
          <h2 className="section-title">Assign driver</h2>
          {drivers.length === 0 ? (
            <p className="text-muted">Finding drivers…</p>
          ) : (
            drivers.map((d) => (
              <button key={d.id} type="button" className={`vendor-card ${driverId === d.id ? "selected" : ""}`} onClick={() => setDriverId(d.id)}>
                <p className="card-title">{d.name}</p>
                <p className="text-sm text-muted">★ {d.rating.toFixed(1)} · {d.vehicleNumber}</p>
              </button>
            ))
          )}
          <div className="booking-action-row">
            <Button variant="secondary" onClick={() => setStep("fare")}>Back</Button>
            <Button onClick={() => driverId && setStep("payment")} disabled={!driverId}>Continue</Button>
          </div>
        </div>
      )}

      {step === "payment" && (
        <div className="card stack">
          <h2 className="section-title">Confirm & pay</h2>
          <p className="card-title">{formatPrice(fare)}</p>
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
            <Button variant="secondary" onClick={() => setStep("driver")}>Back</Button>
            <Button onClick={confirm} loading={loading} disabled={loading}>Confirm transport</Button>
          </div>
        </div>
      )}
    </div>
  );
}
