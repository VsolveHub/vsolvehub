"use client";

import { Button, EmptyState } from "@vsolve/ui";
import { useState } from "react";

import { ChoiceCard } from "@/features/booking/view/choice-card";
import type { WindowsView } from "@/features/booking/adapters";

/**
 * When the customer would like **one visit** to start.
 *
 * Since contract 1.18.0 the plan-set command takes a start per scheduling group,
 * and this picker supplies exactly one of them — the slots modal mounts it once
 * per visit. Only instants the server itself published are offered; the times
 * below are the service area's own operating slots for this cart and address,
 * not a grid assembled in the browser.
 *
 * The wording is careful about what those times mean. They rule out what is
 * past, too soon or outside operating hours; they are **not** a promise that the
 * whole cart fits, because only the planner can answer that. Presenting them as
 * availability would be a capacity claim nobody made, and the plan set is one
 * request away.
 */

export interface PreferredStartPickerProps {
  windows: WindowsView;
  selectedStart: string | null;
  onSelect: (startsAt: string) => void;
}

export function PreferredStartPicker({
  windows,
  selectedStart,
  onSelect,
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
            {day.windows.map((window) => (
              <ChoiceCard
                key={window.startsAt}
                name="preferred-start"
                value={window.startsAt}
                checked={selectedStart === window.startsAt}
                disabled={!window.isAvailable}
                onSelect={onSelect}
                title={window.label}
                description={
                  window.isAvailable
                    ? [window.durationLabel, window.scarcityLabel].filter(Boolean).join(" · ")
                    : (window.unavailableLabel ?? "Not available")
                }
              />
            ))}
          </div>
        </fieldset>
      )}

      <p className="mt-4 text-sm text-text-secondary">
        This is when you would like us to start. We will show you exactly how it can be
        arranged, and what it costs, before anything is confirmed.
      </p>
    </div>
  );
}

