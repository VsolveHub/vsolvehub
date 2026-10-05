"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Calendar, Clock, ShieldCheck, Store, Info, AlertCircle } from "lucide-react";
import { isApiRequestError } from "@vsolve/api-client";
import { friendlyErrorMessage } from "@vsolve/query";
import { Button, IsoDateField, Select, useToast } from "@vsolve/ui";

import { completeOrOpenCheckout } from "../../payment/standalone-handoff";
import { formatPaise, type RentalAsset } from "../model";
import {
  DEFAULT_PICKUP_HOURS,
  atLocal,
  clockLabel,
  closedDayName,
  earliestPickup,
  firstPickup,
  isOpenDay,
  isoDay,
  lastPickupDay,
  noticeLabel,
  rentalDaysBetween,
  slotsForDay,
  suggestedReturn,
  whenLabel,
  type PickupHours,
} from "../pickup-time";
import { bookRental, fetchRentalPlatformFee } from "../queries";

const BUSINESS_NAME = "Vsolve Hub";

interface RentalBookPanelProps {
  /** The item page passes the detail read, which carries the owner's pickup hours. */
  asset: RentalAsset & { pickup_hours?: PickupHours };
}

export function RentalBookPanel({ asset }: RentalBookPanelProps) {
  const router = useRouter();
  const toast = useToast();

  const hours = asset.pickup_hours ?? DEFAULT_PICKUP_HOURS;
  // Fixed at first render: the slots should not shift under the customer's finger.
  const [now] = useState(() => new Date());
  const initial = useMemo(() => {
    const pickup = firstPickup(hours, now);
    const ret = pickup ? suggestedReturn(hours, pickup.day, pickup.time, 2) : null;
    return { pickup, ret };
  }, [hours, now]);

  const [startDate, setStartDate] = useState(initial.pickup?.day ?? "");
  const [startTime, setStartTime] = useState(initial.pickup?.time ?? "");
  const [endDate, setEndDate] = useState(initial.ret?.day ?? "");
  const [endTime, setEndTime] = useState(initial.ret?.time ?? "");
  const [notes, setNotes] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isHandingOff, setIsHandingOff] = useState(false);

  const earliest = earliestPickup(hours, now);
  const pickupSlots = slotsForDay(hours, startDate, earliest);
  const pickupAt = startDate && startTime ? atLocal(startDate, startTime) : null;
  const returnSlots = pickupAt ? slotsForDay(hours, endDate, pickupAt, { after: true }) : [];
  const returnAt = endDate && endTime && returnSlots.includes(endTime) ? atLocal(endDate, endTime) : null;
  const timesValid = Boolean(pickupAt && returnAt && pickupSlots.includes(startTime));

  const maxQty = Math.max(1, asset.quantity_available ?? 1);
  const clampedQty = Math.min(Math.max(1, quantity), maxQty);
  const days = pickupAt && returnAt ? rentalDaysBetween(pickupAt, returnAt) : 1;
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
        pickup_at: (pickupAt ?? new Date()).toISOString(),
        return_at: (returnAt ?? new Date()).toISOString(),
        pickup_or_delivery_mode: "PICKUP",
        notes,
        quantity: clampedQty,
      }),
    onSuccess: async (booking) => {
      const deposit = booking.deposit as
        | (typeof booking.deposit & { payment_attempt_id?: string | null })
        | undefined;

      const attemptId = deposit?.payment_attempt_id;

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
        if (err.code === "out_of_stock") {
          setError("Out of stock for these times. Try different times or another listing.");
          return;
        }
        if (err.code === "insufficient_quantity") {
          setError("Not enough pieces free for these times. Try different times.");
          return;
        }
      }
      const code = (err as { code?: string })?.code;
      if (code === "out_of_stock") {
        setError("Out of stock for these times. Try different times or another listing.");
        return;
      }
      if (code === "insufficient_quantity") {
        setError("Not enough pieces free for these times. Try different times.");
        return;
      }
      setError(friendlyErrorMessage(err));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!pickupAt || !pickupSlots.includes(startTime)) {
      setError("Choose a pickup date and time.");
      return;
    }
    if (!returnAt) {
      setError("Choose a return date and time after the pickup.");
      return;
    }
    mutation.mutate();
  };

  const minStart = isoDay(now);
  const maxStart = lastPickupDay(hours, now);
  const resetMutation = () => {
    setError(null);
    mutation.reset();
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
  const dateAwareUnavailable = isOutOfStockCode(mutation.error);
  const blockBooking = permanentlyOutOfStock || dateAwareUnavailable;

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-raised">
      <h2 className="text-xl font-bold text-text">Book This Rental</h2>
      <p className="mt-1 text-xs text-text-secondary">
        Choose when you will collect the item and when you will bring it back.
      </p>
      {permanentlyOutOfStock ? (
        <div className="mt-4 flex items-center gap-2 rounded-control border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">
          <AlertCircle className="size-4 shrink-0" />
          <span>Out of stock</span>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className="mt-6 flex flex-col gap-5">
        <p className="flex items-start gap-2 rounded-control bg-surface-sunken px-3 py-2 text-[11px] text-text-secondary">
          <Clock className="mt-0.5 size-3.5 shrink-0 text-text-secondary" />
          <span>
            Pickup &amp; return hours: <strong className="text-text">{hours.summary}</strong>
            {hours.min_notice_minutes > 0 ? <> · Book at least {noticeLabel(hours.min_notice_minutes)}</> : null}
          </span>
        </p>

        <TimeRow
          label="Pickup"
          day={startDate}
          time={startTime}
          minDay={minStart}
          maxDay={maxStart}
          slots={pickupSlots}
          closedNote={startDate && !isOpenDay(hours, startDate) ? `The owner is closed on ${closedDayName(startDate)}s.` : startDate && pickupSlots.length === 0 ? "No pickup times left on this day." : null}
          onDay={(value) => {
            setStartDate(value);
            const first = slotsForDay(hours, value, earliest)[0] ?? "";
            setStartTime(first);
            const next = first ? suggestedReturn(hours, value, first, Math.max(1, days)) : null;
            setEndDate(next?.day ?? "");
            setEndTime(next?.time ?? "");
            resetMutation();
          }}
          onTime={(value) => {
            setStartTime(value);
            resetMutation();
          }}
        />

        <TimeRow
          label="Return"
          day={endDate}
          time={returnSlots.includes(endTime) ? endTime : ""}
          minDay={startDate || minStart}
          slots={returnSlots}
          closedNote={endDate && !isOpenDay(hours, endDate) ? `The owner is closed on ${closedDayName(endDate)}s.` : endDate && returnSlots.length === 0 ? "No return times after your pickup on this day." : null}
          onDay={(value) => {
            setEndDate(value);
            const slots = pickupAt ? slotsForDay(hours, value, pickupAt, { after: true }) : [];
            setEndTime(slots.includes(startTime) ? startTime : (slots[0] ?? ""));
            resetMutation();
          }}
          onTime={(value) => {
            setEndTime(value);
            resetMutation();
          }}
        />

        {pickupAt && returnAt ? (
          <p className="rounded-control border border-line px-3 py-2 text-xs text-text">
            <strong>{whenLabel(pickupAt)}</strong> → <strong>{whenLabel(returnAt)}</strong>
            <span className="text-text-secondary"> · {days} day{days === 1 ? "" : "s"}</span>
            <span className="mt-0.5 block text-[10px] text-text-secondary">
              Charged per 24 hours. Returning up to 1 hour late is free.
            </span>
          </p>
        ) : null}

        <div className="flex items-start gap-2 rounded-control border border-line bg-surface-sunken p-3 text-xs text-text-secondary">
          <Store className="mt-0.5 size-4 shrink-0 text-action" />
          <div>
            <div className="font-bold text-text">Self pickup</div>
            <div className="text-[11px]">
              You collect this item from the owner
              {asset.location_text ? (
                <>
                  {" "}at <strong className="text-text">{asset.location_text}</strong>
                </>
              ) : null}{" "}
              and return it there. Delivery is not available. The owner&apos;s number is shared once
              your booking is confirmed.
            </div>
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
          disabled={mutation.isPending || isHandingOff || blockBooking || !timesValid}
          loading={mutation.isPending || isHandingOff}
          loadingLabel={isHandingOff ? "Opening payment…" : "Creating rental booking…"}
          className="w-full py-3 text-sm font-bold"
        >
          {permanentlyOutOfStock
            ? "Out of stock"
            : dateAwareUnavailable
              ? "Unavailable for these times"
              : "Confirm Rental Booking"}
        </Button>
      </form>
    </div>
  );
}

function TimeRow({
  label,
  day,
  time,
  minDay,
  maxDay,
  slots,
  closedNote,
  onDay,
  onTime,
}: {
  label: string;
  day: string;
  time: string;
  minDay: string;
  maxDay?: string;
  slots: string[];
  closedNote: string | null;
  onDay: (value: string) => void;
  onTime: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-xs font-bold text-text">
        <Calendar className="size-3.5 text-text-secondary" />
        {label}
      </span>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <IsoDateField required value={day} min={minDay} max={maxDay} onChange={onDay} aria-label={`${label} date`} />
        <Select
          aria-label={`${label} time`}
          value={time}
          disabled={slots.length === 0}
          onChange={(e) => onTime(e.target.value)}
          className="min-w-32"
        >
          {time ? null : <option value="">Time</option>}
          {slots.map((slot) => (
            <option key={slot} value={slot}>
              {clockLabel(slot)}
            </option>
          ))}
        </Select>
      </div>
      {closedNote ? (
        <p className="flex items-center gap-1 text-[11px] text-warning-text">
          <AlertCircle className="size-3 shrink-0" />
          {closedNote}
        </p>
      ) : null}
    </div>
  );
}
