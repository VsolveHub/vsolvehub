"use client";

import { Badge, EmptyState, cn } from "@vsolve/ui";
import { useState } from "react";

import type { WindowDayView, WindowsView } from "../adapters";
import { ChoiceCard } from "./choice-card";
import { useWorkspace } from "./workspace-context";

/**
 * Arrival-window selection — Today and Scheduled in one list.
 *
 * They are the same product in M1: a 60-minute arrival window, Today needing 120
 * minutes' lead time and Scheduled running to 7 days out. The old design split
 * them into two flows because Instant was one of them; with Instant deferred to
 * M4 there is nothing left to split.
 *
 * Three acceptance criteria live in this screen:
 *
 * - No window is automatically selected, and no date is preselected either:
 *   `day` starts null and windows appear only after a date is chosen.
 * - No unavailable window allows progression. They render disabled with the
 *   reason rather than hidden — a gap makes a customer think the platform is
 *   broken, while "Too soon to book" is information. The reducer refuses to
 *   record them regardless of what this screen does.
 * - The UI never fabricates availability. An empty response says so; it does not
 *   invent a next-available time.
 */

export interface WindowStageProps {
  windows: WindowsView;
}

function DayStrip({
  days,
  selected,
  onSelect,
}: {
  days: WindowDayView[];
  selected: string | null;
  onSelect: (date: string) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Choose a date"
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2"
    >
      {days.map((day) => {
        const bookable = day.windows.some((window) => window.isAvailable);
        const isSelected = selected === day.date;
        return (
          <button
            key={day.date}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={!bookable}
            onClick={() => onSelect(day.date)}
            className={cn(
              "flex min-h-16 min-w-16 shrink-0 flex-col items-center justify-center rounded-plate border px-3 py-2",
              "transition-colors duration-fast ease-out",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action",
              isSelected
                ? "border-action bg-signal-50"
                : "border-line-strong bg-surface hover:border-warm-600",
              !bookable && "cursor-not-allowed border-line bg-surface-sunken text-text-muted",
            )}
          >
            <span className="text-xs font-semibold uppercase tracking-wide">{day.label}</span>
            <span data-numeric className="text-lg font-bold leading-none">
              {day.dayOfMonth}
            </span>
            {!bookable ? <span className="sr-only">No times available</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function WindowStage({ windows }: WindowStageProps) {
  const { state, dispatch } = useWorkspace();
  // Null, not `days[0].date`. Preselecting a date is how a customer ends up
  // booking a day they never looked at.
  const [day, setDay] = useState<string | null>(null);

  if (windows.isEmpty) {
    return (
      <EmptyState
        title="No arrival windows available in the next seven days"
        description="Every window is taken. Try again shortly — professionals publish new availability throughout the day."
      />
    );
  }

  const selectedDay = windows.days.find((candidate) => candidate.date === day) ?? null;

  return (
    <div>
      <h2 className="text-lg font-semibold text-text">Choose an arrival window</h2>
      <p className="mt-1 text-sm text-text-secondary">
        Pick a date, then a window. Your professional will arrive within it — the
        visit takes about {windows.estimatedDurationMinutes} minutes.
      </p>

      <div className="mt-4">
        <DayStrip days={windows.days} selected={day} onSelect={setDay} />
      </div>

      {selectedDay === null ? (
        <p className="mt-6 text-sm text-text-secondary">
          Select a date to see available windows.
        </p>
      ) : (
        <fieldset className="mt-6 border-0 p-0">
          <legend className="text-sm font-semibold text-text">
            Arrival windows on {selectedDay.label}
          </legend>

          <div className="mt-3 flex flex-col gap-2">
            {selectedDay.windows.map((window) => (
              <ChoiceCard
                key={window.id}
                name="window"
                value={window.id}
                checked={state.windowId === window.id}
                disabled={!window.isAvailable}
                onSelect={() =>
                  dispatch({
                    type: "SELECT_WINDOW",
                    windowId: window.id,
                    isAvailable: window.isAvailable,
                  })
                }
                title={window.label}
                ariaLabel={
                  window.isAvailable
                    ? window.label
                    : `${window.label}, ${window.unavailableLabel ?? "not available"}`
                }
                trailing={
                  window.unavailableLabel ? (
                    // State is carried by a text badge, not by colour alone.
                    <Badge tone="neutral">{window.unavailableLabel}</Badge>
                  ) : null
                }
              />
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}
