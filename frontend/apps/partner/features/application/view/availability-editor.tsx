"use client";

import { Badge, Button, Field, Input, Select } from "@vsolve/ui";
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
  ZERO_LENGTH: "Start and end are the same. Tick “ends next day” for a full day.",
  ENDS_BEFORE_START: "This ends before it starts. Tick “ends next day” if it runs overnight.",
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

  const problems = useMemo(() => scheduleProblems(periods), [periods]);
  const hours = weeklyHours(periods);
  const hasProblems = problems.size > 0;

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

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-text">When you work</h2>
        <p className="text-sm text-text-secondary" aria-live="polite">
          {hours === 0 ? (
            "No hours published"
          ) : (
            <>
              <span data-numeric>{hours}</span> hours a week
            </>
          )}
        </p>
      </div>

      <p className="mt-1 text-sm text-text-secondary">
        You will only be offered jobs inside these hours. Nothing is published
        until you save.
      </p>

      <div className="mt-4 flex flex-col gap-4">
        {WEEKDAYS.map((weekdayLabel, weekday) => {
          const dayPeriods = periods.filter((period) => period.weekday === weekday);

          return (
            <section key={weekdayLabel} className="rounded-card border border-line p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold text-text">{weekdayLabel}</h3>
                {dayPeriods.length === 0 ? (
                  <Badge tone="neutral">Not working</Badge>
                ) : null}
              </div>

              {dayPeriods.map((period) => {
                const problem = problems.get(period.key) ?? null;

                return (
                  <div
                    key={period.key}
                    className="mt-3 flex flex-wrap items-end gap-3 border-t border-line pt-3"
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
                      onClick={() => remove(period.key)}
                      aria-label={`Remove ${weekdayLabel} ${period.startsAt} to ${period.endsAt}`}
                    >
                      Remove
                    </Button>

                    {problem ? (
                      <p role="alert" className="w-full text-sm font-medium text-danger-text">
                        {PROBLEM_MESSAGES[problem]}
                      </p>
                    ) : null}
                  </div>
                );
              })}

              <Button variant="secondary" className="mt-3" onClick={() => add(weekday)}>
                Add hours
                <span className="sr-only"> on {weekdayLabel}</span>
              </Button>
            </section>
          );
        })}
      </div>

      {saveError ? (
        <p role="alert" className="mt-4 text-sm font-medium text-danger-text">
          {saveError}
        </p>
      ) : null}

      <div className="mt-6 flex items-center gap-3">
        <Button onClick={() => onSave(periods)} disabled={hasProblems || isSaving}>
          {isSaving ? "Saving…" : "Save hours"}
        </Button>
        {hasProblems ? (
          <p className="text-sm text-text-secondary" aria-live="polite">
            Fix the periods marked above first.
          </p>
        ) : null}
      </div>
    </div>
  );
}
