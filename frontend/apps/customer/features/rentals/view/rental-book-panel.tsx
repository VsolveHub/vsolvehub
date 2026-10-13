"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Calendar, ShieldCheck, Store, Info, AlertCircle } from "lucide-react";
import { isApiRequestError } from "@vsolve/api-client";
import { friendlyErrorMessage } from "@vsolve/query";
import { Button, IsoDateField, useToast } from "@vsolve/ui";

import { completeOrOpenCheckout } from "../../payment/standalone-handoff";
import { calculateRentalDays, formatPaise, type RentalAsset, type RentalDeposit } from "../model";
import { bookRental, fetchRentalPlatformFee } from "../queries";

const BUSINESS_NAME = "Vsolve Hub";

interface RentalBookPanelProps {
  asset: RentalAsset;
}

function todayIso(): string {
  const d = new Date();
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function addDaysIso(baseIso: string, days: number): string {
  const [y, m, d] = baseIso.split("-").map(Number);
  const date = new Date(y!, m! - 1, d!, 12, 0, 0);
  date.setDate(date.getDate() + days);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function getInitialAvailableDates(
  minIso: string,
  reservedRanges?: Array<{ start_date: string; end_date: string }>,
  defaultDuration = 2,
): { start: string; end: string } {
  let candidateStart = addDaysIso(minIso, 1);
  let candidateEnd = addDaysIso(candidateStart, defaultDuration);

  if (!reservedRanges || reservedRanges.length === 0) {
    return { start: candidateStart, end: candidateEnd };
  }

  let hasOverlap = true;
  let attempts = 0;
  while (hasOverlap && attempts < 30) {
    attempts++;
    hasOverlap = false;
    for (const range of reservedRanges) {
      if (candidateStart < range.end_date && candidateEnd > range.start_date) {
        hasOverlap = true;
        candidateStart = range.end_date;
        candidateEnd = addDaysIso(candidateStart, defaultDuration);
        break;
      }
    }
  }

  return { start: candidateStart, end: candidateEnd };
}

function checkDateOverlap(
  start: string,
  end: string,
  reservedRanges?: Array<{ start_date: string; end_date: string }>,
): { start_date: string; end_date: string } | null {
  if (!reservedRanges || reservedRanges.length === 0) return null;
  for (const range of reservedRanges) {
    if (start < range.end_date && end > range.start_date) {
      return range;
    }
  }
  return null;
}

export function RentalBookPanel({ asset }: RentalBookPanelProps) {
  const router = useRouter();
  const toast = useToast();

  const minStart = todayIso();
  const initialDates = getInitialAvailableDates(minStart, asset.reserved_ranges, 2);

  const [startDate, setStartDate] = useState(initialDates.start);
  const [endDate, setEndDate] = useState(initialDates.end);
  const [notes, setNotes] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isHandingOff, setIsHandingOff] = useState(false);

  const maxQty = Math.max(1, asset.quantity_available ?? 1);
  const clampedQty = Math.min(Math.max(1, quantity), maxQty);
  const days = calculateRentalDays(startDate, endDate);
  const rentalChargePaise = days * asset.daily_rate_paise * clampedQty;
  const depositPaise = asset.deposit_paise * clampedQty;
  const platformFee = useQuery({
    queryKey: ["rental-platform-fee"],
    queryFn: fetchRentalPlatformFee,
    staleTime: 30_000,
  });
  const feePercent = platformFee.data?.percent ?? 0;
  const platformFeePaise = Math.floor((rentalChargePaise * feePercent) / 100);
  const totalDuePaise = rentalChargePaise + platformFeePaise + depositPaise;

  const mutation = useMutation({
    mutationFn: () =>
      bookRental({
        asset_id: asset.id,
        start_date: startDate,
        end_date: endDate,
        pickup_or_delivery_mode: "PICKUP",
        notes,
        quantity: clampedQty,
      }),
    onSuccess: async (booking) => {
      const attemptId = booking?.deposit?.payment_attempt_id;

      if (!attemptId) {
        toast.notify("Rental booking confirmed.");
        router.push("/rentals/mine");
        return;
      }

      setIsHandingOff(true);
      try {
        const result = await completeOrOpenCheckout(String(attemptId), {
          businessName: BUSINESS_NAME,
          onAwaitingCapture: () =>
            toast.notify("Complete payment in Razorpay. Booking stays Pending until capture."),
        });

        if (result.mode === "simulated") {
          toast.notify(
            "Rental fee and deposit recorded. Razorpay is not configured, so payment was simulated.",
          );
        } else if (result.mode === "pending") {
          toast.notify(
            "Booking created and unpaid (Pending). Payment is still preparing — open My Rentals shortly to pay.",
          );
        } else {
          toast.notify("Payment submitted. Waiting for Razorpay capture — booking stays Pending until then.");
        }
        router.push("/rentals/mine");
      } catch (err) {
        setError(
          friendlyErrorMessage(
            err,
            "The payment provider could not be opened. Booking is Pending until paid.",
          ),
        );
        router.push("/rentals/mine");
      } finally {
        setIsHandingOff(false);
      }
    },
    onError: (err: unknown) => {
      if (isApiRequestError(err)) {
        if (err.status === 401 || err.status === 403 || err.code === "not_authenticated") {
          setError("Please sign in to reserve this rental.");
          return;
        }
        if (err.code === "out_of_stock") {
          setError("Out of stock for these dates. Try different dates or another listing.");
          return;
        }
        if (err.code === "insufficient_quantity") {
          setError("Not enough quantity available for these dates. Try different dates.");
          return;
        }
      }
      const code = (err as { code?: string })?.code;
      if (code === "out_of_stock") {
        setError("Out of stock for these dates. Try different dates or another listing.");
        return;
      }
      if (code === "insufficient_quantity") {
        setError("Not enough quantity available for these dates. Try different dates.");
        return;
      }
      setError(friendlyErrorMessage(err));
    },
  });

  const overlap = checkDateOverlap(startDate, endDate, asset.reserved_ranges);

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
    if (overlap) {
      setError(
        `This equipment is already reserved from ${overlap.start_date} to ${overlap.end_date}. Please select dates after ${overlap.end_date}.`,
      );
      return;
    }
    mutation.mutate();
  };

  const permanentlyOutOfStock = asset.quantity_available === 0;
  const isOutOfStockCode = (err: unknown): boolean => {
    if (!err) return false;
    if (isApiRequestError(err)) {
      return err.code === "out_of_stock" || err.code === "insufficient_quantity";
    }
    const code = (err as { code?: string })?.code;
    return code === "out_of_stock" || code === "insufficient_quantity";
  };
  const dateAwareUnavailable = Boolean(overlap) || isOutOfStockCode(mutation.error);
  const blockBooking = permanentlyOutOfStock || dateAwareUnavailable;

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-raised">
      <h2 className="text-xl font-bold text-text">Book This Rental</h2>
      <p className="mt-1 text-xs text-text-secondary">
        Select your rental dates (DD/MM/YYYY). Zero hidden charges.
      </p>
      {overlap ? (
        <div className="mt-4 flex items-center gap-2 rounded-control border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
          <AlertCircle className="size-4 shrink-0" />
          <span>Already reserved from {overlap.start_date} to {overlap.end_date}. Please choose dates after {overlap.end_date}.</span>
        </div>
      ) : null}
      {permanentlyOutOfStock ? (
        <div className="mt-4 flex items-center gap-2 rounded-control border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">
          <AlertCircle className="size-4 shrink-0" />
          <span>Out of stock</span>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className="mt-6 flex flex-col gap-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-text flex items-center gap-1.5">
              <Calendar className="size-3.5 text-text-secondary" />
              Pickup Date
            </span>
            <IsoDateField
              required
              value={startDate}
              min={minStart}
              onChange={(value) => {
                setStartDate(value);
                setError(null);
                mutation.reset();
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-text flex items-center gap-1.5">
              <Calendar className="size-3.5 text-text-secondary" />
              Return Date
            </span>
            <IsoDateField
              required
              value={endDate}
              min={startDate || minStart}
              onChange={(value) => {
                setEndDate(value);
                setError(null);
                mutation.reset();
              }}
            />
          </div>
        </div>

        {/* Quick Duration Shortcuts */}
        <div className="flex gap-2">
          {[1, 2, 3, 7, 14].map((numDays) => {
            const isSelected = days === numDays;
            return (
              <button
                key={numDays}
                type="button"
                onClick={() => {
                  setEndDate(addDaysIso(startDate, numDays));
                  setError(null);
                  mutation.reset();
                }}
                disabled={permanentlyOutOfStock}
                className={`flex-1 items-center justify-center rounded-control border py-2 text-xs font-bold transition-colors ${
                  isSelected
                    ? "border-navy-900 bg-surface text-navy-900 shadow-2xs"
                    : "border-line bg-surface-sunken/60 text-text-secondary hover:bg-surface-hover hover:text-text"
                }`}
              >
                {numDays}d
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 rounded-control border border-line bg-surface-sunken p-3 text-xs text-text-secondary">
          <Store className="size-4 shrink-0 text-action" />
          <div>
            <div className="font-bold text-text">Self pickup</div>
            <div className="text-[10px]">Collect and return at the partner location. Doorstep delivery is not offered.</div>
          </div>
        </div>

        {maxQty > 1 ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-text">Quantity</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Decrease quantity"
                disabled={clampedQty <= 1 || permanentlyOutOfStock}
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="flex size-9 items-center justify-center rounded-control border border-line bg-surface text-sm font-bold text-text disabled:opacity-40"
              >
                −
              </button>
              <span className="min-w-8 text-center text-sm font-extrabold text-text">{clampedQty}</span>
              <button
                type="button"
                aria-label="Increase quantity"
                disabled={clampedQty >= maxQty || permanentlyOutOfStock}
                onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                className="flex size-9 items-center justify-center rounded-control border border-line bg-surface text-sm font-bold text-text disabled:opacity-40"
              >
                +
              </button>
              <span className="text-[11px] text-text-secondary">
                up to {maxQty} available
              </span>
            </div>
          </div>
        ) : null}

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

        <div className="rounded-control border border-line bg-surface-sunken p-4 text-xs space-y-2.5">
          <div className="flex justify-between items-center text-text-secondary">
            <span>
              Rental Duration ({days} day{days === 1 ? "" : "s"} × {formatPaise(asset.daily_rate_paise)}
              {clampedQty > 1 ? ` × ${clampedQty}` : ""})
            </span>
            <span className="font-semibold text-text">{formatPaise(rentalChargePaise)}</span>
          </div>

          {feePercent > 0 ? (
            <div className="flex justify-between items-center text-text-secondary">
              <span>Platform fee ({feePercent}%)</span>
              <span className="font-semibold text-text">{formatPaise(platformFeePaise)}</span>
            </div>
          ) : null}

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

        {error && (
          <div className="flex items-center gap-2 rounded-control bg-rose-50 border border-rose-200 p-3 text-xs font-medium text-rose-800">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Button
          type="submit"
          disabled={mutation.isPending || isHandingOff || blockBooking}
          loading={mutation.isPending || isHandingOff}
          loadingLabel={isHandingOff ? "Opening payment…" : "Creating rental booking…"}
          className="w-full py-3 text-sm font-bold"
        >
          {permanentlyOutOfStock
            ? "Out of stock"
            : dateAwareUnavailable
              ? "Unavailable for these dates"
              : "Confirm Rental Booking"}
        </Button>
      </form>
    </div>
  );
}
