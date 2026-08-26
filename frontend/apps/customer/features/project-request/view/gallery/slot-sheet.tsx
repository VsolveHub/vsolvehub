"use client";

import { Button, cn } from "@vsolve/ui";
import { useId } from "react";

import { FieldLabel } from "@/features/booking/view/mobile-screen";

/**
 * Giving one visit a time: a day, then a two-hour window.
 *
 * ## The sentence under the title is the whole point of the screen
 *
 * "The professional accepts or passes. They never move your time." A customer
 * who believes the slot is a suggestion will not put a real one in, and the
 * request then arrives with a time nobody meant. Saying that the time is theirs
 * — and that the only two answers a professional can give are yes and no — is
 * what makes the grid below worth filling in honestly.
 *
 * ## Why it is a panel and not the shared `Sheet`
 *
 * `Sheet` is the right primitive for the wired route and this is a copy of its
 * chrome: the same grab handle, the same `rounded-t-card border-line/60
 * shadow-overlay` panel, the same footer rule. What it cannot be here is a
 * native `<dialog>`: `showModal()` renders in the browser's top layer, which is
 * the whole viewport rather than the 390×844 artboard frame this is displayed
 * in, so the sheet would escape the phone it belongs to. `Sheet`'s handle is
 * also `md:hidden`, and the breakpoint reads the real viewport, so on a desktop
 * gallery the handle would vanish from a phone-width artboard.
 *
 * The same swap costs nothing at the call site — this takes `onCancel` and
 * `onConfirm` where `Sheet` takes `onOpenChange` — and the wired route builds
 * this body inside a real `Sheet` when the contract lands.
 *
 * ## It stages, it does not commit
 *
 * `selectedDayId` and `selectedWindowId` are the caller's staged choice, not the
 * committed slot. Cancel, Escape and the backdrop are all cancels and none of
 * them writes; **Use this time** is the only thing that does. Pure component —
 * props in, JSX out, no fetching and no data state.
 */

export interface SlotSheetDay {
  id: string;
  /** "Today", "Tomorrow", then the short weekday. */
  name: string;
  /** The date, as it is printed on the tile. */
  dayNumber: string;
  /** The short month. */
  month: string;
  /** The whole day spoken as one phrase: "Thursday, 4 September". */
  spoken: string;
}

export interface SlotSheetWindow {
  id: string;
  /** "10:00 – 12:00". */
  label: string;
  /** Supply in words: "6 pros cover this area". Never a bare number. */
  availability: string;
  /** False greys the tile and blocks selection. Nobody covers this area then. */
  available: boolean;
}

export interface SlotSheetProps {
  /** Which visit is being timed: "Visit 3". */
  title: string;
  description: string;
  days: readonly SlotSheetDay[];
  selectedDayId: string | null;
  windows: readonly SlotSheetWindow[];
  selectedWindowId: string | null;
  onSelectDay?: (dayId: string) => void;
  onSelectWindow?: (windowId: string) => void;
  onCancel?: () => void;
  onConfirm?: () => void;
  /** Where the panel is docked. The caller owns the scrim and the position. */
  className?: string;
}

