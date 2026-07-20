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
import { uploadBookingMedia } from "@/lib/upload-media";
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
  const [uploadError, setUploadError] = useState("");

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
    setUploadError("");
    const result = await uploadBookingMedia(files);
    if (!result.ok) {
      setUploadError(result.error);
      return;
    }
    setMediaUrls((u) => [...u, ...result.urls].slice(0, 5));
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
    <div className="flex flex-col gap-6 booking-flow">
      <VehicleFlowHeader steps={STEPS} labels={STEP_LABELS} currentStep={step} />

      {step === "pickup" && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-4">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Pickup address</h2>
          <Input label="Pickup location" value={pickup} onChange={(e) => setPickup(e.target.value)} placeholder="Full pickup address" />
          <Button onClick={() => pickup.trim().length >= 5 && setStep("drop")} disabled={pickup.trim().length < 5}>Continue</Button>
        </div>
      )}

      {step === "drop" && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-4">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Drop address</h2>
          <Input label="Drop location" value={drop} onChange={(e) => setDrop(e.target.value)} placeholder="Full delivery address" />
          <div className="mt-4 flex flex-col gap-2.5">
            <Button variant="secondary" onClick={() => setStep("pickup")}>Back</Button>
            <Button onClick={() => drop.trim().length >= 5 && setStep("goods")} disabled={drop.trim().length < 5}>Continue</Button>
          </div>
        </div>
      )}

      {step === "goods" && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-4">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Goods details</h2>
          <Input label="Goods type" value={goodsType} onChange={(e) => setGoodsType(e.target.value)} placeholder="e.g. Furniture, boxes" />
          <Input label="Weight (kg)" type="number" value={String(weightKg)} onChange={(e) => setWeightKg(Number(e.target.value))} />
          <Textarea label="Size / dimensions" value={sizeDescription} onChange={(e) => setSizeDescription(e.target.value)} placeholder="Optional size details" />
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => uploadImages(e.target.files)} />
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>Upload photos</Button>
          {uploadError && <p className="rounded-xl px-4 py-3 text-sm bg-red-50 text-[var(--color-danger)]">{uploadError}</p>}
          <div className="mt-4 flex flex-col gap-2.5">
            <Button variant="secondary" onClick={() => setStep("drop")}>Back</Button>
            <Button onClick={() => goodsType.trim().length >= 2 && setStep("vehicle")} disabled={goodsType.trim().length < 2}>Continue</Button>
          </div>
        </div>
      )}

      {step === "vehicle" && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-4">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Select vehicle</h2>
          <div className="grid-2">
            {TRANSPORT_VEHICLE_TYPES.map((t) => (
              <button key={t.id} type="button" className={`vendor-card ${vehicleType === t.id ? "selected" : ""}`} onClick={() => setVehicleType(t.id)}>
                <FlaticonIcon name={t.icon} size={28} color="var(--color-brand)" />
                <p className="mb-1 text-[15px] font-semibold text-gray-900">{t.label}</p>
                <p className="text-sm text-gray-500">from {formatPrice(t.basePaise)}</p>
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-2.5">
            <Button variant="secondary" onClick={() => setStep("goods")}>Back</Button>
            <Button onClick={() => setStep("fare")}>Get fare estimate</Button>
          </div>
        </div>
      )}

      {step === "fare" && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-4">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Fare estimate</h2>
          <p className="text-sm text-gray-500">{pickup} → {drop}</p>
          <p className="mb-1 text-[15px] font-semibold text-gray-900">~{distanceKm} km · {formatPrice(fare)}</p>
          <div className="mt-4 flex flex-col gap-2.5">
            <Button variant="secondary" onClick={() => setStep("vehicle")}>Back</Button>
            <Button onClick={() => setStep("driver")}>Find driver</Button>
          </div>
        </div>
      )}

      {step === "driver" && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-4">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Assign driver</h2>
          {drivers.length === 0 ? (
            <p className="text-gray-500">Finding drivers…</p>
          ) : (
            drivers.map((d) => (
              <button key={d.id} type="button" className={`vendor-card ${driverId === d.id ? "selected" : ""}`} onClick={() => setDriverId(d.id)}>
                <p className="mb-1 text-[15px] font-semibold text-gray-900">{d.name}</p>
                <p className="text-sm text-gray-500">★ {d.rating.toFixed(1)} · {d.vehicleNumber}</p>
              </button>
            ))
          )}
          <div className="mt-4 flex flex-col gap-2.5">
            <Button variant="secondary" onClick={() => setStep("fare")}>Back</Button>
            <Button onClick={() => driverId && setStep("payment")} disabled={!driverId}>Continue</Button>
          </div>
        </div>
      )}

      {step === "payment" && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-4">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Confirm & pay</h2>
          <p className="mb-1 text-[15px] font-semibold text-gray-900">{formatPrice(fare)}</p>
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
            <Button variant="secondary" onClick={() => setStep("driver")}>Back</Button>
            <Button onClick={confirm} loading={loading} disabled={loading}>Confirm transport</Button>
          </div>
        </div>
      )}
    </div>
  );
}
