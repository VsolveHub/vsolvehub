"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import { Button, Card, Select, Spinner, cn, useToast } from "@vsolve/ui";
import { Clock } from "lucide-react";
import { useEffect, useState } from "react";

import {
  fetchPartnerPickupHours,
  savePartnerPickupHours,
  type PickupHours,
} from "@/features/rentals/queries";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
/** The form starts here for an owner who hasn't saved hours yet. */
const DEFAULT_OPEN = "09:00";
const DEFAULT_CLOSE = "21:00";

/** 30-minute steps, 5 AM to 11:30 PM. */
export const TIME_CHOICES: string[] = Array.from({ length: 38 }, (_, i) => {
  const minutes = 5 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

export function timeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (h === undefined || m === undefined) return hhmm;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour} ${suffix}` : `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

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

/**
 * The owner's pickup hours: which days they are open, and the hours for each day.
 *
 * There are no time slots. Customers pick dates and come any time inside that day's hours, so
 * a Saturday can run 9 AM to 9 PM and a Sunday 9 AM to 6 PM. New items can't go live until
 * these are saved.
 */
export function PickupHoursCard({ className }: { className?: string }) {
  const qc = useQueryClient();
  const { notify } = useToast();
  const hours = useQuery({ queryKey: ["partner-rentals", "pickup-hours"], queryFn: fetchPartnerPickupHours });
  const [rows, setRows] = useState<DayRow[]>(() => rowsFrom(undefined));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hours.data) setRows(rowsFrom(hours.data));
  }, [hours.data]);

  const save = useMutation({
    mutationFn: () =>
      savePartnerPickupHours(
        rows
          .filter((r) => r.open)
          .map((r) => ({ weekday: r.weekday, opens_at: r.opensAt, closes_at: r.closesAt })),
      ),
    onSuccess: (data) => {
      qc.setQueryData(["partner-rentals", "pickup-hours"], data);
      void qc.invalidateQueries({ queryKey: ["partner-rentals", "assets"] });
      notify("Pickup hours saved.", "success");
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

  return (
    <Card padding="lg" className={cn("flex flex-col gap-4", className)} id="pickup-hours">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-navy-900">
            <Clock className="size-5 text-action" aria-hidden />
            Pickup hours
          </h2>
          <p className="mt-0.5 text-sm text-text-secondary">
            When customers can collect and return items. They come any time inside these hours —
            no time slots. Used for all your rental items.
          </p>
        </div>
        {hours.data?.is_set ? null : (
          <span className="shrink-0 rounded-full bg-warning-surface px-2.5 py-1 text-xs font-bold text-warning-text">
            Not set
          </span>
        )}
      </div>

      {hours.isPending ? (
        <p className="flex items-center gap-2 text-sm text-text-secondary">
          <Spinner size="sm" />
          Loading your hours…
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line/70">
          {rows.map((row) => (
            <li key={row.weekday} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
              <label className="flex w-36 items-center gap-2 text-sm font-semibold text-navy-900">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-action)]"
                  checked={row.open}
                  onChange={(e) => patch(row.weekday, { open: e.target.checked })}
                />
                {DAY_NAMES[row.weekday]}
              </label>
              {row.open ? (
                <div className="flex items-center gap-2">
                  <Select
                    aria-label={`${DAY_NAMES[row.weekday]} opens`}
                    value={row.opensAt}
                    onChange={(e) => patch(row.weekday, { opensAt: e.target.value })}
                  >
                    {TIME_CHOICES.map((t) => (
                      <option key={t} value={t}>
                        {timeLabel(t)}
                      </option>
                    ))}
                  </Select>
                  <span className="text-sm text-text-secondary">to</span>
                  <Select
                    aria-label={`${DAY_NAMES[row.weekday]} closes`}
                    value={row.closesAt}
                    onChange={(e) => patch(row.weekday, { closesAt: e.target.value })}
                  >
                    {TIME_CHOICES.map((t) => (
                      <option key={t} value={t}>
                        {timeLabel(t)}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : (
                <span className="text-sm text-text-muted">Closed</span>
              )}
              <button
                type="button"
                className="ml-auto text-xs font-semibold text-action hover:underline"
                onClick={() => copyToAll(row)}
              >
                Copy to all days
              </button>
            </li>
          ))}
        </ul>
      )}

      {hours.error ? <p className="text-sm text-danger-text">{friendlyErrorMessage(hours.error)}</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={save.isPending || hours.isPending}
          onClick={() => {
            const problem = rowsProblem(rows);
            if (problem) return setError(problem);
            save.mutate();
          }}
        >
          {save.isPending ? "Saving…" : "Save pickup hours"}
        </Button>
        {hours.data?.summary ? (
          <p className="text-sm text-text-secondary">Now: {hours.data.summary}</p>
        ) : null}
      </div>
    </Card>
  );
}
