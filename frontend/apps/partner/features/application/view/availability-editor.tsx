"use client";

import { Badge, Button, Field, Input, Select } from "@vsolve/ui";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import {
  WEEKDAYS,
  newPeriod,
  scheduleProblems,
  weeklyHours,
  type DraftPeriod,
  type PeriodProblem,
} from "../model/schedule";

/**
 * Explicit weekly working periods.
 *
 * ADR-010: a Partner is available only for hours they published. This editor
 * therefore starts empty and has no "standard week" button — a preset is a
 * default by another name, and a default here means the platform promising a
 * customer time nobody agreed to.
 *
 * The overnight checkbox is not cosmetic. "22:00 to 06:00" cannot be
 * distinguished from a typo without asking, and inferring it would quietly turn
 * a mistake into a night shift the Partner then gets offered work in.
 */

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
  /** Server-side failure, shown without pretending the save succeeded. */
  saveError?: string | null;
}

export function AvailabilityEditor({
  areas,
  initialPeriods,
  onSave,
  isSaving = false,
  saveError = null,
}: AvailabilityEditorProps) {
  const [periods, setPeriods] = useState<DraftPeriod[]>([...initialPeriods]);
  const [showAll, setShowAll] = useState(false);

  const problems = useMemo(() => scheduleProblems(periods), [periods]);
  const hours = weeklyHours(periods);
  const hasProblems = problems.size > 0;
  const hasChanges = JSON.stringify(periods) !== JSON.stringify(initialPeriods);

  function update(key: string, patch: Partial<DraftPeriod>) {
    setPeriods((current) =>
      current.map((period) => (period.key === key ? { ...period, ...patch } : period)),
    );
  }

  function remove(key: string) {
    setPeriods((current) => current.filter((period) => period.key !== key));
  }

  function add(weekday: number) {
    const areaId = areas[0]?.id;
    if (areaId === undefined) return;
    setPeriods((current) => [...current, newPeriod(areaId, weekday)]);
  }

  if (areas.length === 0) {
    return (
      <p className="rounded-card border border-line bg-surface p-4 text-sm text-text-secondary">
        Choose where you work before publishing hours — your schedule is per area.
      </p>
    );
  }

  // Show first 2 days initially, rest behind toggle
  const visibleDays = showAll ? WEEKDAYS : WEEKDAYS.slice(0, 2);

  return (
    <div className="pb-28">
      {/* Section header */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-text">When you work</h2>
        <Badge tone="info" className="tabular-nums">
          {hours === 0 ? "No hours" : `${hours} hours a week`}
        </Badge>
      </div>

      <p className="mt-1 text-sm text-text-secondary">
        You will only be offered jobs inside these hours. Nothing is published
        until you save.
      </p>

      {/* Weekday cards */}
      <div className="mt-4 flex flex-col gap-3">
        {visibleDays.map((weekdayLabel, index) => {
          // When collapsed, index maps to the actual weekday directly
          const weekday = showAll ? index : index;
          const dayPeriods = periods.filter((period) => period.weekday === weekday);
          const dayHours = dayPeriods.reduce((acc, p) => {
            // Rough hour count for display
            const start = Number(p.startsAt.split(":")[0]) + Number(p.startsAt.split(":")[1]) / 60;
            const end = Number(p.endsAt.split(":")[0]) + Number(p.endsAt.split(":")[1]) / 60;
            return acc + (p.endsNextDay ? 24 - start + end : end - start);
          }, 0);

          return (
            <section
              key={weekdayLabel}
              className="vsh-stagger-rise rounded-card border border-line bg-surface p-4"
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold uppercase tracking-wide text-text">
                  {weekdayLabel}
                </h3>
                {dayPeriods.length === 0 ? (
                  <Badge tone="neutral">NOT WORKING</Badge>
                ) : (
                  <span className="text-sm tabular-nums text-text-muted">
                    {Math.round(dayHours)} hrs
                  </span>
                )}
              </div>

              {dayPeriods.map((period) => {
                const problem = problems.get(period.key) ?? null;

                return (
                  <div
                    key={period.key}
                    className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3"
                  >
                    <Field label="From" error={undefined}>
                      <Input
                        type="time"
                        value={period.startsAt}
                        onChange={(event) =>
                          update(period.key, { startsAt: event.target.value })
                        }
                      />
                    </Field>

                    <span className="flex h-11 items-center text-text-muted">—</span>

                    <Field label="To">
                      <Input
                        type="time"
                        value={period.endsAt}
                        onChange={(event) =>
                          update(period.key, { endsAt: event.target.value })
                        }
                      />
                    </Field>

                    {areas.length > 1 ? (
                      <Field label="Area">
                        <Select
                          value={period.serviceAreaId}
                          onChange={(event) =>
                            update(period.key, { serviceAreaId: event.target.value })
                          }
                        >
                          {areas.map((area) => (
                            <option key={area.id} value={area.id}>
                              {area.label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    ) : null}

                    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-text">
                      <input
                        type="checkbox"
                        checked={period.endsNextDay}
                        onChange={(event) =>
                          update(period.key, { endsNextDay: event.target.checked })
                        }
                        className="h-5 w-5 accent-[color:var(--color-signal-600)]"
                      />
                      Ends next day
                    </label>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(period.key)}
                      aria-label={`Remove ${weekdayLabel} ${period.startsAt} to ${period.endsAt}`}
                      icon={<Trash2 size={16} />}
                    >
                      <span className="sr-only">Remove</span>
                    </Button>

                    {problem ? (
                      <p role="alert" className="w-full text-sm font-medium text-danger-text">
                        {PROBLEM_MESSAGES[problem]}
                      </p>
                    ) : null}
                  </div>
                );
              })}

              <button
                type="button"
                className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-info-text hover:underline"
                onClick={() => add(weekday)}
              >
                <Plus size={14} />
                Add hours
                <span className="sr-only"> on {weekdayLabel}</span>
              </button>
            </section>
          );
        })}
      </div>

      {/* Show remaining days toggle */}
      {!showAll ? (
        <button
          type="button"
          className="mt-4 w-full text-center text-sm font-semibold text-info-text hover:underline"
          onClick={() => setShowAll(true)}
        >
          Show remaining days
        </button>
      ) : null}

      {/* Validation error */}
      {saveError ? (
        <p role="alert" className="mt-4 text-sm font-medium text-danger-text">
          {saveError}
        </p>
      ) : null}

      {/* Sticky save bar */}
      <div className="fixed inset-x-0 bottom-14 z-30 border-t border-line bg-surface px-4 py-3">
        <div className="mx-auto max-w-2xl">
          <Button
            block
            onClick={() => onSave(periods)}
            disabled={hasProblems || isSaving || !hasChanges}
          >
            {isSaving ? "Saving…" : "Save hours"}
          </Button>
          <p className="mt-1.5 text-center text-xs text-text-muted" aria-live="polite">
            {hasProblems
              ? "Fix the periods marked above first."
              : hasChanges
                ? "You have unsaved changes."
                : "No changes made to save."}
          </p>
        </div>
      </div>
    </div>
  );
}
