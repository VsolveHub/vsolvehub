"use client";

import { Button, Sheet, cn } from "@vsolve/ui";
import { useState } from "react";

/**
 * Choosing a start day, as a list of real days.
 *
 * ## Why not `<input type="date">`
 *
 * Three reasons, and the first is the one that shows up in support. Empty, it
 * renders `dd-mm-yyyy` — a format hint that reads as a filled-in value to plenty
 * of people, so the form looks answered when it is not. Second, it opens a
 * different picker on every platform, and on some Android builds a spinner that
 * takes six gestures to reach next Tuesday. Third, it accepts any date the
 * `min` attribute allows, including ones far enough out that the request expires
 * before anybody looks at it.
 *
 * A list of the next few weeks answers the question actually being asked — which
 * day do you want the crew — in one tap, and it can say "Tomorrow" and
 * "Saturday", which no date input can.
 *
 * ## It commits on confirm, not on tap
 *
 * Same rule as every other dialog in this app: Escape, the backdrop and Cancel
 * are all cancels and none of them writes. The highlighted day is staged inside
 * the sheet until **Use this date**.
 *
 * ## A `Sheet`, not a `Dialog`
 *
 * Docked to the bottom edge, which on a phone is where a thumb is. The
 * primitive is the same native `<dialog>` underneath, so focus trapping, Escape
 * and background inertness come from the platform rather than from here.
 */

export interface DateSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The committed value, as `YYYY-MM-DD`. */
  value: string | null;
  onSelect: (isoDate: string) => void;
  /**
   * How many days forward to offer.
   *
   * Ten by default, which is deliberately short. Six weeks of full-width rows
   * was a scrolling list inside a sheet that also scrolls — the customer lost
   * the confirm button below the fold and hit blank space at the bottom. Ten
   * days fit in a grid with no scrolling at all, and they cover the answer
   * almost everybody gives to "when can we start".
   *
   * A caller that genuinely needs further out — a completion deadline, months
   * away — raises it and accepts the scroll.
   */
  horizonDays?: number;
}

/** `YYYY-MM-DD` in the customer's own timezone, not UTC. */
function toIsoDate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The offered days, starting today.
 *
 * Built from local date parts throughout. A browser east of UTC that formats a
 * `new Date(iso)` gets the previous day, which on a booking screen means a crew
 * arriving twenty-four hours early.
 */
function offeredDays(horizonDays: number): { iso: string; date: Date }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: horizonDays }, (_, offset) => {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    return { iso: toIsoDate(date), date };
  });
}

const WEEKDAY = new Intl.DateTimeFormat("en-IN", { weekday: "short" });
const WEEKDAY_LONG = new Intl.DateTimeFormat("en-IN", { weekday: "long" });
const MONTH = new Intl.DateTimeFormat("en-IN", { month: "short" });
const DAY_MONTH = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long" });

/**
 * "Today" and "Tomorrow" beat a weekday name; after that the name is clearer.
 *
 * Short forms, because a tile is a third of a phone's width. The spoken label
 * uses the long name — an abbreviation read aloud is worse than the word.
 */
function relativeName(offset: number, date: Date): string {
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  return WEEKDAY.format(date);
}

function spokenName(offset: number, date: Date): string {
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  return WEEKDAY_LONG.format(date);
}

export function DateSheet({
  open,
  onOpenChange,
  value,
  onSelect,
  horizonDays = 10,
}: DateSheetProps) {
  // Staged, so dismissing the sheet leaves the committed value alone.
  const [pending, setPending] = useState<string | null>(value);
  const days = offeredDays(horizonDays);

  return (
    <Sheet
      open={open}
      // Every dismissal resets the staged value to what is actually committed,
      // so reopening never shows a day the customer walked away from.
      onOpenChange={(next) => {
        if (!next) setPending(value);
        onOpenChange(next);
      }}
      title="Start from"
      description="The first day you need the crew."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={pending === null}
            onClick={() => {
              if (pending === null) return;
              onSelect(pending);
              onOpenChange(false);
            }}
          >
            Use this date
          </Button>
        </>
      }
    >
      <fieldset className="border-0 p-0 pb-1">
        <legend className="sr-only">Choose a start day</legend>
        {/* A grid, not a list. Ten days as full-width rows is a scrolling region
            inside a sheet that also scrolls, which is how the confirm button ends
            up below the fold; as tiles they all fit at once and the footer stays
            where the thumb expects it. */}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {days.map(({ iso, date }, offset) => {
            const checked = pending === iso;
            return (
              <label
                key={iso}
                className={cn(
                  "flex min-h-[68px] cursor-pointer flex-col items-center justify-center gap-0.5",
                  "rounded-[14px] border px-1 py-2 text-center transition-colors duration-fast",
                  "has-[:focus-visible]:outline has-[:focus-visible]:outline-2",
                  "has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring",
                  checked
                    ? "border-2 border-action-secondary bg-selected-surface"
                    : "border-line bg-surface hover:bg-surface-hover",
                )}
              >
                <input
                  type="radio"
                  name="start-date"
                  value={iso}
                  checked={checked}
                  onChange={() => setPending(iso)}
                  className="sr-only"
                />
                <span
                  aria-hidden
                  className={cn(
                    "text-[11px] font-semibold uppercase tracking-[0.06em]",
                    checked ? "text-text-link" : "text-text-muted",
                  )}
                >
                  {relativeName(offset, date)}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "text-[17px] font-bold leading-tight tabular-nums",
                    checked ? "text-text" : "text-text",
                  )}
                >
                  {date.getDate()}
                </span>
                <span aria-hidden className="text-[11px] text-text-muted">
                  {MONTH.format(date)}
                </span>
                {/* The tile is a glyph grid, so the whole answer is spoken here
                    rather than assembled from three abbreviations. */}
                <span className="sr-only">
                  {`${spokenName(offset, date)}, ${DAY_MONTH.format(date)}`}
                  {checked ? ", selected" : ""}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
    </Sheet>
  );
}
