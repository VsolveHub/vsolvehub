"use client";

import { cn } from "@vsolve/ui";
import { useId } from "react";

/**
 * A count, as a card with the number as the loudest thing on it.
 *
 * ## Why this is not the shared `QuantityStepper`
 *
 * The desktop stepper puts its label on the left and its controls on the right,
 * which is right in a form column and wrong in a two-up grid on a phone: the
 * number ends up the smallest element in a control whose entire purpose is that
 * number. Here the label is a caption above, and the value is 26px between two
 * round buttons — the shape a phone user reads at arm's length.
 *
 * Same semantics as the desktop one, deliberately: `role="group"` with an
 * accessible name, buttons that name what they change rather than which
 * direction they move, and an `<output>` that announces the result so pressing
 * once says "4 people" instead of saying nothing.
 *
 * ## The buttons are 40px inside a 44px row
 *
 * The card is the touch target and it is comfortably over the minimum; the
 * glyph buttons sit inside it. A 44px circle beside a 26px numeral makes the
 * control read as two buttons with a label, which is the opposite of the
 * emphasis wanted.
 */

export interface CounterCardProps {
  /** What is being counted: "People", "Days". */
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** Announced after the number — "people" — so the value is self-describing. */
  unit: string;
  disabled?: boolean;
}

const GLYPH = cn(
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border",
  "text-xl leading-none transition-colors duration-fast",
  "disabled:cursor-not-allowed disabled:border-line disabled:text-warm-400",
);

export function CounterCard({
  label,
  value,
  onChange,
  min = 1,
  max,
  unit,
  disabled = false,
}: CounterCardProps) {
  const labelId = useId();
  const atMin = value <= min;
  const atMax = max !== undefined && value >= max;

  return (
    <div className="rounded-[14px] border border-line bg-surface px-[13px] py-3">
      <p id={labelId} className="text-xs font-semibold text-text-muted">
        {label}
      </p>

      <div role="group" aria-labelledby={labelId} className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={disabled || atMin}
          aria-label={`Fewer ${unit}`}
          // Clamped as well as disabled: a key repeat or a double fire must not
          // push the value under the floor and leave the caller to notice.
          onClick={() => onChange(Math.max(min, value - 1))}
          className={cn(GLYPH, "border-warm-300 text-text-secondary hover:bg-surface-hover")}
        >
          <span aria-hidden>−</span>
        </button>

        <output aria-live="polite" className="text-[26px] font-bold tracking-[-0.02em] tabular-nums text-text">
          <span aria-hidden>{value}</span>
          <span className="sr-only">{`${value} ${unit}`}</span>
        </output>

        <button
          type="button"
          disabled={disabled || atMax}
          aria-label={`More ${unit}`}
          onClick={() => onChange(max === undefined ? value + 1 : Math.min(max, value + 1))}
          className={cn(GLYPH, "border-navy-900 text-navy-900 hover:bg-navy-50")}
        >
          <span aria-hidden>+</span>
        </button>
      </div>
    </div>
  );
}
