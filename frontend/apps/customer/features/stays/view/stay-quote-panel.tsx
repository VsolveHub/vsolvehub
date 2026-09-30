"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, Calendar, Check, Info, ShieldCheck, Users } from "lucide-react";
import { request, isApiRequestError } from "@vsolve/api-client";
import { friendlyErrorMessage } from "@vsolve/query";
import { Button, IsoDateField, useToast } from "@vsolve/ui";

import { getApiClient } from "@/lib/api/browser";

import { completeOrOpenCheckout } from "../../payment/standalone-handoff";
import { calculateNights, formatPaise, type StayProperty } from "../model";
import { createStayEnquiry, fetchStayQuote } from "../queries";

const BUSINESS_NAME = "Vsolve Hub";

interface StayQuotePanelProps {
  property: StayProperty;
}

type BookingMode = "RESERVATION" | "ENQUIRY";

function resolveBookingMode(property: StayProperty): BookingMode {
  return property.booking_mode === "RESERVATION" ? "RESERVATION" : "ENQUIRY";
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

async function createStayReservation(payload: {
  property_id: string;
  unit_id: string;
  check_in: string;
  check_out: string;
  guest_count: number;
}): Promise<{
  id: string;
  payment_attempt?: string | null;
  payment_attempt_id?: string | null;
  total_paise?: number;
}> {
  return request(() =>
    getApiClient().POST("/api/v1/stays/reserve", {
      body: payload,
    }),
  );
}

export function StayQuotePanel({ property }: StayQuotePanelProps) {
  const router = useRouter();
  const toast = useToast();
  const bookingMode = resolveBookingMode(property);
  const isReservation = bookingMode === "RESERVATION";

  const defaultIn = addDaysIso(todayIso(), 7);
  const defaultOut = addDaysIso(todayIso(), 10);

  const [checkIn, setCheckIn] = useState(defaultIn);
  const [checkOut, setCheckOut] = useState(defaultOut);
  const [selectedUnitId, setSelectedUnitId] = useState<string>(property.units[0]?.id ?? "");
  const [guestCount, setGuestCount] = useState(1);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isHandingOff, setIsHandingOff] = useState(false);

  const selectedUnit =
    property.units.find((u) => u.id === selectedUnitId) ?? property.units[0];
  // Guests are capped by the chosen room; switching to a smaller room lowers the count with it.
  const maxGuests = Math.max(selectedUnit?.max_guests ?? 1, 1);
  const guests = Math.min(guestCount, maxGuests);

  const nights = calculateNights(checkIn, checkOut);
  const minStayNights = property.min_stay_nights;
  const availableFrom = property.available_from ?? null;
  const availableUntil = property.available_until ?? null;

  const {
    data: quote,
    isLoading: isQuoteLoading,
    error: quoteError,
  } = useQuery({
    queryKey: ["stay-quote", property.id, selectedUnitId, checkIn, checkOut],
    queryFn: () =>
      fetchStayQuote({
        property_id: property.id,
        unit_id: selectedUnitId || null,
        check_in: checkIn,
        check_out: checkOut,
      }),
    enabled: Boolean(property.id && checkIn && checkOut && new Date(checkOut) > new Date(checkIn)),
    retry: false,
  });

  const nightlyRatePaise =
    quote?.nightly_rate_paise ?? selectedUnit?.nightly_rate_paise ?? 0;
  const totalQuotePaise = quote?.total_quote_paise ?? nights * nightlyRatePaise;

  function datesOutsideAvailabilityWindow(): boolean {
    if (!checkIn || !checkOut) return false;
    if (availableFrom && checkIn < availableFrom) return true;
    if (availableUntil && checkOut > availableUntil) return true;
    return false;
  }

  function quoteBlockerMessage(): string | null {
    if (typeof minStayNights === "number" && minStayNights > 0 && nights > 0 && nights < minStayNights) {
      return `Minimum stay is ${minStayNights} night${minStayNights === 1 ? "" : "s"}.`;
    }
    if (datesOutsideAvailabilityWindow()) {
      return "Not available for these dates.";
    }
    if (!quoteError) return null;
    if (isApiRequestError(quoteError)) {
      if (quoteError.code === "min_stay_not_met") {
        return typeof minStayNights === "number" && minStayNights > 0
          ? `Minimum stay is ${minStayNights} night${minStayNights === 1 ? "" : "s"}.`
          : (quoteError.message || "Minimum stay is not met for these dates.");
      }
      if (quoteError.code === "dates_unavailable") {
        return "Not available for these dates.";
      }
      return friendlyErrorMessage(quoteError);
    }
    return friendlyErrorMessage(quoteError);
  }

  const quoteBlocker = quoteBlockerMessage();

  const mutation = useMutation({
    mutationFn: async () => {
      if (isReservation) {
        if (!selectedUnitId) {
          throw new Error("Select a room to reserve.");
        }
        const reservation = await createStayReservation({
          property_id: property.id,
          unit_id: selectedUnitId,
          check_in: checkIn,
          check_out: checkOut,
          guest_count: guests,
        });
        return { kind: "reservation" as const, reservation };
      }
      await createStayEnquiry({
        property_id: property.id,
        unit_id: selectedUnitId || null,
        check_in: checkIn,
        check_out: checkOut,
        guest_count: guests,
        message,
      });
      return { kind: "enquiry" as const, reservation: null };
    },
    onSuccess: async ({ kind, reservation }) => {
      if (kind === "enquiry") {
        router.push("/stays/mine");
        return;
      }

      const attemptId =
        reservation?.payment_attempt_id ?? reservation?.payment_attempt ?? null;

      if (!attemptId) {
        router.push("/stays/mine");
        return;
      }

      setIsHandingOff(true);
      try {
        const result = await completeOrOpenCheckout(String(attemptId), {
          businessName: BUSINESS_NAME,
          onAwaitingCapture: () =>
            toast.notify("Complete payment in Razorpay. Stay stays Pending until capture."),
        });

        if (result.mode === "simulated") {
          toast.notify("Stay reserved. Payment was simulated (demo provider).");
        } else if (result.mode === "pending") {
          toast.notify(
            "Reservation held unpaid (Pending). Payment is still preparing — check My Stays shortly.",
          );
        } else {
          toast.notify(
            "Payment submitted. Waiting for Razorpay capture — stay stays Pending until then.",
          );
        }
        router.push("/stays/mine");
      } catch (err) {
        setError(
          friendlyErrorMessage(
            err,
            "The payment provider could not be opened. Reservation is Pending until paid.",
          ),
        );
        router.push("/stays/mine");
      } finally {
        setIsHandingOff(false);
      }
    },
    onError: (err: unknown) => {
      if (isApiRequestError(err)) {
        if (err.code === "min_stay_not_met") {
          setError(
            typeof minStayNights === "number" && minStayNights > 0
              ? `Minimum stay is ${minStayNights} night${minStayNights === 1 ? "" : "s"}.`
              : (err.message || "Minimum stay is not met for these dates."),
          );
          return;
        }
        if (err.code === "dates_unavailable") {
          setError("Not available for these dates.");
          return;
        }
      }
      setError(friendlyErrorMessage(err));
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
    if (typeof minStayNights === "number" && minStayNights > 0 && nights > 0 && nights < minStayNights) {
      setError(`Minimum stay is ${minStayNights} night${minStayNights === 1 ? "" : "s"}.`);
      return;
    }
    if (nights > 90) {
      setError("Maximum stay duration is 90 nights.");
      return;
    }
    if (datesOutsideAvailabilityWindow()) {
      setError("Not available for these dates.");
      return;
    }
    if (quoteBlocker) {
      setError(quoteBlocker);
      return;
    }
    mutation.mutate();
  };

  const minIn = todayIso();

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-raised">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-text">
          {isReservation ? "Pay & Reserve" : "Send Enquiry"}
        </h2>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
          <ShieldCheck className="size-3.5" />
          Verified Property
        </span>
      </div>
      <p className="mt-1 text-xs text-text-secondary">
        {isReservation
          ? "Instant quote for your dates (DD/MM/YYYY). Pay the stay total to lock the room."
          : "Get an instant quote and send an enquiry — hosts usually arrange a visit before confirming."}
      </p>
      {typeof minStayNights === "number" && minStayNights > 0 ? (
        <p className="mt-2 text-xs font-semibold text-text">
          Minimum stay: {minStayNights} night{minStayNights === 1 ? "" : "s"}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className="mt-6 flex flex-col gap-5">
        {property.units.length > 1 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-text">Select Room Type</span>
            <div className="grid grid-cols-1 gap-2">
              {property.units.map((unit) => (
                <button
                  key={unit.id}
                  type="button"
                  onClick={() => {
                    setSelectedUnitId(unit.id);
                    setError(null);
                    mutation.reset();
                  }}
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-text flex items-center gap-1.5">
              <Calendar className="size-3.5 text-text-secondary" />
              Check-in Date
            </span>
            <IsoDateField
              required
              value={checkIn}
              min={minIn}
              onChange={(value) => {
                setCheckIn(value);
                setError(null);
                mutation.reset();
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-text flex items-center gap-1.5">
              <Calendar className="size-3.5 text-text-secondary" />
              Check-out Date
            </span>
            <IsoDateField
              required
              value={checkOut}
              min={checkIn || minIn}
              onChange={(value) => {
                setCheckOut(value);
                setError(null);
                mutation.reset();
              }}
            />
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-text flex items-center gap-1.5">
            <Users className="size-3.5 text-text-secondary" />
            Number of Guests
          </span>
          <select
            value={guests}
            onChange={(e) => setGuestCount(Number(e.target.value))}
            className="rounded-control border border-line bg-surface-sunken px-3.5 py-2.5 text-sm font-medium text-text focus:border-line-strong focus:outline-none"
          >
            {Array.from({ length: maxGuests }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "Guest" : "Guests"}
              </option>
            ))}
          </select>
        </label>

        {!isReservation && (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-text">Message to Host (Optional)</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. Working professional, can visit this weekend."
              rows={2}
              className="rounded-control border border-line bg-surface-sunken p-3 text-xs text-text placeholder:text-text-secondary/60 focus:border-line-strong focus:outline-none"
            />
          </label>
        )}

        <div className="rounded-control border border-line bg-surface-sunken p-4 text-xs space-y-2.5">
          <div className="flex justify-between items-center text-text-secondary">
            <span>
              Stay Duration ({nights} night{nights === 1 ? "" : "s"} × {formatPaise(nightlyRatePaise)})
            </span>
            <span className="font-semibold text-text">
              {isQuoteLoading ? "Calculating…" : formatPaise(totalQuotePaise)}
            </span>
          </div>

          <div className="border-t border-line pt-2.5 flex justify-between items-center font-bold text-sm text-text">
            <span>{isReservation ? "Amount due now" : "Quoted total"}</span>
            <span className="text-action text-base">
              {isQuoteLoading ? "…" : formatPaise(totalQuotePaise)}
            </span>
          </div>

          <p className="text-[11px] text-text-secondary/80 flex items-start gap-1.5 pt-1">
            <Info className="size-3.5 shrink-0 text-text-secondary mt-0.5" />
            {isReservation
              ? "Paid reservation locks these dates. Unpaid stays remain Pending until Razorpay capture."
              : "Enquiry-first: host reviews dates; no payment until you agree after a visit."}
          </p>
        </div>

        {(error || quoteBlocker) && (
          <div className="flex items-center gap-2 rounded-control bg-rose-50 border border-rose-200 p-3 text-xs font-medium text-rose-800">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error ?? quoteBlocker}</span>
          </div>
        )}

        <Button
          type="submit"
          disabled={mutation.isPending || isHandingOff || Boolean(quoteBlocker)}
          loading={mutation.isPending || isHandingOff}
          loadingLabel={
            isHandingOff
              ? "Opening payment…"
              : isReservation
                ? "Reserving…"
                : "Sending enquiry…"
          }
          className="w-full py-3 text-sm font-bold"
        >
          {isReservation ? (
            <>
              <Check className="size-4" />
              Pay & Reserve
            </>
          ) : (
            "Send Stay Enquiry"
          )}
        </Button>
      </form>
    </div>
  );
}
