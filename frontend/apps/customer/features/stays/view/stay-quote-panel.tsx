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
  onSelectUnit?: (unitId: string) => void;
  onViewProperty?: () => void;
  embedded?: boolean;
  initialUnitId?: string;
}

/** Server limits, in the property's unit: 24 months or 90 nights. */
const LENGTH_CHOICES = { MONTH: 24, NIGHT: 90 } as const;

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
export function StayQuotePanel({
  property,
  onSelectUnit,
  onViewProperty: _onViewProperty,
  embedded = false,
  initialUnitId,
}: StayQuotePanelProps) {
  const router = useRouter();
  const period = pricePeriodOf(property.price_period);
  const monthly = period === "MONTH";
  const minimum = Math.max(property.min_stay_nights ?? 1, 1);
  const minimumLabel = stayLengthLabel(minimum, period);

  const maxLength = LENGTH_CHOICES[period];
  const [checkIn, setCheckIn] = useState(addDaysIso(todayIso(), 7));
  const [length, setLength] = useState(minimum);
  const [lengthText, setLengthText] = useState(String(minimum));
  const [selectedUnitId, setSelectedUnitId] = useState<string>(
    property.units.find((u) => u.id === initialUnitId)?.id ?? property.units[0]?.id ?? "",
  );
  const [adultCount, setAdultCount] = useState(1);
  const [childCount, setChildCount] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectedUnit = property.units.find((u) => u.id === selectedUnitId) ?? property.units[0];
  // Room capacity gates the total headcount.
  const maxGuests = Math.max(selectedUnit?.max_guests ?? 1, 1);
  // Clamp adults to stay within capacity minus children.
  const adults = Math.min(Math.max(adultCount, 1), Math.max(maxGuests - childCount, 1));
  const children = Math.min(childCount, Math.max(maxGuests - adults, 0));
  const totalGuests = adults + children;

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
        guest_count: totalGuests,
        adult_count: adults,
        child_count: children,
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

  const commitLength = (raw: string) => {
    const next = Number(raw);
    const clamped = Number.isInteger(next)
      ? Math.min(maxLength, Math.max(minimum, next))
      : minimum;
    setLength(clamped);
    setLengthText(String(clamped));
    reset();
  };

  const frame = embedded
    ? ""
    : "rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-raised";

  return (
    <div className={frame}>
      {embedded ? null : (
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-bold text-text">Send an enquiry</h2>
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
            <ShieldCheck className="size-3.5" />
            Verified host
          </span>
        </div>
      )}
      <p className={embedded ? "text-xs text-text-secondary" : "mt-1 text-xs text-text-secondary"}>
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
                    onSelectUnit?.(unit.id);
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
            <input
              type="number"
              inputMode="numeric"
              min={minimum}
              max={maxLength}
              step={1}
              required
              value={lengthText}
              onChange={(event) => {
                const raw = event.target.value;
                setLengthText(raw);
                const next = Number(raw);
                if (raw !== "" && Number.isInteger(next) && next >= 1) {
                  setLength(next);
                  reset();
                }
              }}
              onBlur={() => commitLength(lengthText)}
              className="rounded-control border border-line bg-surface-sunken px-3.5 py-2.5 text-sm font-medium text-text focus:border-line-strong focus:outline-none"
            />
          </label>
        </div>

        {/* Adults + Children breakdown */}
        <div className="flex flex-col gap-2">
          <span className="flex items-center gap-1.5 text-xs font-bold text-text">
            <Users className="size-3.5 text-text-secondary" />
            Guests
          </span>

          {/* Adults row */}
          <div className="flex items-center justify-between rounded-control border border-line bg-surface-sunken px-3.5 py-2">
            <div>
              <p className="text-sm font-semibold text-text">Adults</p>
              <p className="text-[11px] text-text-secondary">Age 13+</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={adultCount <= 1}
                onClick={() => setAdultCount((n) => Math.max(1, n - 1))}
                className="flex size-7 items-center justify-center rounded-full border border-line bg-surface text-text transition hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Decrease adults"
              >
                –
              </button>
              <span className="w-4 text-center text-sm font-bold tabular-nums">{adultCount}</span>
              <button
                type="button"
                disabled={adultCount + childCount >= maxGuests}
                onClick={() => setAdultCount((n) => Math.min(n + 1, maxGuests - childCount))}
                className="flex size-7 items-center justify-center rounded-full border border-line bg-surface text-text transition hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Increase adults"
              >
                +
              </button>
            </div>
          </div>

          {/* Children row */}
          <div className="flex items-center justify-between rounded-control border border-line bg-surface-sunken px-3.5 py-2">
            <div>
              <p className="text-sm font-semibold text-text">Children</p>
              <p className="text-[11px] text-text-secondary">Under 13</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={childCount <= 0}
                onClick={() => setChildCount((n) => Math.max(0, n - 1))}
                className="flex size-7 items-center justify-center rounded-full border border-line bg-surface text-text transition hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Decrease children"
              >
                –
              </button>
              <span className="w-4 text-center text-sm font-bold tabular-nums">{childCount}</span>
              <button
                type="button"
                disabled={adultCount + childCount >= maxGuests}
                onClick={() => setChildCount((n) => Math.min(n + 1, maxGuests - adultCount))}
                className="flex size-7 items-center justify-center rounded-full border border-line bg-surface text-text transition hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Increase children"
              >
                +
              </button>
            </div>
          </div>

          {/* Total summary */}
          <p className="px-1 text-[11px] text-text-secondary">
            <span className="font-semibold text-text">{totalGuests}</span> guest
            {totalGuests === 1 ? "" : "s"} total{" "}
            {maxGuests > 1 && (
              <span className="text-text-secondary/70">· room fits up to {maxGuests}</span>
            )}
          </p>
        </div>

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
