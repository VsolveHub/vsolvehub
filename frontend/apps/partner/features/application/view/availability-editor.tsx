"use client";

import { Badge, Button } from "@vsolve/ui";
import { Plus, Trash2, X, Clock, Edit2 } from "lucide-react";
import { useMemo, useState } from "react";
import Link from "next/link";

import { WEEKDAYS, scheduleProblems, weeklyHours, type DraftPeriod, type PeriodProblem } from "../model/schedule";

const PROBLEM_MESSAGES: Record<PeriodProblem, string> = {
  ZERO_LENGTH: "Start and end are the same. Tick 'ends next day' for a full day.",
  ENDS_BEFORE_START: "This ends before it starts. Tick 'ends next day' if it runs overnight.",
  OVERLAPS_ANOTHER: "This overlaps another period on the same day.",
};

export interface ServiceAreaOption {
  id: string;
  label: string;
}

export interface AvailabilityEditorProps {
  areas: readonly ServiceAreaOption[];
  initialPeriods: readonly DraftPeriod[];
  onSave: (periods: readonly DraftPeriod[]) => void;
  isSaving?: boolean;
  saveError?: string | null;
}

type ModalShiftState = {
  weekday: number;
  weekdayLabel: string;
  startsAt: string;
  endsAt: string;
  endsNextDay: boolean;
  serviceAreaId: string;
  existingKey?: string;
} | null;

