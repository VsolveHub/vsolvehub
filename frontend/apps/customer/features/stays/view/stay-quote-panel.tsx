"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, Calendar, Info, Phone, ShieldCheck, Users } from "lucide-react";
import { isApiRequestError } from "@vsolve/api-client";
import { friendlyErrorMessage } from "@vsolve/query";
import { Button, IsoDateField } from "@vsolve/ui";

import {
  formatPaise,
  formatRate,
  pricePeriodOf,
  stayLengthLabel,
  type StayProperty,
} from "../model";
import { createStayEnquiry, fetchStayQuote } from "../queries";

interface StayQuotePanelProps {
  property: StayProperty;
}

/** How long a guest can ask for, in the property's unit. */
const LENGTH_CHOICES = { MONTH: 24, NIGHT: 30 } as const;

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

function refusalMessage(err: unknown, minimumLabel: string): string {
  if (isApiRequestError(err)) {
    if (err.code === "min_stay_not_met") return `Minimum stay is ${minimumLabel}.`;
    if (err.code === "dates_unavailable") return "The host isn't taking stays from that date.";
  }
  return friendlyErrorMessage(err);
}

/**
 * The guest's side of a stay: send an enquiry, and the host calls.
 *
 * Nothing is paid here. The guest picks a room (when there is more than one), a start date,
 * how long (months or nights, whichever the property is priced in) and how many people. The
 * estimate is the room's rate times that length, so the guest knows roughly what to expect
 * before the call.
 */
