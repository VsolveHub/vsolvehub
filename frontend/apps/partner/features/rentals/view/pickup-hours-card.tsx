"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import { Button, Card, Dialog, Field, Select, useToast } from "@vsolve/ui";
import { Clock, Pencil } from "lucide-react";
import { useState } from "react";

import {
  fetchRentalPickupHours,
  saveRentalPickupHours,
  type RentalPickupHours,
} from "@/features/rentals/queries";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const NOTICE_OPTIONS: Array<{ minutes: number; label: string }> = [
  { minutes: 0, label: "Any time (no notice)" },
  { minutes: 60, label: "1 hour before" },
  { minutes: 120, label: "2 hours before" },
  { minutes: 240, label: "4 hours before" },
  { minutes: 720, label: "12 hours before" },
  { minutes: 1440, label: "1 day before" },
  { minutes: 2880, label: "2 days before" },
];

const ADVANCE_OPTIONS = [7, 14, 30, 60, 90, 180];

/** 05:00 … 23:30 in half hours. */
const CLOCKS = Array.from({ length: 38 }, (_, i) => {
  const minutes = 5 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

function clockLabel(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

function noticeText(minutes: number): string {
  return NOTICE_OPTIONS.find((o) => o.minutes === minutes)?.label ?? `${minutes} minutes before`;
}

/**
 * The partner's pickup and return schedule, shown on the rentals page.
 *
 * One schedule for every item: customers can only choose pickup and return
 * times inside it, and must book at least the notice period ahead.
 */
export function PickupHoursCard() {
  const hours = useQuery({ queryKey: ["partner-rentals", "pickup-hours"], queryFn: fetchRentalPickupHours });
  const [editing, setEditing] = useState(false);

  return (
    <Card padding="none" className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-navy-50 text-navy-700">
          <Clock className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-navy-900">Pickup &amp; return hours</p>
          {hours.data ? (
            <p className="text-sm text-text-secondary">
              {hours.data.summary} · Book {noticeText(hours.data.min_notice_minutes).toLowerCase()} · Up to{" "}
              {hours.data.max_advance_days} days ahead
            </p>
          ) : (
            <p className="text-sm text-text-muted">{hours.isLoading ? "Loading…" : "Could not load your hours."}</p>
          )}
        </div>
      </div>
      <Button size="sm" variant="outline" disabled={!hours.data} onClick={() => setEditing(true)}>
        <Pencil className="size-4" />
        Edit hours
      </Button>
      {editing && hours.data ? <HoursDialog current={hours.data} onClose={() => setEditing(false)} /> : null}
    </Card>
  );
}

function HoursDialog({ current, onClose }: { current: RentalPickupHours; onClose: () => void }) {
  const qc = useQueryClient();
  const { notify } = useToast();
  const [days, setDays] = useState<number[]>(current.open_days);
  const [opensAt, setOpensAt] = useState(current.opens_at.slice(0, 5));
  const [closesAt, setClosesAt] = useState(current.closes_at.slice(0, 5));
  const [notice, setNotice] = useState(current.min_notice_minutes);
  const [advance, setAdvance] = useState(current.max_advance_days);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      saveRentalPickupHours({
        open_days: days,
        opens_at: opensAt,
        closes_at: closesAt,
        min_notice_minutes: notice,
        max_advance_days: advance,
      }),
    onSuccess: (data) => {
      qc.setQueryData(["partner-rentals", "pickup-hours"], data);
      notify("Pickup hours saved. New bookings follow them.", "success");
      onClose();
    },
    onError: (err: unknown) => setError(friendlyErrorMessage(err)),
  });

  function submit() {
    if (days.length === 0) return setError("Choose at least one day.");
    if (closesAt <= opensAt) return setError("Closing time must be after opening time.");
    setError(null);
    save.mutate();
  }

  const clockOptions = (list: string[]) =>
    list.map((c) => (
      <option key={c} value={c}>
        {clockLabel(c)}
      </option>
    ));
  const withCurrent = (value: string) => (CLOCKS.includes(value) ? CLOCKS : [value, ...CLOCKS]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose();
      }}
      title="Pickup & return hours"
      description="Customers choose pickup and return times inside these hours, for all your items."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save hours"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 py-2">
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold text-text">Open days</legend>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((name, index) => {
              const on = days.includes(index);
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setDays((cur) => (on ? cur.filter((d) => d !== index) : [...cur, index].sort((a, b) => a - b)))
                  }
                  className={
                    on
                      ? "min-w-12 rounded-full bg-navy-900 px-3 py-1.5 text-sm font-semibold text-white"
                      : "min-w-12 rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-text-secondary hover:border-navy-700"
                  }
                >
                  {name}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Opens at">
            <Select id="hours-opens" value={opensAt} onChange={(e) => setOpensAt(e.target.value)}>
              {clockOptions(withCurrent(opensAt))}
            </Select>
          </Field>
          <Field label="Closes at">
            <Select id="hours-closes" value={closesAt} onChange={(e) => setClosesAt(e.target.value)}>
              {clockOptions(withCurrent(closesAt))}
            </Select>
          </Field>
        </div>

        <Field label="Customers must book at least" description="Gives you time to get the item ready.">
          <Select id="hours-notice" value={String(notice)} onChange={(e) => setNotice(Number(e.target.value))}>
            {NOTICE_OPTIONS.map((o) => (
              <option key={o.minutes} value={o.minutes}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Customers can book up to">
          <Select id="hours-advance" value={String(advance)} onChange={(e) => setAdvance(Number(e.target.value))}>
            {ADVANCE_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d} days ahead
              </option>
            ))}
          </Select>
        </Field>

        {error ? (
          <p role="alert" className="rounded-control bg-danger-surface px-3 py-2 text-sm text-danger-text">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
