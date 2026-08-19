"use client";

import { useId } from "react";

import { cn } from "./cn";

/**
 * A small whole number the customer sets by pressing rather than typing.
 *
 * How many people, for how many days, how many of a service — the values that
 * are almost always two or three, and where a numeric text field asks the
 * customer to select-all-and-retype to change 3 to 4. It is also the control
 * that sits next to a live price, so pressing it is the most repeated gesture on
 * the crew booking screen.
 *
 * ## Why this is not an `<input type="number">`
 *
 * The spinner a browser draws is roughly 12px tall, differs on every engine, and
 * on a phone is not there at all. The house pattern was already a labelled pair
 * of buttons around an `<output>` — the checkout cart line has used it since
 * Milestone 1 — so this is that pattern as one component instead of one per call
 * site.
 *
 * ## What the markup has to carry
 *
 * A `role="group"` with an accessible name, because two loose buttons and a
 * number are three unrelated things to a screen reader. The buttons name the
 * *quantity* they change, not the direction they move it: "Add a person" is
 * useful where "Increase" is not, once there are two steppers on one screen.
 *
 * The value is an `<output>` with `aria-live="polite"`, so pressing a button
 * announces the result. That is the whole reason the buttons do not also carry
 * the value in their labels — it would be announced twice.
 *
 * ## Bounds are stated, not enforced by silence
 *
 * At the minimum the decrement button is `disabled` rather than absent, so the
 * control does not change width at the edge of its range and the customer can
 * see there is a floor. `min` defaults to 1: zero people is not a smaller
 * booking, it is no booking, and a stepper that quietly reaches it hands the
 * server an unpriceable request.
 */

export interface QuantityStepperProps {
  /** Names the group. Say what is being counted: "People", "Days". */
  label: string;
  value: number;
  onChange: (value: number) => void;
  /** Lowest allowed value. One by default — see the note above. */
  min?: number;
  /** Highest allowed value, if the caller has one. */
  max?: number;
  /**
   * The buttons' accessible names, as whole phrases.
   *
   * Required, because the generic fallback ("Increase People") is exactly the
   * announcement this component exists to improve on, and a default would mean
   * most call sites keep it.
   */
  decrementLabel: string;
  incrementLabel: string;
  /** Renders under the control. For "A supervisor is included with every crew." */
  hint?: string;
  disabled?: boolean;
  /**
   * Suffix read after the number, for the announcement only.
   *
   * "3" announces as "3 people" without putting the word on screen, where the
   * group's own label already carries it.
   */
  unit?: string;
  className?: string;
}

/**
 * 44px square, per the touch-target rule, at every breakpoint.
 *
 * Deliberately not the `Button` component. `Button`'s smallest size is 36px and
 * its `md` is a 44px-tall pill with horizontal padding sized for a word — a
 * square glyph target is a different control, and forcing it through `Button`
 * meant overriding half of what `Button` sets.
 */
const CONTROL = cn(
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control",
  "border border-line-strong bg-surface text-text",
  "transition-colors duration-fast ease-out",
  "hover:bg-surface-hover active:bg-surface-sunken",
  "disabled:cursor-not-allowed disabled:border-line disabled:bg-surface disabled:text-warm-400",
);

export function QuantityStepper({
  label,
  value,
  onChange,
  min = 1,
  max,
  decrementLabel,
  incrementLabel,
  hint,
  disabled = false,
  unit,
  className,
}: QuantityStepperProps) {
  const labelId = useId();
  const hintId = useId();

  const atMin = value <= min;
  const atMax = max !== undefined && value >= max;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center justify-between gap-4">
        <span id={labelId} className="text-sm font-semibold text-text">
          {label}
        </span>

        <div
          role="group"
          aria-labelledby={labelId}
          aria-describedby={hint ? hintId : undefined}
          className="flex items-center gap-1"
        >
          <button
            type="button"
            className={CONTROL}
            disabled={disabled || atMin}
            aria-label={decrementLabel}
            // Clamped here as well as disabled above. A keyboard repeat or a
            // double-fire cannot push the value under the floor and leave the
            // caller to notice.
            onClick={() => onChange(Math.max(min, value - 1))}
          >
            <span aria-hidden className="text-lg leading-none">
              −
            </span>
          </button>

          <output
            aria-live="polite"
            className="min-w-10 text-center text-base font-bold tabular-nums text-text"
          >
            <span aria-hidden>{value}</span>
            <span className="sr-only">
              {unit ? `${value} ${unit}` : String(value)}
            </span>
          </output>

          <button
            type="button"
            className={CONTROL}
            disabled={disabled || atMax}
            aria-label={incrementLabel}
            onClick={() => onChange(max === undefined ? value + 1 : Math.min(max, value + 1))}
          >
            <span aria-hidden className="text-lg leading-none">
              +
            </span>
          </button>
        </div>
      </div>

      {hint ? (
        <p id={hintId} className="text-sm leading-6 text-text-secondary">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
