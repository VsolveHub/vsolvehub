"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import { Button, Card, Dialog, Input, Spinner, cn, useToast } from "@vsolve/ui";
import { Clock, Copy, X } from "lucide-react";
import { useEffect, useState } from "react";

import { TimePicker } from "@/components/time-picker";
import {
  fetchPartnerPickupHours,
  savePartnerPickupHours,
  type PickupHours,
} from "@/features/rentals/queries";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
/** The form starts here for an owner who hasn't saved hours yet. */
const DEFAULT_OPEN = "09:00";
const DEFAULT_CLOSE = "21:00";
/** The server accepts only the hour and the half hour. */
const HALF_HOURS = [0, 30] as const;

export type DayRow = { weekday: number; open: boolean; opensAt: string; closesAt: string };

export function rowsFrom(hours: PickupHours | undefined): DayRow[] {
  return DAY_NAMES.map((_, weekday) => {
    const day = hours?.days.find((d) => d.weekday === weekday);
    if (!hours?.is_set) {
      return { weekday, open: true, opensAt: DEFAULT_OPEN, closesAt: DEFAULT_CLOSE };
    }
    return {
      weekday,
      open: Boolean(day?.is_open),
      opensAt: day?.opens_at ?? DEFAULT_OPEN,
      closesAt: day?.closes_at ?? DEFAULT_CLOSE,
    };
  });
}

/** Why these rows can't be saved, or null. */
export function rowsProblem(rows: DayRow[]): string | null {
  if (!rows.some((r) => r.open)) return "Open at least one day.";
  const bad = rows.find((r) => r.open && r.closesAt <= r.opensAt);
  return bad ? `On ${DAY_NAMES[bad.weekday]}, closing time must be after opening time.` : null;
}

