"use client";

import { cn } from "@vsolve/ui";

/**
 * Where the customer is in the four-step brief.
 *
 * ## Why a meter and not the numbered dots the desktop uses
 *
 * `Stepper` names each step, which is right in a column that has room for four
 * labels. At 390px those labels are hidden below `sm`, and a hidden label is
 * removed from the accessibility tree as well as the screen — so the phone got
 * "1 2 3 4" announced as bare digits, which is the device that needs it most
 * saying the least.
 *
 * Four bars and a "2 of 4" in the header say the same thing in one line, and the
 * position is announced as a sentence rather than as a number in a list.
 *
 * Navy, not orange. A5 is the considered path and its whole chrome says so; the
 * one orange thing in this flow is the held-slot eyebrow, and it is not a
 * control.
 */

export interface StepMeterProps {
  /** 1-based. */
  step: number;
  total: number;
}

export function StepMeter({ step, total }: StepMeterProps) {
  return (
    <div
      role="img"
      // One sentence rather than four announcements. A progress indicator that
      // reads out per-bar is noise on the screen it is meant to orient.
      aria-label={`Step ${step} of ${total}`}
      className="flex gap-[5px] px-3 pb-[11px]"
    >
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          aria-hidden
          className={cn(
            "h-1 flex-1 rounded-full",
            index < step ? "bg-action-secondary" : "bg-warm-300",
          )}
        />
      ))}
    </div>
  );
}