export function SlotSheet({
  title,
  description,
  days,
  selectedDayId,
  windows,
  selectedWindowId,
  onSelectDay,
  onSelectWindow,
  onCancel,
  onConfirm,
  className,
}: SlotSheetProps) {
  const windowLabelId = useId();
  const chosenWindow = windows.find((slot) => slot.id === selectedWindowId);
  const complete = selectedDayId !== null && chosenWindow?.available === true;

  return (
    <section
      role="dialog"
      aria-label={title}
      className={cn(
        "flex max-h-[85%] flex-col rounded-t-card border border-line/60",
        "bg-surface text-text shadow-overlay",
        className,
      )}
    >
      {/* Decorative. Signals the drag affordance and gives a thumb somewhere to
          land that is not one of the tiles. */}
      <div aria-hidden className="flex shrink-0 justify-center pt-3 pb-1">
        <span className="h-1 w-10 rounded-full bg-line-strong" />
      </div>

      <div className="shrink-0 px-5 pt-2 pb-3">
        <h2 className="text-base font-bold text-text">{title}</h2>
        <p className="mt-1 text-sm leading-5 text-text-secondary">{description}</p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pt-2 pb-1">
        <fieldset className="border-0 p-0">
          <legend className="sr-only">Choose a day</legend>
          {/* A grid, not a list. As full-width rows these would scroll inside a
              sheet that also scrolls, which is how the confirm button ends up
              below the fold; as tiles they all fit and the footer stays where
              the thumb expects it. Geometry is `date-sheet.tsx`'s. */}
          <div className="grid grid-cols-3 gap-2">
            {days.map((day) => {
              const checked = selectedDayId === day.id;
              return (
                <label
                  key={day.id}
                  className={cn(
                    "flex min-h-[68px] cursor-pointer flex-col items-center justify-center gap-0.5",
                    "rounded-card text-center transition-colors duration-fast",
                    "has-[:focus-visible]:outline has-[:focus-visible]:outline-2",
                    "has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring",
                    checked
                      ? "border-2 border-action-secondary bg-selected-surface px-[3px] py-[7px]"
                      : "border border-line bg-surface px-1 py-2 hover:bg-surface-hover",
                  )}
                >
                  <input
                    type="radio"
                    name="visit-day"
                    value={day.id}
                    checked={checked}
                    onChange={() => onSelectDay?.(day.id)}
                    className="sr-only"
                  />
                  <span
                    aria-hidden
                    className={cn(
                      "text-[11px] font-semibold uppercase tracking-[0.06em]",
                      checked ? "text-text-link" : "text-text-muted",
                    )}
                  >
                    {day.name}
                  </span>
                  <span
                    aria-hidden
                    className="text-[17px] font-bold leading-tight tabular-nums text-text"
                  >
                    {day.dayNumber}
                  </span>
                  <span aria-hidden className="text-[11px] text-text-muted">
                    {day.month}
                  </span>
                  {/* The tile is a glyph grid, so the whole answer is spoken here
                      rather than assembled from three abbreviations. */}
                  <span className="sr-only">{day.spoken}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div>
          <div id={windowLabelId}>
            <FieldLabel>Two-hour window</FieldLabel>
          </div>
          <div
            role="radiogroup"
            aria-labelledby={windowLabelId}
            className="grid grid-cols-2 gap-2"
          >
            {windows.map((slot) => {
              const checked = selectedWindowId === slot.id;
              return (
                <label
                  key={slot.id}
                  className={cn(
                    "flex min-h-[56px] flex-col items-center justify-center gap-0.5",
                    "rounded-card text-center transition-colors duration-fast",
                    "has-[:focus-visible]:outline has-[:focus-visible]:outline-2",
                    "has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring",
                    "has-[:disabled]:cursor-not-allowed",
                    !slot.available
                      ? "border border-line bg-surface-sunken p-2"
                      : checked
                        ? "cursor-pointer border-2 border-action-secondary bg-selected-surface p-[7px]"
                        : "cursor-pointer border border-line bg-surface p-2 hover:bg-surface-hover",
                  )}
                >
                  <input
                    type="radio"
                    name="visit-window"
                    value={slot.id}
                    checked={checked}
                    disabled={!slot.available}
                    onChange={() => onSelectWindow?.(slot.id)}
                    className="sr-only"
                  />
                  <span
                    aria-hidden
                    className={cn(
                      "text-sm font-bold tabular-nums",
                      slot.available ? "text-text" : "text-warm-400",
                    )}
                  >
                    {slot.label}
                  </span>
                  {/* Coverage in words beside the time, not a colour on its own:
                      a greyed tile with no sentence is a control that looks
                      broken rather than one that is honestly empty. */}
                  <span
                    aria-hidden
                    className={cn(
                      "text-[11px] font-medium",
                      slot.available ? "text-text-muted" : "text-warm-400",
                    )}
                  >
                    {slot.availability}
                  </span>
                  <span className="sr-only">
                    {`${slot.label}, ${slot.availability}`}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      <div
        className={cn(
          "mt-3 flex shrink-0 flex-wrap justify-end gap-2 border-t border-line",
          "px-5 pt-4 pb-[max(1.625rem,env(safe-area-inset-bottom))]",
        )}
      >
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="secondary" onClick={onConfirm} disabled={!complete}>
          Use this time
        </Button>
      </div>
    </section>
  );
}