/** Today in the owner's own calendar, as `YYYY-MM-DD` — the earliest day worth closing. */
export function todayIso(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Adds a closed date, kept sorted and without repeats. Past dates are not worth adding. */
export function withClosedDate(dates: string[], added: string, today: string): string[] {
  if (!added || added < today) return dates;
  return [...new Set([...dates, added])].sort();
}

/** "Sat 25 Oct". Read as a calendar date, never shifted by the browser's time zone. */
export function closedDateLabel(iso: string): string {
  const [y = 0, m = 1, d = 1] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** "12 hr", "9 hr 30 min". */
export function hoursOpenText(opensAt: string, closesAt: string): string {
  const [oh = 0, om = 0] = opensAt.split(":").map(Number);
  const [ch = 0, cm = 0] = closesAt.split(":").map(Number);
  const minutes = ch * 60 + cm - (oh * 60 + om);
  if (minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h} hr` : "", m ? `${m} min` : ""].filter(Boolean).join(" ");
}

/**
 * The owner's pickup hours: which days they are open, the hours for each day, and the
 * days off on top of that.
 *
 * Rendered as a compact summary banner on the rental workspace. Clicking "Edit hours"
 * opens the full schedule editor in a focused modal Dialog.
 */
export function PickupHoursCard({ className }: { className?: string }) {
  const qc = useQueryClient();
  const { notify } = useToast();
  const hours = useQuery({ queryKey: ["partner-rentals", "pickup-hours"], queryFn: fetchPartnerPickupHours });
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<DayRow[]>(() => rowsFrom(undefined));
  const [closedDates, setClosedDates] = useState<string[]>([]);
  const [newClosedDate, setNewClosedDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const today = todayIso();

  useEffect(() => {
    if (!hours.data) return;
    setRows(rowsFrom(hours.data));
    setClosedDates(hours.data.closed_dates ?? []);
  }, [hours.data]);

  const save = useMutation({
    mutationFn: () =>
      savePartnerPickupHours(
        rows
          .filter((r) => r.open)
          .map((r) => ({ weekday: r.weekday, opens_at: r.opensAt, closes_at: r.closesAt })),
        closedDates,
      ),
    onSuccess: (data) => {
      qc.setQueryData(["partner-rentals", "pickup-hours"], data);
      void qc.invalidateQueries({ queryKey: ["partner-rentals", "assets"] });
      notify("Pickup hours saved.", "success");
      setOpen(false);
    },
    onError: (err) => setError(friendlyErrorMessage(err)),
  });

  function patch(weekday: number, change: Partial<DayRow>) {
    setError(null);
    setRows((current) => current.map((r) => (r.weekday === weekday ? { ...r, ...change } : r)));
  }

  function copyToAll(from: DayRow) {
    setError(null);
    setRows((current) =>
      current.map((r) => ({ ...r, open: from.open, opensAt: from.opensAt, closesAt: from.closesAt })),
    );
  }

  const isSet = Boolean(hours.data?.is_set);
  const summaryText = hours.data?.summary || "";
  const closedCount = closedDates.length;

  return (
    <>
      <Card padding="md" className={cn("border-line/80 bg-surface", className)} id="pickup-hours">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-action/10 text-action">
              <Clock className="size-5" aria-hidden />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-bold text-navy-900">Pickup hours</h2>
                {hours.isPending ? (
                  <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <Spinner size="sm" />
                    Loading…
                  </span>
                ) : isSet ? (
                  <span className="inline-flex items-center rounded-full bg-selected-surface px-2.5 py-0.5 text-xs font-semibold text-navy-900">
                    {summaryText}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-warning-surface px-2.5 py-0.5 text-xs font-bold text-warning-text">
                    Not set
                  </span>
                )}
                {closedCount > 0 ? (
                  <span className="text-xs text-text-secondary">
                    · {closedCount} {closedCount === 1 ? "day off" : "days off"}
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-xs text-text-secondary">
                {isSet
                  ? "When customers can collect and return items. Click to update days, times, or days off."
                  : "Customers collect and return items inside these hours. Set hours to activate your ads."}
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant={isSet ? "outline" : "primary"}
            size="sm"
            onClick={() => {
              setError(null);
              if (hours.data) {
                setRows(rowsFrom(hours.data));
                setClosedDates(hours.data.closed_dates ?? []);
              }
              setOpen(true);
            }}
            className="shrink-0 self-start sm:self-center"
          >
            <Clock className="size-4" aria-hidden />
            {isSet ? "Edit pickup hours" : "Set pickup hours"}
          </Button>
        </div>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) setError(null);
          setOpen(next);
        }}
        title="Pickup hours"
        description="When customers can collect and return items. They come any time inside these hours — no time slots. Used for all your rental items."
        className="max-w-2xl"
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            {summaryText ? (
              <p className="hidden text-xs text-text-secondary sm:inline">Current: {summaryText}</p>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={save.isPending}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                loading={save.isPending}
                loadingLabel="Saving…"
                onClick={() => {
                  const problem = rowsProblem(rows);
                  if (problem) return setError(problem);
                  save.mutate();
                }}
              >
                Save pickup hours
              </Button>
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-4 py-1">
          <ul className="flex flex-col divide-y divide-line overflow-visible rounded-card border border-line bg-surface">
            {rows.map((row) => {
              const name = DAY_NAMES[row.weekday]!;
              return (
                <li
                  key={row.weekday}
                  className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:px-4"
                >
                  <label className="flex w-36 shrink-0 cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={row.open}
                      onChange={(e) => patch(row.weekday, { open: e.target.checked })}
                      className="size-4 accent-[var(--color-navy-900)]"
                    />
                    <span className={`text-sm font-bold ${row.open ? "text-navy-900" : "text-text-muted"}`}>
                      {name}
                    </span>
                  </label>

                  {row.open ? (
                    <div className="flex flex-1 flex-wrap items-center gap-2">
                      <TimePicker
                        label={`${name} opens`}
                        value={row.opensAt}
                        minutes={HALF_HOURS}
                        onChange={(value) => patch(row.weekday, { opensAt: value })}
                      />
                      <span aria-hidden className="text-text-muted">
                        –
                      </span>
                      <TimePicker
                        label={`${name} closes`}
                        value={row.closesAt}
                        minutes={HALF_HOURS}
                        onChange={(value) => patch(row.weekday, { closesAt: value })}
                      />
                      <span className="hidden text-xs text-text-muted sm:inline">
                        {hoursOpenText(row.opensAt, row.closesAt)}
                      </span>
                      <button
                        type="button"
                        aria-label={`Copy ${name} hours to all days`}
                        title="Copy to all days"
                        onClick={() => copyToAll(row)}
                        className="inline-flex size-9 items-center justify-center rounded-full text-text-secondary hover:bg-selected-surface hover:text-navy-900"
                      >
                        <Copy className="size-4" />
                      </button>
                    </div>
                  ) : (
                    <p className="flex-1 text-sm text-text-muted">Closed</p>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="-mt-2 text-xs text-text-secondary">
            Tick a day to open it. <Copy className="inline size-3" aria-hidden /> copies that
            day&apos;s hours to every day.
          </p>

          <div className="flex flex-col gap-2 pt-2">
            <p className="text-sm font-semibold text-navy-900">Days off</p>
            <p className="text-xs text-text-secondary">
              No pickups or returns on these dates, whatever the weekly hours say. An item already
              out with a customer can stay out across them.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {closedDates.map((day) => (
                <span
                  key={day}
                  className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold"
                >
                  {closedDateLabel(day)}
                  <button
                    type="button"
                    aria-label={`Remove ${closedDateLabel(day)}`}
                    onClick={() => {
                      setError(null);
                      setClosedDates((current) => current.filter((d) => d !== day));
                    }}
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
              <Input
                type="date"
                aria-label="Add a day off"
                min={today}
                value={newClosedDate}
                onChange={(event) => setNewClosedDate(event.target.value)}
                className="w-40"
              />
              <Button
                size="sm"
                variant="ghost"
                disabled={!newClosedDate || newClosedDate < today}
                onClick={() => {
                  setError(null);
                  setClosedDates((current) => withClosedDate(current, newClosedDate, today));
                  setNewClosedDate("");
                }}
              >
                Add day off
              </Button>
            </div>
          </div>

          {hours.error ? (
            <p className="text-sm text-danger-text">{friendlyErrorMessage(hours.error)}</p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-danger-text">
              {error}
            </p>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}
