"use client";

import { Button, EmptyState } from "@vsolve/ui";
import { useState } from "react";

import { ChoiceCard } from "./choice-card";
import type { WindowsView } from "../adapters";

/**
 * When the customer would like **one visit** to start.
 *
 * Only instants the server itself published are offered — the times below are the service
 * area's own operating slots, not a grid assembled in the browser.
 *
 * ## Two callers, one picker
 *
 * Checkout mounts it once per scheduling group to choose a start before booking. The visit
 * screen mounts it to choose a *new* start for a visit already booked. Both render the same
 * `BookingWindows` payload from the same `build_arrival_window_grid`, so they share this
 * component rather than growing a second one that drifts.
 *
 * What genuinely differs between them is the sentence underneath, because the two grids
 * promise different things — one precedes a quote, the other precedes a move of a paid visit.
 * That is `footnote`, and it has no default: a caller that forgets it would inherit the other
 * caller's promise, which is exactly the kind of quiet wrongness this component should not be
 * able to produce.
 *
 * The wording of both is careful about what the times mean. They rule out what is past, too
 * soon or outside operating hours by omitting those slots, not by showing them disabled. Days
 * with nothing bookable are hidden the same way. They are **not** a promise that everything
 * fits, because only the planner (checkout) or the reschedule command (visit) can answer that.
 */

export interface PreferredStartPickerProps {
  windows: WindowsView;
  selectedStart: string | null;
  onSelect: (startsAt: string) => void;
  /** The sentence under the grid. Required — see the note above on why there is no default. */
  footnote: string;
}

export function PreferredStartPicker({
  windows,
  selectedStart,
  onSelect,
  footnote,
}: PreferredStartPickerProps) {
  const bookableDays = windows.days.filter((day) =>
    day.windows.some((window) => window.isAvailable),
  );

  const [dayIndex, setDayIndex] = useState<number | null>(() => {
    if (selectedStart) {
      const idx = bookableDays.findIndex((d) =>
        d.windows.some((w) => w.startsAt === selectedStart),
      );
      if (idx !== -1) return idx;
    }
    return bookableDays.length > 0 ? 0 : null;
  });

  if (bookableDays.length === 0) {
    return (
      <EmptyState
        title="No start times are open right now"
        description="Every slot in the next few days is either past or outside working hours for this area. Nothing has been booked."
      />
    );
  }

  const day = dayIndex === null ? null : bookableDays[dayIndex];
  const availableWindows = day === null ? [] : day.windows.filter((window) => window.isAvailable);

  return (
    <div>
      <fieldset>
        <legend className="text-sm font-semibold text-text">Pick a day</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {bookableDays.map((candidate, index) => (
            <Button
              key={candidate.label}
              variant={dayIndex === index ? "primary" : "outline"}
              size="sm"
              aria-pressed={dayIndex === index}
              onClick={() => setDayIndex(index)}
            >
              {candidate.label}
            </Button>
          ))}
        </div>
      </fieldset>

      {day === null ? (
        <p className="mt-4 text-sm text-text-secondary">
          Choose a day to see start times. Nothing is preselected.
        </p>
      ) : (
        <fieldset className="mt-6">
          <legend className="text-sm font-semibold text-text">
            Pick a start time on {day.label}
          </legend>
          <div className="mt-2 flex flex-col gap-2">
            {availableWindows.map((window) => (
              <ChoiceCard
                key={window.startsAt}
                name="preferred-start"
                value={window.startsAt}
                checked={selectedStart === window.startsAt}
                onSelect={onSelect}
                title={window.label}
                description={
                  [window.durationLabel, window.scarcityLabel].filter(Boolean).join(" · ") || null
                }
              />
            ))}
          </div>
        </fieldset>
      )}

      <p className="mt-4 text-sm text-text-secondary">{footnote}</p>
    </div>
  );
}

