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
import { useCustomerSession } from "@/features/session/queries";
import { SignInCard, isSignInError } from "@/features/session/view/sign-in-gate";

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
export function StayVisitPanel({
  property,
  initialUnitId,
  initialLookId,
}: {
  property: StayProperty;
  /** The room chosen to start with (the one opened from search). */
  initialUnitId?: string;
  /** The look opened from search, sent with the visit while that room type stays chosen. */
  initialLookId?: string;
}) {
  const period = pricePeriodOf(property.price_period);
  const slots = useQuery({
    queryKey: ["stay-visit-slots", property.id],
    queryFn: () => fetchVisitSlots(property.id),
  });
  const days = useMemo(() => slots.data ?? [], [slots.data]);

  const [day, setDay] = useState<string | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [unitId, setUnitId] = useState<string>(
    property.units.some((u) => u.id === initialUnitId) ? (initialUnitId ?? "") : "",
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState<StayVisit | null>(null);

  const openDays = useMemo(() => new Set(days.map((row) => row.date)), [days]);
  // The first open day is chosen up front, so times show straight away.
  const activeDay = day ?? days[0]?.date ?? null;
  const chosenDay = days.find((row) => row.date === activeDay) ?? null;

  // Visiting times are open to everyone; requesting one needs an account.
  const session = useCustomerSession();
  const mutation = useMutation({
    mutationFn: () =>
      createStayVisit({
        property_id: property.id,
        slot_id: slotId ?? "",
        visit_date: activeDay ?? "",
        unit_id: unitId || null,
        // The look opened from search, as long as the guest kept its room type.
        look_id:
          initialLookId && unitId && unitId === initialUnitId ? initialLookId : null,
        message,
      }),
    onSuccess: (visit) => setRequested(visit as StayVisit),
    // A 401 shows as the "session ended" card, not as a message.
    onError: (err: unknown) => {
      if (!isSignInError(err)) setError(visitRefusal(err));
    },
  });
  const sessionEnded = isSignInError(mutation.error);

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
      className="flex min-w-0 flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        if (!activeDay || !slotId) {
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

      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-text">
          <CalendarClock className="size-3.5 text-text-secondary" aria-hidden />
          Pick a day
        </legend>
        <VisitCalendar
          openDays={openDays}
          value={activeDay}
          onChange={(value) => {
            setDay(value);
            setSlotId(null);
            setError(null);
          }}
        />
      </fieldset>

      {chosenDay ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-xs font-bold text-text">
            Pick a time · <span className="font-semibold text-text-secondary">{visitDayLabel(chosenDay.date)}</span>
          </legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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

      {session.isAnonymous || sessionEnded ? (
        <SignInCard
          title="Sign in to request a visit"
          message="The host confirms the time with you. Your chosen day stays here while you sign in."
          expired={sessionEnded && !session.isAnonymous}
          onSignIn={() => mutation.reset()}
        />
      ) : (
        <Button
          type="submit"
          loading={mutation.isPending}
          loadingLabel="Requesting visit…"
          className="w-full py-3 text-sm font-bold"
        >
          Request visit
        </Button>
      )}
    </form>
  );
}

const WEEK = ["M", "T", "W", "T", "F", "S", "S"];

function isoOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Two weeks as a small calendar: days the owner takes visits are tappable,
 * the rest are greyed out. Fits the panel at any width; nothing scrolls sideways.
 */
function VisitCalendar({
  openDays,
  value,
  onChange,
}: {
  openDays: Set<string>;
  value: string | null;
  onChange: (value: string) => void;
}) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const todayIso = isoOf(today);
  // Start on this week's Monday; show enough weeks to cover the next 14 days.
  const start = new Date(today);
  start.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const cells = Array.from({ length: 21 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const last = new Date(today);
  last.setDate(today.getDate() + 14);
  const weeks = [0, 1, 2]
    .map((w) => cells.slice(w * 7, w * 7 + 7))
    .filter((week) => week.some((d) => d >= today && d <= last));
  const month = today.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  return (
    <div className="rounded-control border border-line bg-surface p-3">
      <p className="mb-2 text-xs font-bold text-text">{month}</p>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEK.map((letter, i) => (
          <span key={i} className="pb-1 text-[11px] font-semibold text-text-muted">
            {letter}
          </span>
        ))}
        {weeks.flat().map((d) => {
          const iso = isoOf(d);
          const open = openDays.has(iso);
          const selected = value === iso;
          const isToday = iso === todayIso;
          const newMonth = d.getDate() === 1;
          return (
            <button
              key={iso}
              type="button"
              disabled={!open}
              aria-pressed={selected}
              aria-label={`${d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}${open ? "" : ", no visits"}`}
              onClick={() => onChange(iso)}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-full text-sm font-bold transition ${
                selected
                  ? "bg-action text-action-text shadow-sm"
                  : open
                    ? "text-text hover:bg-action-surface"
                    : "cursor-not-allowed text-text-muted/50"
              }`}
            >
              {newMonth ? (
                <span className="absolute -top-1 text-[9px] font-semibold uppercase">
                  {d.toLocaleDateString("en-IN", { month: "short" })}
                </span>
              ) : null}
              {d.getDate()}
              {open && !selected ? <span aria-hidden className="absolute bottom-1 size-1 rounded-full bg-action" /> : null}
              {isToday && !selected ? (
                <span aria-hidden className="absolute inset-0 rounded-full ring-1 ring-line-strong" />
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-text-secondary">
        <span aria-hidden className="size-1.5 rounded-full bg-action" /> Owner takes visits that day
      </p>
    </div>
  );
}
