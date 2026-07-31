"use client";

import { Badge, Button, EmptyState, cn } from "@vsolve/ui";
import { useState } from "react";

import type { AvailabilityView, DayView } from "../adapters";
import { ChoiceCard } from "./choice-card";
import { useWorkspace } from "./workspace-context";

/**
 * Scheduled slot selection.
 *
 * Three of B3's acceptance criteria live in this screen:
 *
 * - No slot is automatically selected. No date is preselected either: `day`
 *   starts null and windows appear only after a date is chosen (doc 03 §2).
 * - No unavailable slot allows progression. Unavailable windows are rendered
 *   disabled with the reason, rather than hidden — a gap makes a customer think
 *   the platform is broken, while "Fully booked" is information. The reducer
 *   refuses to record them regardless of what this screen does.
 * - The UI never fabricates availability. If the response is empty, this says so
 *   and offers Instant; it does not invent a next-available time.
 */

export interface SlotStageProps {
  availability: AvailabilityView;
  /** Offered as the alternative when nothing in the window is bookable. */
  onSwitchToInstant?: () => void;
}

function DayStrip({
  days,
  selected,
  onSelect,
}: {
  days: DayView[];
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
        const bookable = day.slots.some((slot) => slot.isAvailable);
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
            <span className="text-xs font-semibold uppercase tracking-wide">
              {day.label}
            </span>
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

export function SlotStage({ availability, onSwitchToInstant }: SlotStageProps) {
  const { state, dispatch } = useWorkspace();
  // Null, not `days[0].date`. Preselecting a date is how a customer ends up
  // booking a day they never looked at.
  const [day, setDay] = useState<string | null>(null);

  if (availability.isEmpty) {
    return (
      <EmptyState
        title="No times available in the next seven days"
        description="Every window is taken. Booking now often still works — we search professionals who are free right away."
        action={
          onSwitchToInstant ? (
            <Button variant="secondary" onClick={onSwitchToInstant}>
              Try booking now instead
            </Button>
          ) : undefined
        }
      />
    );
  }

  const selectedDay = availability.days.find((candidate) => candidate.date === day) ?? null;

  return (
    <div>
      <h2 className="text-lg font-semibold text-text">Choose a time</h2>
      <p className="mt-1 text-sm text-text-secondary">
        Pick a date, then a start time.
      </p>

      <div className="mt-4">
        <DayStrip days={availability.days} selected={day} onSelect={setDay} />
      </div>

      {selectedDay === null ? (
        <p className="mt-6 text-sm text-text-secondary">
          Select a date to see available times.
        </p>
      ) : (
        <fieldset className="mt-6 border-0 p-0">
          <legend className="text-sm font-semibold text-text">
            Start times on {selectedDay.label}
          </legend>

          <div className="mt-3 flex flex-col gap-2">
            {selectedDay.slots.map((slot) => (
              <ChoiceCard
                key={slot.id}
                name="slot"
                value={slot.id}
                checked={state.slotId === slot.id}
                disabled={!slot.isAvailable}
                onSelect={() =>
                  dispatch({
                    type: "SELECT_SLOT",
                    slotId: slot.id,
                    isAvailable: slot.isAvailable,
                  })
                }
                title={slot.label}
                ariaLabel={
                  slot.isAvailable
                    ? slot.label
                    : `${slot.label}, ${slot.unavailableLabel ?? "not available"}`
                }
                trailing={
                  slot.unavailableLabel ? (
                    // State is carried by a text badge, not by colour alone.
                    <Badge tone="neutral">{slot.unavailableLabel}</Badge>
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
