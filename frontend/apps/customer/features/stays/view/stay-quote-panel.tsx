"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, Calendar, Check, Info, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Button } from "@vsolve/ui";

import { calculateNights, formatPaise, type StayProperty } from "../model";
import { createStayEnquiry, fetchStayQuote } from "../queries";

interface StayQuotePanelProps {
  property: StayProperty;
}

export function StayQuotePanel({ property }: StayQuotePanelProps) {
  const router = useRouter();

  // Default dates: check-in 7 days from now, check-out 10 days from now (3 nights)
  const defaultInDate = new Date();
  defaultInDate.setDate(defaultInDate.getDate() + 7);
  const defaultIn = defaultInDate.toISOString().split("T")[0];

  const defaultOutDate = new Date();
  defaultOutDate.setDate(defaultOutDate.getDate() + 10);
  const defaultOut = defaultOutDate.toISOString().split("T")[0];

  const [checkIn, setCheckIn] = useState(defaultIn);
  const [checkOut, setCheckOut] = useState(defaultOut);
  const [selectedUnitId, setSelectedUnitId] = useState<string>(
    property.units[0]?.id ?? "",
  );
  const [guestCount, setGuestCount] = useState(1);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectedUnit =
    property.units.find((u) => u.id === selectedUnitId) ?? property.units[0];

  const nights = calculateNights(checkIn, checkOut);

  // Live Server Date Quote query
  const { data: quote, isLoading: isQuoteLoading } = useQuery({
    queryKey: ["stay-quote", property.id, selectedUnitId, checkIn, checkOut],
    queryFn: () =>
      fetchStayQuote({
        property_id: property.id,
        unit_id: selectedUnitId || null,
        check_in: checkIn,
        check_out: checkOut,
      }),
    enabled: Boolean(property.id && checkIn && checkOut && new Date(checkOut) > new Date(checkIn)),
  });

  const nightlyRatePaise =
    quote?.nightly_rate_paise ?? selectedUnit?.nightly_rate_paise ?? 0;
  const totalQuotePaise =
    quote?.total_quote_paise ?? nights * nightlyRatePaise;

  const mutation = useMutation({
    mutationFn: () =>
      createStayEnquiry({
        property_id: property.id,
        unit_id: selectedUnitId || null,
        check_in: checkIn,
        check_out: checkOut,
        guest_count: guestCount,
        message,
      }),
    onSuccess: () => {
      router.push("/stays/mine");
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!checkIn || !checkOut) {
      setError("Please select check-in and check-out dates.");
      return;
    }
    if (new Date(checkOut) <= new Date(checkIn)) {
      setError("Check-out date must be after check-in date.");
      return;
    }
    mutation.mutate();
  };

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-raised">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-text">Reserve / Enquire</h2>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
          <ShieldCheck className="size-3.5" />
          Verified Property
        </span>
      </div>
      <p className="mt-1 text-xs text-text-secondary">
        Get an instant server date quote and send your enquiry to the host.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
        {/* Room / Unit Selection */}
        {property.units.length > 1 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-text">Select Room Type</span>
            <div className="grid grid-cols-1 gap-2">
              {property.units.map((unit) => (
                <button
                  key={unit.id}
                  type="button"
                  onClick={() => setSelectedUnitId(unit.id)}
                  className={`flex items-center justify-between rounded-control border p-3 text-left transition ${
                    selectedUnitId === unit.id
                      ? "border-action bg-action-surface text-action font-bold"
                      : "border-line bg-surface text-text-secondary hover:border-line-strong"
                  }`}
                >
                  <div className="text-xs font-bold text-text">{unit.name}</div>
                  <div className="text-xs font-extrabold text-action">
                    {formatPaise(unit.nightly_rate_paise)}/night
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Date Selection */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-text flex items-center gap-1.5">
              <Calendar className="size-3.5 text-text-secondary" />
              Check-in Date
            </span>
            <input
              type="date"
              required
              value={checkIn}
              min={new Date().toISOString().split("T")[0]}
              onChange={(e) => setCheckIn(e.target.value)}
              className="rounded-control border border-line bg-surface-sunken px-3.5 py-2.5 text-sm font-medium text-text focus:border-line-strong focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-text flex items-center gap-1.5">
              <Calendar className="size-3.5 text-text-secondary" />
              Check-out Date
            </span>
            <input
              type="date"
              required
              value={checkOut}
              min={checkIn || new Date().toISOString().split("T")[0]}
              onChange={(e) => setCheckOut(e.target.value)}
              className="rounded-control border border-line bg-surface-sunken px-3.5 py-2.5 text-sm font-medium text-text focus:border-line-strong focus:outline-none"
            />
          </label>
        </div>

        {/* Guest Count */}
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-text flex items-center gap-1.5">
            <Users className="size-3.5 text-text-secondary" />
            Number of Guests
          </span>
          <select
            value={guestCount}
            onChange={(e) => setGuestCount(Number(e.target.value))}
            className="rounded-control border border-line bg-surface-sunken px-3.5 py-2.5 text-sm font-medium text-text focus:border-line-strong focus:outline-none"
          >
            <option value={1}>1 Guest</option>
            <option value={2}>2 Guests</option>
            <option value={3}>3 Guests</option>
            <option value={4}>4+ Guests</option>
          </select>
        </label>

        {/* Message for Host */}
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-text">Message to Host (Optional)</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. Working professional at Hitec City, looking to move in next Monday. Require parking."
            rows={2}
            className="rounded-control border border-line bg-surface-sunken p-3 text-xs text-text placeholder:text-text-secondary/60 focus:border-line-strong focus:outline-none"
          />
        </label>

        {/* Server Date Pricing Breakdown */}
        <div className="rounded-control border border-line bg-surface-sunken p-4 text-xs space-y-2.5">
          <div className="flex justify-between items-center text-text-secondary">
            <span>
              Stay Duration ({nights} night{nights === 1 ? "" : "s"} × {formatPaise(nightlyRatePaise)})
            </span>
            <span className="font-semibold text-text">
              {isQuoteLoading ? "Calculating…" : formatPaise(totalQuotePaise)}
            </span>
          </div>

          <div className="flex justify-between items-center text-text-secondary">
            <span>Platform Service Fee</span>
            <span className="font-semibold text-emerald-700">₹0 (Free Enquiry)</span>
          </div>

          <div className="border-t border-line pt-2.5 flex justify-between items-center font-bold text-sm text-text">
            <span>Server Quoted Total</span>
            <span className="text-action text-base">
              {isQuoteLoading ? "…" : formatPaise(totalQuotePaise)}
            </span>
          </div>

          <p className="text-[11px] text-text-secondary/80 flex items-start gap-1.5 pt-1">
            <Info className="size-3.5 shrink-0 text-text-secondary mt-0.5" />
            Enquiry-first flow: the host will review your dates and confirm room availability. Zero payment required until booking confirmation.
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
          loadingLabel="Sending enquiry to host…"
          className="w-full py-3 text-sm font-bold"
        >
          Send Stay Enquiry
        </Button>
      </form>
    </div>
  );
}
