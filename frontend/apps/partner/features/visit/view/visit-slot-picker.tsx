"use client";

import { Button } from "@vsolve/ui";
import { useState } from "react";

import type { SlotGridView, SlotOption } from "../model/slot-grid";
import { describeVisitDuration, describeGrid, gridShape } from "../model/slot-grid";

/**
 * The grid of candidate visit starts, rendered exactly as the server drew it.
 *
 * The Partner-side twin of the A1 checkout's `preferred-start-picker`. Same
 * shape, same source, same rule — **the browser never computes availability** —
 * and three deliberate differences, each of which is why this is its own
 * component rather than an import across an app boundary:
 *
 * 1. **Every day is shown, including days where nothing is open.** The customer
 *    picker filters to bookable days, which is right for somebody choosing a
 *    convenient time. It is wrong here: an ineligible vendor's grid is *entirely*
 *    unavailable, and filtering it would leave an empty screen where the truth is
 *    "these are the times, and none of them is yours". A grid that renders its
 *    own refusal is information; an empty state is a shrug.
 * 2. **The unavailable reason is shown per slot**, not hidden. "You are not
 *    free" and "outside working hours here" send a vendor to two different
 *    places — their own calendar, or support.
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
  const shape = gridShape(grid);
  const notice = describeGrid(shape);

  // Open the first day that has something on it, so a vendor whose Tuesday is
  // full does not land on an empty tab. Falls back to the first day, which is
  // what an entirely closed grid should show.
  const [dayIndex, setDayIndex] = useState<number>(() => {
    const firstOpen = grid.days.findIndex((day) => day.openCount > 0);
    return firstOpen === -1 ? 0 : firstOpen;
  });

  const day = grid.days[dayIndex] ?? null;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-6 text-text-secondary">
        Each visit is {describeVisitDuration(grid.visitDurationMinutes)} on site. Times are shown{" "}
        {grid.timezoneUnsupported ? (
          <>
            in your device&rsquo;s timezone — this phone does not recognise{" "}
            <span className="font-medium text-text">{grid.timezone}</span>, which is the timezone
            Vsolve booked them in. Check the date and time against the customer&rsquo;s area before
            you confirm.
          </>
        ) : (
          <>
            in <span className="font-medium text-text">{grid.timezone}</span>, the
            customer&rsquo;s local time.
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

      {grid.days.length === 0 ? null : (
        <>
          <fieldset className="m-0 border-0 p-0">
            <legend className="text-sm font-semibold text-text">Pick a day</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {grid.days.map((candidate, index) => (
                <Button
                  key={candidate.date}
                  variant={dayIndex === index ? "primary" : "outline"}
                  size="sm"
                  aria-pressed={dayIndex === index}
                  onClick={() => setDayIndex(index)}
                  disabled={disabled}
                >
                  {candidate.label}
                  {candidate.openCount === 0 ? (
                    <span className="ml-1 font-normal opacity-70">· none open</span>
                  ) : null}
                </Button>
              ))}
            </div>
          </fieldset>

          {day === null ? null : (
            <fieldset className="m-0 border-0 p-0">
              <legend className="text-sm font-semibold text-text">
                Pick a start time on {day.label}
              </legend>
              <div
                role="radiogroup"
                aria-label={`Start times on ${day.label}`}
                className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2"
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
          These times are a snapshot of your calendar, not a reservation. A slot can be taken while
          you are looking at it — if that happens Vsolve will say so and show you the times that are
          left. Nothing is held until you confirm.
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
        {selected ? "Selected" : "Tap to choose this time"}
      </span>
    </button>
  );
}
