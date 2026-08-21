"use client";

import { Button } from "@vsolve/ui";
import { useState } from "react";

import type { SlotGridView, SlotOption } from "../model/slot-grid";
import { describeVisitDuration, describeGrid, gridShape } from "../model/slot-grid";

/**
 * The next two future days of candidate visit starts for the Partner.
 *
 * The Partner-side twin of the A1 checkout's `preferred-start-picker`. Same
 * shape, same source, same rule — **the browser never computes availability** —
 * and three display rules narrow that server-owned answer without recomputing
 * availability in the browser:
 *
 * 1. Today is omitted. Partners need lead time to travel to a project visit.
 * 2. Only the next two server-ordered future days are considered, and only
 *    slots the server marked available are shown.
 * 3. **Nothing is preselected and nothing is remembered across a reload.** Slot
 *    ids are signed tokens that expire; a selection restored from storage would
 *    be a token the server refuses, presented as a choice the vendor already
 *    made.
 */

export interface VisitSlotPickerProps {
  readonly grid: SlotGridView;
  readonly selectedToken: string | null;
  readonly onSelect: (slot: SlotOption) => void;
  readonly disabled?: boolean;
}

export function VisitSlotPicker({
  grid,
  selectedToken,
  onSelect,
  disabled = false,
}: VisitSlotPickerProps) {
  const visibleDays = grid.days
    .filter((day) => !day.isToday)
    .slice(0, 2)
    .map((day) => {
      const slots = day.slots.filter((slot) => slot.isAvailable);
      return { ...day, slots, openCount: slots.length };
    })
    .filter((day) => day.openCount > 0);
  const notice =
    visibleDays.length === 0
      ? {
          title: "No visit times in the next 2 days",
          message: "Refresh later to check for new times.",
        }
      : describeGrid(gridShape(grid));

  const [dayIndex, setDayIndex] = useState(0);
  const day = visibleDays[dayIndex] ?? visibleDays[0] ?? null;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium leading-5 text-text-secondary">
        {describeVisitDuration(grid.visitDurationMinutes)} visit <span aria-hidden>·</span>{" "}
        {grid.timezoneUnsupported ? (
          <>
            Check the site&rsquo;s timezone before booking
          </>
        ) : (
          <>
            <span className="text-text">{grid.timezone}</span>
          </>
        )}
      </p>

      {notice ? (
        <div
          role="status"
          className="rounded-control border border-line bg-surface-sunken p-3 text-sm leading-6"
        >
          <p className="font-semibold text-text">{notice.title}</p>
          <p className="mt-1 text-text-secondary">{notice.message}</p>
        </div>
      ) : null}

      {visibleDays.length === 0 ? null : (
        <>
          <fieldset className="m-0 border-0 p-0">
            <legend className="text-sm font-semibold text-text">Day</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {visibleDays.map((candidate, index) => (
                <Button
                  key={candidate.date}
                  variant={day?.date === candidate.date ? "primary" : "outline"}
                  size="sm"
                  aria-pressed={day?.date === candidate.date}
                  onClick={() => setDayIndex(index)}
                  disabled={disabled}
                >
                  {candidate.label}
                </Button>
              ))}
            </div>
          </fieldset>

          {day === null ? null : (
            <fieldset className="m-0 border-0 p-0">
              <legend className="text-sm font-semibold text-text">Time on {day.label}</legend>
              <div
                role="radiogroup"
                aria-label={`Start times on ${day.label}`}
                className="mt-2 grid grid-cols-2 gap-2"
              >
                {day.slots.map((slot) => (
                  <SlotButton
                    key={slot.token}
                    slot={slot}
                    selected={slot.token === selectedToken}
                    disabled={disabled}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            </fieldset>
          )}
        </>
      )}

      {grid.isPreliminary ? (
        <p className="text-xs leading-5 text-text-muted">
          Times stay live until you book one.
        </p>
      ) : null}
    </div>
  );
}

function SlotButton({
  slot,
  selected,
  disabled,
  onSelect,
}: {
  readonly slot: SlotOption;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly onSelect: (slot: SlotOption) => void;
}) {
  const base =
    "flex min-h-14 w-full flex-col items-start justify-center rounded-control border px-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action";

  if (!slot.isAvailable) {
    return (
      <div
        className={`${base} cursor-not-allowed border-line bg-surface-sunken opacity-70`}
        aria-disabled
      >
        <span className="text-sm font-medium text-text-secondary line-through">{slot.label}</span>
        <span className="text-xs text-text-muted">{slot.unavailableLabel}</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      // A radio in behaviour, so a screen reader announces the group and the
      // chosen one rather than a page of unrelated buttons.
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={() => onSelect(slot)}
      className={`${base} ${
        selected
          ? "border-action bg-info-surface text-text"
          : "border-line bg-surface text-text hover:border-action"
      } disabled:cursor-not-allowed disabled:opacity-60`}
    >
      <span className="text-sm font-semibold">{slot.label}</span>
      <span className={`text-xs ${selected ? "text-info-text" : "text-text-muted"}`}>
        {selected ? "Selected" : "Choose"}
      </span>
    </button>
  );
}
