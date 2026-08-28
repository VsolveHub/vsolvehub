"use client";

import { Button, Sheet, cn } from "@vsolve/ui";
import { useState } from "react";

/**
 * Choosing a reporting time, as a grid of half hours.
 *
 * The same shape as `DateSheet` and for the same reasons: `<input type="time">`
 * renders a different picker on every platform, shows `--:-- --` as though it
 * were a value, and on some Android builds is a spinner that takes six gestures
 * to reach five o'clock. A grid of the times anybody actually books an event
 * crew for answers the question in one tap, and it commits on confirm rather
 * than on tap, so Escape, the backdrop and Cancel all leave the committed value
 * alone.
 */

export interface TimeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The committed value as `HH:MM`, or null. */
  value: string | null;
  /** The offered times, as `HH:MM`, in order. */
  options: readonly string[];
  /** How to print one option. The caller owns the locale. */
  format: (time: string) => string;
  onSelect: (time: string) => void;
  title?: string;
  description?: string;
}

export function TimeSheet({
  open,
  onOpenChange,
  value,
  options,
  format,
  onSelect,
  title = "Reporting time",
  description = "When the crew should be at the venue, ready to work.",
}: TimeSheetProps) {
  const [pending, setPending] = useState<string | null>(value);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) setPending(value);
        onOpenChange(next);
      }}
      title={title}
      description={description}
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
            Use this time
          </Button>
        </>
      }
    >
      <fieldset className="border-0 p-0 pb-1">
        <legend className="sr-only">Choose a reporting time</legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {options.map((time) => {
            const checked = pending === time;
            return (
              <label
                key={time}
                className={cn(
                  "flex min-h-12 cursor-pointer items-center justify-center rounded-[14px] border px-1 py-2",
                  "text-[15px] font-semibold tabular-nums transition-colors duration-fast",
                  "has-[:focus-visible]:outline has-[:focus-visible]:outline-2",
                  "has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring",
                  checked
                    ? "border-2 border-action-secondary bg-selected-surface text-text"
                    : "border-line bg-surface text-text-secondary hover:bg-surface-hover",
                )}
              >
                <input
                  type="radio"
                  name="reporting-time"
                  value={time}
                  checked={checked}
                  onChange={() => setPending(time)}
                  className="sr-only"
                />
                {format(time)}
              </label>
            );
          })}
        </div>
      </fieldset>
    </Sheet>
  );
}
