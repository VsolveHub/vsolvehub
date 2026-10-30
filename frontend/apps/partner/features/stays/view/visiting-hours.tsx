"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import { Button, Input, useT } from "@vsolve/ui";
import { Copy, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";

import { TimePicker, clockText } from "@/components/time-picker";

import {
  WEEKDAY_NAMES,
  WEEKDAY_NAME_KEYS,
  clockWindow,
  dayLabel,
  setPartnerVisitingHours,
  type StayProperty,
  type VisitSlotInput,
} from "@/features/stays/queries";

type SlotRow = { key: string; weekday: number; start: string; end: string };
type Translate = ReturnType<typeof useT>;

const hhmm = (value: string) => value.slice(0, 5);
let nextKey = 0;
const newKey = () => `slot-${(nextKey += 1)}`;

/** Same-day slots that overlap, as "Saturday 10 AM – 11 AM and 10:30 AM – 11:30 AM". */
function findOverlap(rows: SlotRow[], t: Translate): string | null {
  const sorted = [...rows].sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start));
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (prev.weekday === cur.weekday && cur.start < prev.end) {
      return t("stays.visitingHours.overlap", {
        day: t(WEEKDAY_NAME_KEYS[cur.weekday]!),
        first: clockWindow(prev.start, prev.end),
        second: clockWindow(cur.start, cur.end),
      });
    }
  }
  return null;
}

/**
 * The owner's weekly visiting hours for one property. Guests pick one of these slots when they
 * "Schedule a visit"; several guests may pick the same slot. Slots on the same day can't overlap.
 */
