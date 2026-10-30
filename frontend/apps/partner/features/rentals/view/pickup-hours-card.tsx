"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import { Button, Card, Dialog, Input, Spinner, cn, useT, useToast } from "@vsolve/ui";
import { Clock, Copy, X } from "lucide-react";
import { useEffect, useState } from "react";

import { TimePicker } from "@/components/time-picker";
import {
  fetchPartnerPickupHours,
  savePartnerPickupHours,
  type PickupHours,
} from "@/features/rentals/queries";

/** Catalogue keys, Monday first — resolved with `t` at render time. */
const DAY_NAMES = [
  "rentals.day.monday",
  "rentals.day.tuesday",
  "rentals.day.wednesday",
  "rentals.day.thursday",
  "rentals.day.friday",
  "rentals.day.saturday",
  "rentals.day.sunday",
];
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
export function rowsProblem(rows: DayRow[], t: ReturnType<typeof useT>): string | null {
  if (!rows.some((r) => r.open)) return t("rentals.hours.errorNoDay");
  const bad = rows.find((r) => r.open && r.closesAt <= r.opensAt);
  return bad ? t("rentals.hours.errorCloseBeforeOpen", { day: t(DAY_NAMES[bad.weekday]!) }) : null;
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
export function hoursOpenText(opensAt: string, closesAt: string, t: ReturnType<typeof useT>): string {
  const [oh = 0, om = 0] = opensAt.split(":").map(Number);
  const [ch = 0, cm = 0] = closesAt.split(":").map(Number);
  const minutes = ch * 60 + cm - (oh * 60 + om);
  if (minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? t("rentals.hours.hr", { h }) : "", m ? t("rentals.hours.min", { m }) : ""].filter(Boolean).join(" ");
}

/**
 * The owner's pickup hours: which days they are open, the hours for each day, and the
 * days off on top of that.
 *
 * Rendered as a compact summary banner on the rental workspace. Clicking "Edit hours"
 * opens the full schedule editor in a focused modal Dialog.
 */
export function PickupHoursCard({ className }: { className?: string }) {
  const t = useT();
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
      notify(t("rentals.hours.saved"), "success");
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
                <h2 className="text-sm font-bold text-navy-900">{t("rentals.hours.title")}</h2>
                {hours.isPending ? (
                  <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <Spinner size="sm" />
                    {t("common.loading")}
                  </span>
                ) : isSet ? (
                  <span className="inline-flex items-center rounded-full bg-selected-surface px-2.5 py-0.5 text-xs font-semibold text-navy-900">
                    {summaryText}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-warning-surface px-2.5 py-0.5 text-xs font-bold text-warning-text">
                    {t("rentals.hours.notSet")}
                  </span>
                )}
                {closedCount > 0 ? (
                  <span className="text-xs text-text-secondary">
                    · {t("rentals.hours.daysOff", { count: closedCount })}
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-xs text-text-secondary">
                {isSet
                  ? t("rentals.hours.summarySet")
                  : t("rentals.hours.summaryNotSet")}
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
            {isSet ? t("rentals.hours.edit") : t("rentals.hours.set")}
          </Button>
        </div>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) setError(null);
          setOpen(next);
        }}
        title={t("rentals.hours.title")}
        description={t("rentals.hours.dialogDescription")}
        className="max-w-2xl"
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            {summaryText ? (
              <p className="hidden text-xs text-text-secondary sm:inline">{t("rentals.hours.current", { summary: summaryText })}</p>
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
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                size="sm"
                loading={save.isPending}
                loadingLabel={t("rentals.common.saving")}
                onClick={() => {
                  const problem = rowsProblem(rows, t);
                  if (problem) return setError(problem);
                  save.mutate();
                }}
              >
                {t("rentals.hours.save")}
              </Button>
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-4 py-1">
          <ul className="flex flex-col divide-y divide-line overflow-visible rounded-card border border-line bg-surface">
            {rows.map((row) => {
              const name = t(DAY_NAMES[row.weekday]!);
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
                        label={t("rentals.hours.opens", { day: name })}
                        value={row.opensAt}
                        minutes={HALF_HOURS}
                        onChange={(value) => patch(row.weekday, { opensAt: value })}
                      />
                      <span aria-hidden className="text-text-muted">
                        –
                      </span>
                      <TimePicker
                        label={t("rentals.hours.closes", { day: name })}
                        value={row.closesAt}
                        minutes={HALF_HOURS}
                        onChange={(value) => patch(row.weekday, { closesAt: value })}
                      />
                      <span className="hidden text-xs text-text-muted sm:inline">
                        {hoursOpenText(row.opensAt, row.closesAt, t)}
                      </span>
                      <button
                        type="button"
                        aria-label={t("rentals.hours.copyDay", { day: name })}
                        title={t("rentals.hours.copyToAll")}
                        onClick={() => copyToAll(row)}
                        className="inline-flex size-9 items-center justify-center rounded-full text-text-secondary hover:bg-selected-surface hover:text-navy-900"
                      >
                        <Copy className="size-4" />
                      </button>
                    </div>
                  ) : (
                    <p className="flex-1 text-sm text-text-muted">{t("rentals.hours.closed")}</p>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="-mt-2 text-xs text-text-secondary">
            {(() => {
              const [before, after = ""] = t("rentals.hours.tickHint").split("{icon}");
              return (
                <>
                  {before}
                  <Copy className="inline size-3" aria-hidden />
                  {after}
                </>
              );
            })()}
          </p>

          <div className="flex flex-col gap-2 pt-2">
            <p className="text-sm font-semibold text-navy-900">{t("rentals.hours.daysOffTitle")}</p>
            <p className="text-xs text-text-secondary">
              {t("rentals.hours.daysOffHint")}
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
                    aria-label={t("rentals.hours.removeDay", { date: closedDateLabel(day) })}
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
                aria-label={t("rentals.hours.addDayOffAria")}
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
                {t("rentals.hours.addDayOff")}
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
