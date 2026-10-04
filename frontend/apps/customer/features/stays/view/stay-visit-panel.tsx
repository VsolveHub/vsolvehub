"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, CalendarClock, CheckCircle2 } from "lucide-react";
import { isApiRequestError } from "@vsolve/api-client";
import { friendlyErrorMessage } from "@vsolve/query";
import { Button } from "@vsolve/ui";

import {
  formatRate,
  pricePeriodOf,
  visitDayLabel,
  visitWindowLabel,
  type StayProperty,
} from "../model";
import { createStayVisit, fetchVisitSlots, type StayVisit } from "../queries";

function visitRefusal(err: unknown): string {
  if (isApiRequestError(err)) {
    if (err.code === "duplicate_visit") return "You already have a visit here that day.";
    if (err.code === "slot_passed") return "That time has passed. Pick another slot.";
    if (err.code === "slot_unavailable") return "The owner no longer offers that time. Pick another.";
    if (err.code === "visit_date_blocked") return "The owner isn't taking visits that day.";
  }
  return friendlyErrorMessage(err);
}

/**
 * "Schedule a visit": the guest picks one of the owner's visiting slots in the next two weeks.
 *
 * Several guests may pick the same slot. The owner accepts or declines; the guest is notified
 * and, once accepted, sees the owner's number on the visit.
 */
export function StayVisitPanel({ property }: { property: StayProperty }) {
  const period = pricePeriodOf(property.price_period);
  const slots = useQuery({
    queryKey: ["stay-visit-slots", property.id],
    queryFn: () => fetchVisitSlots(property.id),
  });
  const days = useMemo(() => slots.data ?? [], [slots.data]);

  const [day, setDay] = useState<string | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [unitId, setUnitId] = useState<string>("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState<StayVisit | null>(null);

  const chosenDay = days.find((row) => row.date === day) ?? null;

  const mutation = useMutation({
    mutationFn: () =>
      createStayVisit({
        property_id: property.id,
        slot_id: slotId ?? "",
        visit_date: day ?? "",
        unit_id: unitId || null,
        message,
      }),
    onSuccess: (visit) => setRequested(visit as StayVisit),
    onError: (err: unknown) => setError(visitRefusal(err)),
  });

  if (requested) {
    return (
      <div className="flex flex-col gap-4" role="status">
        <div className="flex items-start gap-3 rounded-control border border-emerald-200 bg-emerald-50 p-4">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
          <div>
            <p className="text-sm font-bold text-emerald-900">Visit requested</p>
            <p className="mt-0.5 text-xs leading-relaxed text-emerald-900/90">
              {visitDayLabel(requested.visit_date)},{" "}
              {visitWindowLabel(requested.start_time, requested.end_time)}. The owner will
              confirm — you&apos;ll be notified, and you&apos;ll see their number once it&apos;s
              accepted.
            </p>
          </div>
        </div>
        <Link
          href="/stays/mine?tab=visits"
          className="text-center text-xs font-bold text-text-link hover:underline"
        >
          See my visits
        </Link>
      </div>
    );
  }

  if (slots.isLoading) {
    return <p className="text-sm text-text-secondary">Loading visiting times…</p>;
  }
  if (slots.error) {
    return <p className="text-sm text-danger-text">{friendlyErrorMessage(slots.error)}</p>;
  }
  if (days.length === 0) {
    return (
      <p className="rounded-control border border-dashed border-line-strong bg-surface-sunken p-4 text-sm text-text-secondary">
        The owner has no visiting times in the next two weeks. Send an enquiry instead and they
        will call you.
      </p>
    );
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        if (!day || !slotId) {
          setError("Pick a day and a time.");
          return;
        }
        mutation.mutate();
      }}
    >
      <p className="text-xs text-text-secondary">
        Pick a day and one of the owner&apos;s visiting times. The owner accepts or declines and
        you&apos;re notified either way.
      </p>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-text">
          <CalendarClock className="size-3.5 text-text-secondary" aria-hidden />
          Day
        </legend>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {days.map((row) => (
            <button
              key={row.date}
              type="button"
              aria-pressed={day === row.date}
              onClick={() => {
                setDay(row.date);
                setSlotId(null);
                setError(null);
              }}
              className={`shrink-0 rounded-control border px-3 py-2 text-xs font-bold transition ${
                day === row.date
                  ? "border-action bg-action-surface text-action"
                  : "border-line bg-surface text-text-secondary hover:border-line-strong"
              }`}
            >
              {visitDayLabel(row.date)}
            </button>
          ))}
        </div>
      </fieldset>

      {chosenDay ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-xs font-bold text-text">Time</legend>
          <div className="grid grid-cols-2 gap-2">
            {chosenDay.slots.map((slot) => (
              <button
                key={slot.id}
                type="button"
                aria-pressed={slotId === slot.id}
                onClick={() => {
                  setSlotId(slot.id);
                  setError(null);
                }}
                className={`rounded-control border px-3 py-2.5 text-xs font-bold transition ${
                  slotId === slot.id
                    ? "border-action bg-action-surface text-action"
                    : "border-line bg-surface text-text hover:border-line-strong"
                }`}
              >
                {visitWindowLabel(slot.start_time, slot.end_time)}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      {property.units.length > 1 ? (
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-text">Room you&apos;re interested in (optional)</span>
          <select
            value={unitId}
            onChange={(event) => setUnitId(event.target.value)}
            className="rounded-control border border-line bg-surface-sunken px-3.5 py-2.5 text-sm text-text focus:border-line-strong focus:outline-none"
          >
            <option value="">Any room</option>
            {property.units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name} · {formatRate(unit.nightly_rate_paise, period)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-bold text-text">Message to the owner (optional)</span>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={2}
          maxLength={1000}
          placeholder="e.g. Coming with a friend."
          className="rounded-control border border-line bg-surface-sunken p-3 text-xs text-text placeholder:text-text-secondary/60 focus:border-line-strong focus:outline-none"
        />
      </label>

      {error ? (
        <div className="flex items-center gap-2 rounded-control border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-800">
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      ) : null}

      <Button
        type="submit"
        loading={mutation.isPending}
        loadingLabel="Requesting visit…"
        className="w-full py-3 text-sm font-bold"
      >
        Request visit
      </Button>
    </form>
  );
}
