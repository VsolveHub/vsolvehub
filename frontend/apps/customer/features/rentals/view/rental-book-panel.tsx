"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Calendar, ShieldCheck, Truck, Store, Info, AlertCircle } from "lucide-react";
import { Button } from "@vsolve/ui";

import { calculateRentalDays, formatPaise, type RentalAsset } from "../model";
import { bookRental } from "../queries";

interface RentalBookPanelProps {
  asset: RentalAsset;
}

export function RentalBookPanel({ asset }: RentalBookPanelProps) {
  const router = useRouter();

  // Default dates: tomorrow and day after tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultStart = tomorrow.toISOString().split("T")[0];

  const threeDaysLater = new Date();
  threeDaysLater.setDate(threeDaysLater.getDate() + 3);
  const defaultEnd = threeDaysLater.toISOString().split("T")[0];

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [mode, setMode] = useState<"PICKUP" | "DELIVERY">("PICKUP");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const days = calculateRentalDays(startDate, endDate);
  const rentalChargePaise = days * asset.daily_rate_paise;
  const depositPaise = asset.deposit_paise;
  const totalDuePaise = rentalChargePaise + depositPaise;

  const mutation = useMutation({
    mutationFn: () =>
      bookRental({
        asset_id: asset.id,
        start_date: startDate,
        end_date: endDate,
        pickup_or_delivery_mode: mode,
        notes,
      }),
    onSuccess: () => {
      router.push("/rentals/mine");
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!startDate || !endDate) {
      setError("Please select both start and end rental dates.");
      return;
    }
    if (new Date(endDate) <= new Date(startDate)) {
      setError("Rental return date must be after pickup date.");
      return;
    }
    mutation.mutate();
  };

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-raised">
      <h2 className="text-xl font-bold text-text">Book This Rental</h2>
      <p className="mt-1 text-xs text-text-secondary">
        Select your rental dates. Zero hidden charges.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
        {/* Date Selection */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-text flex items-center gap-1.5">
              <Calendar className="size-3.5 text-text-secondary" />
              Pickup Date
            </span>
            <input
              type="date"
              required
              value={startDate}
              min={new Date().toISOString().split("T")[0]}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-control border border-line bg-surface-sunken px-3.5 py-2.5 text-sm font-medium text-text focus:border-line-strong focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-text flex items-center gap-1.5">
              <Calendar className="size-3.5 text-text-secondary" />
              Return Date
            </span>
            <input
              type="date"
              required
              value={endDate}
              min={startDate || new Date().toISOString().split("T")[0]}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-control border border-line bg-surface-sunken px-3.5 py-2.5 text-sm font-medium text-text focus:border-line-strong focus:outline-none"
            />
          </label>
        </div>

        {/* Handover Mode Selection */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold text-text">Handover Preference</span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode("PICKUP")}
              className={`flex items-center gap-2 rounded-control border p-3 text-left transition ${
                mode === "PICKUP"
                  ? "border-action bg-action-surface text-action font-bold"
                  : "border-line bg-surface text-text-secondary hover:border-line-strong"
              }`}
            >
              <Store className="size-4 shrink-0" />
              <div>
                <div className="text-xs font-bold">Self Pickup</div>
                <div className="text-[10px] text-text-secondary">From partner store</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setMode("DELIVERY")}
              className={`flex items-center gap-2 rounded-control border p-3 text-left transition ${
                mode === "DELIVERY"
                  ? "border-action bg-action-surface text-action font-bold"
                  : "border-line bg-surface text-text-secondary hover:border-line-strong"
              }`}
            >
              <Truck className="size-4 shrink-0" />
              <div>
                <div className="text-xs font-bold">Doorstep Delivery</div>
                <div className="text-[10px] text-text-secondary">Partner delivers</div>
              </div>
            </button>
          </div>
        </div>

        {/* Notes */}
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-text">Notes / Special Instructions (Optional)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Need masonry drill bits, planning concrete anchor installation"
            rows={2}
            className="rounded-control border border-line bg-surface-sunken p-3 text-xs text-text placeholder:text-text-secondary/60 focus:border-line-strong focus:outline-none"
          />
        </label>

        {/* Transparent Cost Calculation breakdown */}
        <div className="rounded-control border border-line bg-surface-sunken p-4 text-xs space-y-2.5">
          <div className="flex justify-between items-center text-text-secondary">
            <span>
              Rental Duration ({days} day{days === 1 ? "" : "s"} × {formatPaise(asset.daily_rate_paise)})
            </span>
            <span className="font-semibold text-text">{formatPaise(rentalChargePaise)}</span>
          </div>

          <div className="flex justify-between items-center text-text-secondary">
            <span className="flex items-center gap-1">
              Refundable Security Deposit
              <ShieldCheck className="size-3.5 text-emerald-600" />
            </span>
            <span className="font-semibold text-text">{formatPaise(depositPaise)}</span>
          </div>

          <div className="border-t border-line pt-2.5 flex justify-between items-center font-bold text-sm text-text">
            <span>Total Value</span>
            <span className="text-action text-base">{formatPaise(totalDuePaise)}</span>
          </div>

          <p className="text-[11px] text-text-secondary/80 flex items-start gap-1.5 pt-1">
            <Info className="size-3.5 shrink-0 text-text-secondary mt-0.5" />
            The security deposit is 100% refundable immediately upon equipment return and standard condition inspection.
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="flex items-center gap-2 rounded-control bg-rose-50 border border-rose-200 p-3 text-xs font-medium text-rose-800">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Submit Button */}
        <Button
          type="submit"
          disabled={mutation.isPending}
          loading={mutation.isPending}
          loadingLabel="Creating rental booking…"
          className="w-full py-3 text-sm font-bold"
        >
          Confirm Rental Booking
        </Button>
      </form>
    </div>
  );
}