export function AvailabilityEditor({
  areas,
  initialPeriods,
  onSave,
  isSaving = false,
  saveError = null,
}: AvailabilityEditorProps) {
  const [periods, setPeriods] = useState<DraftPeriod[]>([...initialPeriods]);
  const [modalShift, setModalShift] = useState<ModalShiftState>(null);

  const problems = useMemo(() => scheduleProblems(periods), [periods]);
  const hours = weeklyHours(periods);
  const hasProblems = problems.size > 0;
  const hasChanges = JSON.stringify(periods) !== JSON.stringify(initialPeriods);

  function remove(key: string) {
    setPeriods((current) => current.filter((period) => period.key !== key));
  }

  function openNewShiftModal(weekday: number) {
    const areaId = areas[0]?.id ?? "";
    setModalShift({
      weekday,
      weekdayLabel: WEEKDAYS[weekday] ?? "Shift",
      startsAt: "09:00",
      endsAt: "18:00",
      endsNextDay: false,
      serviceAreaId: areaId,
    });
  }

  function openEditShiftModal(period: DraftPeriod) {
    setModalShift({
      weekday: period.weekday,
      weekdayLabel: WEEKDAYS[period.weekday] ?? "Shift",
      startsAt: period.startsAt,
      endsAt: period.endsAt,
      endsNextDay: period.endsNextDay,
      serviceAreaId: period.serviceAreaId,
      existingKey: period.key,
    });
  }

  function saveModalShift() {
    if (!modalShift) return;

    if (modalShift.existingKey) {
      setPeriods((current) =>
        current.map((p) =>
          p.key === modalShift.existingKey
            ? {
                ...p,
                startsAt: modalShift.startsAt,
                endsAt: modalShift.endsAt,
                endsNextDay: modalShift.endsNextDay,
                serviceAreaId: modalShift.serviceAreaId,
              }
            : p,
        ),
      );
    } else {
      const newKey = `period-${modalShift.weekday}-${Date.now()}`;
      setPeriods((current) => [
        ...current,
        {
          key: newKey,
          weekday: modalShift.weekday,
          startsAt: modalShift.startsAt,
          endsAt: modalShift.endsAt,
          endsNextDay: modalShift.endsNextDay,
          serviceAreaId: modalShift.serviceAreaId,
        },
      ]);
    }

    setModalShift(null);
  }

  function applyPreset(type: "fulltime" | "weekdays" | "clear") {
    const areaId = areas[0]?.id;
    if (areaId === undefined) return;

    if (type === "clear") {
      setPeriods([]);
      return;
    }

    const days = type === "fulltime" ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4];
    const newSchedule: DraftPeriod[] = days.map((day) => ({
      key: `preset-${day}-${Date.now()}`,
      serviceAreaId: areaId,
      weekday: day,
      startsAt: "09:00",
      endsAt: "18:00",
      endsNextDay: false,
    }));
    setPeriods(newSchedule);
  }

  if (areas.length === 0) {
    return (
      <p className="rounded-control border border-line bg-surface p-4 text-sm text-text-secondary">
        Choose where you work before publishing hours — your schedule is per area.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-24">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-navy-900">Weekly Schedule</h2>
        <Badge tone={hours > 0 ? "success" : "neutral"} className="tabular-nums font-bold">
          {hours === 0 ? "No hours set" : `${hours} hrs / week`}
        </Badge>
      </div>

      {/* Quick Schedule Presets */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => applyPreset("fulltime")}
          className="inline-flex min-h-11 items-center rounded-control bg-surface px-3 py-1.5 text-xs font-semibold text-navy-900 border border-line hover:border-line-strong transition-colors"
        >
          Mon – Sat (9 AM – 6 PM)
        </button>
        <button
          type="button"
          onClick={() => applyPreset("weekdays")}
          className="inline-flex min-h-11 items-center rounded-control bg-surface px-3 py-1.5 text-xs font-semibold text-navy-900 border border-line hover:border-line-strong transition-colors"
        >
          Mon – Fri (9 AM – 6 PM)
        </button>
        {periods.length > 0 && (
          <button
            type="button"
            onClick={() => applyPreset("clear")}
            className="inline-flex min-h-11 items-center rounded-control bg-surface px-3 py-1.5 text-xs font-semibold text-danger-text border border-line hover:bg-danger-surface transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Weekday List */}
      <div className="flex flex-col gap-2.5">
        {WEEKDAYS.map((weekdayLabel, weekday) => {
          const dayPeriods = periods.filter((period) => period.weekday === weekday);
          const dayHours = dayPeriods.reduce((acc, p) => {
            const start = Number(p.startsAt.split(":")[0]) + Number(p.startsAt.split(":")[1]) / 60;
            const end = Number(p.endsAt.split(":")[0]) + Number(p.endsAt.split(":")[1]) / 60;
            return acc + (p.endsNextDay ? 24 - start + end : Math.max(0, end - start));
          }, 0);

          const isActive = dayPeriods.length > 0;

          return (
            <div
              key={weekdayLabel}
              className={[
                "rounded-control border p-3.5 transition-colors",
                isActive ? "border-line bg-surface" : "border-line/60 bg-surface-sunken/40",
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-navy-900 w-24 sm:w-28">
                    {weekdayLabel}
                  </span>
                  {isActive ? (
                    <span className="text-xs font-semibold text-success-text">
                      {Math.round(dayHours * 10) / 10} hrs
                    </span>
                  ) : (
                    <span className="text-xs text-text-muted">Off Duty</span>
                  )}
                </div>

                {!isActive ? (
                  <button
                    type="button"
                    onClick={() => openNewShiftModal(weekday)}
                    className="inline-flex min-h-11 items-center gap-1 rounded-full border border-line bg-surface px-3 py-1 text-xs font-bold text-navy-800 hover:bg-surface-sunken hover:border-line-strong transition-colors"
                  >
                    <Plus size={13} />
                    <span>Set Shift</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditShiftModal(dayPeriods[0]!)}
                      className="inline-flex min-h-11 items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-navy-800 hover:bg-surface-sunken transition-colors"
                    >
                      <Edit2 size={12} />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => dayPeriods.forEach((p) => remove(p.key))}
                      className="grid h-11 w-11 place-items-center rounded-full text-text-muted hover:bg-danger-surface hover:text-danger-text transition-colors"
                      aria-label={`Clear ${weekdayLabel}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>

              {/* Active Shifts Summary */}
              {dayPeriods.map((period) => {
                const problem = problems.get(period.key) ?? null;

                return (
                  <div key={period.key} className="mt-2.5 border-t border-line/60 pt-2 flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs text-text-secondary">
                      <span className="font-semibold text-navy-900">
                        {period.startsAt} – {period.endsAt} {period.endsNextDay && "(Next day)"}
                      </span>
                    </div>

                    {problem ? (
                      <p role="alert" className="text-xs font-semibold text-danger-text">
                        ⚠️ {PROBLEM_MESSAGES[problem]}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Pop-up Modal Dialog for Setting Shift Hours */}
      {modalShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 sm:p-6 shadow-2xl flex flex-col gap-5">
            {/* Modal Header with Close (X) button */}
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-signal-500" />
                <h3 className="text-base font-bold text-navy-900">
                  Set Shift: {modalShift.weekdayLabel}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalShift(null)}
                className="grid h-11 w-11 place-items-center rounded-full text-text-muted hover:bg-surface-sunken hover:text-text transition-colors"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body - Time Inputs */}
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-navy-900">Starts At</label>
                  <input
                    type="time"
                    value={modalShift.startsAt}
                    onChange={(e) =>
                      setModalShift({ ...modalShift, startsAt: e.target.value })
                    }
                    className="h-11 rounded-control border border-line-strong bg-surface px-3 text-sm font-semibold text-text focus:border-focus-ring focus:outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-navy-900">Ends At</label>
                  <input
                    type="time"
                    value={modalShift.endsAt}
                    onChange={(e) =>
                      setModalShift({ ...modalShift, endsAt: e.target.value })
                    }
                    className="h-11 rounded-control border border-line-strong bg-surface px-3 text-sm font-semibold text-text focus:border-focus-ring focus:outline-none"
                  />
                </div>
              </div>

              {/* Quick Presets */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-text-muted">Preset:</span>
                <button
                  type="button"
                  onClick={() =>
                    setModalShift({ ...modalShift, startsAt: "09:00", endsAt: "18:00", endsNextDay: false })
                  }
                  className="inline-flex min-h-11 items-center rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold hover:bg-surface-sunken"
                >
                  9 AM – 6 PM
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setModalShift({ ...modalShift, startsAt: "10:00", endsAt: "19:00", endsNextDay: false })
                  }
                  className="inline-flex min-h-11 items-center rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold hover:bg-surface-sunken"
                >
                  10 AM – 7 PM
                </button>
              </div>

              {/* Overnight Checkbox */}
              <label className="flex items-center gap-2 text-xs font-semibold text-text cursor-pointer mt-1">
                <input
                  type="checkbox"
                  checked={modalShift.endsNextDay}
                  onChange={(e) =>
                    setModalShift({ ...modalShift, endsNextDay: e.target.checked })
                  }
                  className="h-4 w-4 accent-signal-500 rounded"
                />
                <span>Overnight shift (ends on the next morning)</span>
              </label>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 border-t border-line pt-4">
              <Button
                variant="outline"
                onClick={() => setModalShift(null)}
                className="font-semibold text-xs"
              >
                Cancel
              </Button>
              <Button
                onClick={saveModalShift}
                className="font-bold text-xs"
              >
                Save Shift
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Validation error */}
      {saveError ? (
        <p role="alert" className="text-sm font-bold text-danger-text">
          ⚠️ {saveError}
        </p>
      ) : null}

      {/* Save & Navigation Action Dock */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur px-4 py-3 shadow-lg">
        <div className="mx-auto max-w-[560px] flex items-center justify-between gap-3">
          <Link href="/apply/documents" className="shrink-0">
            <Button
              variant="outline"
              size="lg"
              className="font-bold text-sm h-12 px-5"
            >
              Back
            </Button>
          </Link>

          <div className="flex items-center gap-2.5">
            <Button
              size="lg"
              onClick={() => onSave(periods)}
              disabled={hasProblems || isSaving || !hasChanges}
              loading={isSaving}
              loadingLabel="Saving"
              className="font-bold text-sm h-12 px-4"
            >
              {hasChanges ? "Save Hours" : "Saved"}
            </Button>
            <Link href="/apply/review">
              <Button size="lg" className="font-bold text-sm h-12 px-5 shadow-md">
                Review Application
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