export function StayQuotePanel({ property }: StayQuotePanelProps) {
  const router = useRouter();
  const period = pricePeriodOf(property.price_period);
  const monthly = period === "MONTH";
  const minimum = Math.max(property.min_stay_nights ?? 1, 1);
  const minimumLabel = stayLengthLabel(minimum, period);

  const [checkIn, setCheckIn] = useState(addDaysIso(todayIso(), 7));
  const [length, setLength] = useState(minimum);
  const [selectedUnitId, setSelectedUnitId] = useState<string>(property.units[0]?.id ?? "");
  const [guestCount, setGuestCount] = useState(1);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectedUnit = property.units.find((u) => u.id === selectedUnitId) ?? property.units[0];
  // Guests are capped by the chosen room; switching to a smaller room lowers the count with it.
  const maxGuests = Math.max(selectedUnit?.max_guests ?? 1, 1);
  const guests = Math.min(guestCount, maxGuests);
  const lengthOptions = Array.from(
    { length: LENGTH_CHOICES[period] - minimum + 1 },
    (_, index) => minimum + index,
  );

  const quote = useQuery({
    queryKey: ["stay-quote", property.id, selectedUnitId, checkIn, length],
    queryFn: () =>
      fetchStayQuote({
        property_id: property.id,
        unit_id: selectedUnitId || null,
        check_in: checkIn,
        length,
      }),
    enabled: Boolean(property.id && checkIn && selectedUnitId),
    retry: false,
  });

  const rate = quote.data?.nightly_rate_paise ?? selectedUnit?.nightly_rate_paise ?? 0;
  const estimate = quote.data?.total_quote_paise ?? rate * length;
  const quoteProblem = quote.error ? refusalMessage(quote.error, minimumLabel) : null;

  const mutation = useMutation({
    mutationFn: () =>
      createStayEnquiry({
        property_id: property.id,
        unit_id: selectedUnitId || null,
        check_in: checkIn,
        length,
        guest_count: guests,
        message,
      }),
    onSuccess: () => router.push("/stays/mine"),
    onError: (err: unknown) => setError(refusalMessage(err, minimumLabel)),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!checkIn) {
      setError(monthly ? "Choose a move-in date." : "Choose a check-in date.");
      return;
    }
    if (quoteProblem) {
      setError(quoteProblem);
      return;
    }
    mutation.mutate();
  };

  const reset = () => {
    setError(null);
    mutation.reset();
  };

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-raised">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-text">Send an enquiry</h2>
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
          <ShieldCheck className="size-3.5" />
          Verified host
        </span>
      </div>
      <p className="mt-1 text-xs text-text-secondary">
        The host calls you to talk it through. Nothing is paid here.
      </p>

      <form onSubmit={handleSubmit} noValidate className="mt-6 flex flex-col gap-5">
        {property.units.length > 1 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-text">Room</span>
            <div className="grid grid-cols-1 gap-2">
              {property.units.map((unit) => (
                <button
                  key={unit.id}
                  type="button"
                  onClick={() => {
                    setSelectedUnitId(unit.id);
                    reset();
                  }}
                  className={`flex items-center justify-between rounded-control border p-3 text-left transition ${
                    selectedUnitId === unit.id
                      ? "border-action bg-action-surface font-bold text-action"
                      : "border-line bg-surface text-text-secondary hover:border-line-strong"
                  }`}
                >
                  <div className="text-xs font-bold text-text">{unit.name}</div>
                  <div className="text-xs font-extrabold text-action">
                    {formatRate(unit.nightly_rate_paise, period)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className="flex items-center gap-1.5 text-xs font-bold text-text">
              <Calendar className="size-3.5 text-text-secondary" />
              {monthly ? "Move-in date" : "Check-in date"}
            </span>
            <IsoDateField
              required
              value={checkIn}
              min={todayIso()}
              onChange={(value) => {
                setCheckIn(value);
                reset();
              }}
            />
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-text">
              {monthly ? "For how many months" : "For how many nights"}
            </span>
            <select
              value={length}
              onChange={(e) => {
                setLength(Number(e.target.value));
                reset();
              }}
              className="rounded-control border border-line bg-surface-sunken px-3.5 py-2.5 text-sm font-medium text-text focus:border-line-strong focus:outline-none"
            >
              {lengthOptions.map((n) => (
                <option key={n} value={n}>
                  {stayLengthLabel(n, period)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5 text-xs font-bold text-text">
            <Users className="size-3.5 text-text-secondary" />
            Guests
          </span>
          <select
            value={guests}
            onChange={(e) => setGuestCount(Number(e.target.value))}
            className="rounded-control border border-line bg-surface-sunken px-3.5 py-2.5 text-sm font-medium text-text focus:border-line-strong focus:outline-none"
          >
            {Array.from({ length: maxGuests }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "guest" : "guests"}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-text">Message to the host (optional)</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. Working professional, can visit this weekend."
            rows={2}
            className="rounded-control border border-line bg-surface-sunken p-3 text-xs text-text placeholder:text-text-secondary/60 focus:border-line-strong focus:outline-none"
          />
        </label>

        <div className="space-y-2.5 rounded-control border border-line bg-surface-sunken p-4 text-xs">
          <div className="flex items-center justify-between text-text-secondary">
            <span>
              {formatRate(rate, period)} × {stayLengthLabel(length, period)}
            </span>
            <span className="text-sm font-bold text-text">
              {quote.isLoading ? "…" : `about ${formatPaise(estimate)}`}
            </span>
          </div>
          <p className="flex items-start gap-1.5 pt-1 text-[11px] text-text-secondary/80">
            <Phone className="mt-0.5 size-3.5 shrink-0 text-text-secondary" />
            Your name and phone number are shared with the host so they can call you.
          </p>
          <p className="flex items-start gap-1.5 text-[11px] text-text-secondary/80">
            <Info className="mt-0.5 size-3.5 shrink-0 text-text-secondary" />
            An estimate only — you agree the final price and payment with the host.
          </p>
        </div>

        {(error || quoteProblem) && (
          <div className="flex items-center gap-2 rounded-control border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-800">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error ?? quoteProblem}</span>
          </div>
        )}

        <Button
          type="submit"
          disabled={mutation.isPending || Boolean(quoteProblem)}
          loading={mutation.isPending}
          loadingLabel="Sending enquiry…"
          className="w-full py-3 text-sm font-bold"
        >
          Send enquiry
        </Button>
      </form>
    </div>
  );
}