export function VisitingHours({ property }: { property: StayProperty }) {
  const t = useT();
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(property.visits_enabled ?? true);
  const [rows, setRows] = useState<SlotRow[]>(() =>
    (property.visit_slots ?? []).map((slot) => ({
      key: slot.id,
      weekday: slot.weekday,
      start: hhmm(slot.start_time),
      end: hhmm(slot.end_time),
    })),
  );
  const [blocked, setBlocked] = useState<string[]>(property.visit_blocked_dates ?? []);
  const [newBlocked, setNewBlocked] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      setPartnerVisitingHours(property.id, {
        visits_enabled: enabled,
        slots: rows.map<VisitSlotInput>((row) => ({
          weekday: row.weekday,
          start_time: row.start,
          end_time: row.end,
        })),
        blocked_dates: blocked,
      }),
    onSuccess: () => {
      setSaved(true);
      setError(null);
      void qc.invalidateQueries({ queryKey: ["partner-stays"] });
    },
    onError: (err: unknown) => setError(friendlyErrorMessage(err)),
  });

  function change(key: string, patch: Partial<SlotRow>) {
    setSaved(false);
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addSlot(weekday: number) {
    setSaved(false);
    const sameDay = rows.filter((row) => row.weekday === weekday).sort((a, b) => a.end.localeCompare(b.end));
    const after = sameDay.at(-1)?.end ?? "10:00";
    const [h = 10, m = 0] = after.split(":").map(Number);
    const endHour = Math.min(h + 1, 23);
    setRows((current) => [
      ...current,
      {
        key: newKey(),
        weekday,
        start: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
        end: `${String(endHour).padStart(2, "0")}:${String(endHour === 23 ? 59 : m).padStart(2, "0")}`,
      },
    ]);
  }

  function clearDay(weekday: number) {
    setSaved(false);
    setRows((current) => current.filter((row) => row.weekday !== weekday));
  }

  function copyToAllDays(weekday: number) {
    setSaved(false);
    const template = rows.filter((row) => row.weekday === weekday);
    setRows([
      ...template,
      ...WEEKDAY_NAMES.flatMap((_, day) =>
        day === weekday ? [] : template.map((row) => ({ ...row, key: newKey(), weekday: day })),
      ),
    ]);
  }

  function onSave() {
    const bad = rows.find((row) => !row.start || !row.end || row.end <= row.start);
    if (bad) {
      return setError(
        t("stays.visitingHours.endBeforeStart", { day: t(WEEKDAY_NAME_KEYS[bad.weekday]!) }),
      );
    }
    const overlap = findOverlap(rows, t);
    if (overlap) return setError(overlap);
    if (enabled && rows.length === 0) return setError(t("stays.visitingHours.needSlot"));
    setError(null);
    save.mutate();
  }

  return (
    <section className="flex flex-col gap-4 rounded-card border border-line bg-surface-sunken p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-navy-900">{t("stays.visitingHours.heading")}</h3>
          <p className="text-xs text-text-secondary">
            {t("stays.visitingHours.intro")}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => {
            setSaved(false);
            setEnabled((on) => !on);
          }}
          className={`inline-flex h-9 items-center gap-2 rounded-full border px-1 pr-3 text-xs font-bold ${
            enabled ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-line bg-surface text-text-secondary"
          }`}
        >
          <span aria-hidden className={`size-7 rounded-full ${enabled ? "bg-emerald-500" : "bg-white ring-1 ring-line"}`} />
          {enabled ? t("stays.visitingHours.on") : t("stays.visitingHours.off")}
        </button>
      </div>

      <ul className="flex flex-col divide-y divide-line overflow-visible rounded-card border border-line bg-surface">
        {WEEKDAY_NAMES.map((dayKey, weekday) => {
          const name = t(WEEKDAY_NAME_KEYS[weekday]!);
          const daySlots = rows
            .filter((row) => row.weekday === weekday)
            .sort((a, b) => a.start.localeCompare(b.start));
          const open = daySlots.length > 0;
          return (
            <li key={dayKey} className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-start sm:px-4">
              <label className="flex w-36 shrink-0 cursor-pointer items-center gap-2.5 pt-2">
                <input
                  type="checkbox"
                  checked={open}
                  onChange={() => (open ? clearDay(weekday) : addSlot(weekday))}
                  className="size-4 accent-[var(--color-navy-900)]"
                />
                <span className={`text-sm font-bold ${open ? "text-navy-900" : "text-text-muted"}`}>{name}</span>
              </label>

              <div className="flex flex-1 flex-col gap-2">
                {!open ? <p className="pt-2.5 text-sm text-text-muted">{t("stays.visitingHours.unavailable")}</p> : null}
                {daySlots.map((row, index) => (
                  <div key={row.key} className="flex flex-wrap items-center gap-2">
                    <TimePicker
                      label={t("stays.visitingHours.startLabel", { day: name })}
                      value={row.start}
                      onChange={(value) => change(row.key, { start: value })}
                    />
                    <span aria-hidden className="text-text-muted">–</span>
                    <TimePicker
                      label={t("stays.visitingHours.endLabel", { day: name })}
                      value={row.end}
                      onChange={(value) => change(row.key, { end: value })}
                    />
                    <span className="hidden text-xs text-text-muted sm:inline">{durationText(row.start, row.end, t)}</span>
                    <button
                      type="button"
                      aria-label={t("stays.visitingHours.removeSlot", { day: name, time: clockText(row.start, t) })}
                      title={t("common.remove")}
                      onClick={() => {
                        setSaved(false);
                        setRows((current) => current.filter((r) => r.key !== row.key));
                      }}
                      className="inline-flex size-9 items-center justify-center rounded-full text-text-secondary hover:bg-danger-surface hover:text-danger-text"
                    >
                      <Trash2 className="size-4" />
                    </button>
                    {index === 0 ? (
                      <>
                        <button
                          type="button"
                          aria-label={t("stays.visitingHours.addSlotAria", { day: name })}
                          title={t("stays.visitingHours.addSlotTitle")}
                          onClick={() => addSlot(weekday)}
                          className="inline-flex size-9 items-center justify-center rounded-full text-text-secondary hover:bg-selected-surface hover:text-navy-900"
                        >
                          <Plus className="size-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={t("stays.visitingHours.copyAria", { day: name })}
                          title={t("stays.visitingHours.copyTitle")}
                          onClick={() => copyToAllDays(weekday)}
                          className="inline-flex size-9 items-center justify-center rounded-full text-text-secondary hover:bg-selected-surface hover:text-navy-900"
                        >
                          <Copy className="size-4" />
                        </button>
                      </>
                    ) : null}
                  </div>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="-mt-2 text-xs text-text-secondary">
        {t("stays.visitingHours.hintTick")} <Plus className="inline size-3" aria-hidden />{" "}
        {t("stays.visitingHours.hintAdd")} <Copy className="inline size-3" aria-hidden />{" "}
        {t("stays.visitingHours.hintCopy")}
      </p>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-navy-900">{t("stays.visitingHours.daysOff")}</p>
        <p className="text-xs text-text-secondary">{t("stays.visitingHours.daysOffHint")}</p>
        <div className="flex flex-wrap items-center gap-2">
          {blocked.map((day) => (
            <span key={day} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold">
              {dayLabel(day)}
              <button
                type="button"
                aria-label={t("stays.visitingHours.removeDayOff", { day: dayLabel(day) })}
                onClick={() => {
                  setSaved(false);
                  setBlocked((current) => current.filter((d) => d !== day));
                }}
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))}
          <Input
            type="date"
            aria-label={t("stays.visitingHours.addDayOffAria")}
            value={newBlocked}
            onChange={(event) => setNewBlocked(event.target.value)}
            className="w-40"
          />
          <Button
            size="sm"
            variant="ghost"
            disabled={!newBlocked}
            onClick={() => {
              setSaved(false);
              setBlocked((current) => [...new Set([...current, newBlocked])].sort());
              setNewBlocked("");
            }}
          >
            {t("stays.visitingHours.addDayOff")}
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-danger-text">{error}</p> : null}
      {saved ? <p className="text-sm text-success-text">{t("stays.visitingHours.saved")}</p> : null}
      <div>
        <Button onClick={onSave} loading={save.isPending} loadingLabel={t("stays.visitingHours.saving")}>
          {t("stays.visitingHours.save")}
        </Button>
      </div>
    </section>
  );
}

/** "1 hr", "1 hr 30 min", "45 min". */
function durationText(start: string, end: string, t: Translate): string {
  const [sh = 0, sm = 0] = start.split(":").map(Number);
  const [eh = 0, em = 0] = end.split(":").map(Number);
  const minutes = eh * 60 + em - (sh * 60 + sm);
  if (minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? t("stays.visitingHours.hours", { n: h }) : "", m ? t("stays.visitingHours.minutes", { n: m }) : ""].filter(Boolean).join(" ");
}
