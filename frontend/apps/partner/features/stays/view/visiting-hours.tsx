"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import { Button, Input } from "@vsolve/ui";
import { Plus, X } from "lucide-react";
import { useState } from "react";

import {
  WEEKDAY_NAMES,
  clockWindow,
  dayLabel,
  setPartnerVisitingHours,
  type StayProperty,
  type VisitSlotInput,
} from "@/features/stays/queries";

type SlotRow = { key: string; weekday: number; start: string; end: string };

const hhmm = (value: string) => value.slice(0, 5);
let nextKey = 0;
const newKey = () => `slot-${(nextKey += 1)}`;

/** Same-day slots that overlap, as "Saturday 10 AM – 11 AM and 10:30 AM – 11:30 AM". */
function findOverlap(rows: SlotRow[]): string | null {
  const sorted = [...rows].sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start));
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (prev.weekday === cur.weekday && cur.start < prev.end) {
      return `${WEEKDAY_NAMES[cur.weekday]}: ${clockWindow(prev.start, prev.end)} overlaps ${clockWindow(cur.start, cur.end)}.`;
    }
  }
  return null;
}

/**
 * The owner's weekly visiting hours for one property. Guests pick one of these slots when they
 * "Schedule a visit"; several guests may pick the same slot. Slots on the same day can't overlap.
 */
export function VisitingHours({ property }: { property: StayProperty }) {
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
    if (bad) return setError(`${WEEKDAY_NAMES[bad.weekday]}: each slot must end after it starts.`);
    const overlap = findOverlap(rows);
    if (overlap) return setError(overlap);
    if (enabled && rows.length === 0) return setError("Add at least one visiting slot, or turn visits off.");
    setError(null);
    save.mutate();
  }

  return (
    <section className="flex flex-col gap-4 rounded-card border border-line bg-surface-sunken p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-navy-900">Visiting hours</h3>
          <p className="text-xs text-text-secondary">
            Guests choose one of these times for &ldquo;Schedule a visit&rdquo;. Several guests can
            pick the same time; you accept or decline each one.
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
          {enabled ? "Visits ON" : "Visits OFF"}
        </button>
      </div>

      <ul className="flex flex-col divide-y divide-line rounded-control border border-line bg-surface">
        {WEEKDAY_NAMES.map((name, weekday) => {
          const daySlots = rows
            .filter((row) => row.weekday === weekday)
            .sort((a, b) => a.start.localeCompare(b.start));
          return (
            <li key={name} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start">
              <p className="w-28 shrink-0 pt-1.5 text-sm font-semibold text-navy-900">{name}</p>
              <div className="flex flex-1 flex-col gap-2">
                {daySlots.length === 0 ? (
                  <p className="pt-1.5 text-xs text-text-secondary">No visits</p>
                ) : null}
                {daySlots.map((row) => (
                  <div key={row.key} className="flex flex-wrap items-center gap-2">
                    <Input
                      type="time"
                      aria-label={`${name} start`}
                      value={row.start}
                      onChange={(event) => change(row.key, { start: event.target.value })}
                      className="w-32"
                    />
                    <span className="text-xs text-text-secondary">to</span>
                    <Input
                      type="time"
                      aria-label={`${name} end`}
                      value={row.end}
                      onChange={(event) => change(row.key, { end: event.target.value })}
                      className="w-32"
                    />
                    <button
                      type="button"
                      aria-label="Remove slot"
                      onClick={() => {
                        setSaved(false);
                        setRows((current) => current.filter((r) => r.key !== row.key));
                      }}
                      className="inline-flex size-9 items-center justify-center rounded-control text-text-secondary hover:bg-surface-sunken hover:text-danger-text"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="ghost" onClick={() => addSlot(weekday)}>
                    <Plus className="size-4" aria-hidden />
                    Add slot
                  </Button>
                  {daySlots.length > 0 ? (
                    <Button size="sm" variant="ghost" onClick={() => copyToAllDays(weekday)}>
                      Copy to all days
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-navy-900">Days off</p>
        <p className="text-xs text-text-secondary">No visits on these dates, whatever the weekly hours say.</p>
        <div className="flex flex-wrap items-center gap-2">
          {blocked.map((day) => (
            <span key={day} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold">
              {dayLabel(day)}
              <button
                type="button"
                aria-label={`Remove ${dayLabel(day)}`}
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
            aria-label="Add a day off"
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
            Add day off
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-danger-text">{error}</p> : null}
      {saved ? <p className="text-sm text-success-text">Visiting hours saved.</p> : null}
      <div>
        <Button onClick={onSave} loading={save.isPending} loadingLabel="Saving…">
          Save visiting hours
        </Button>
      </div>
    </section>
  );
}
