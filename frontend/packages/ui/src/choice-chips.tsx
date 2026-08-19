"use client";

import { useId } from "react";

import { cn } from "./cn";

/**
 * One answer from a short, named list — as pills that wrap, or as a joined bar.
 *
 * The booking screens ask this shape of question repeatedly: what will the crew
 * do, how do they reach the work, how firm is the date, what kind of space is
 * it. Each has three to six options whose labels are two or three words, and a
 * `<select>` throws all of them behind a tap while a column of stacked cards
 * spends a third of the screen on four words.
 *
 * ## It is a radio group, not buttons
 *
 * `<input type="radio">` inside a `<label>`, with the input visually hidden and
 * the label styled. That buys the platform's own behaviour: one answer enforced,
 * arrow keys moving between options, the group announced as a group with its
 * position ("2 of 5"), and a genuine focus ring on the focused option. Every
 * hand-rolled version made of `<button>`s has to re-implement all four and
 * usually re-implements two.
 *
 * The focus ring is on the label via `has-[:focus-visible]`, so keyboard focus
 * is visible on the thing the customer can see rather than on a hidden input.
 *
 * ## Selection is never carried by colour alone
 *
 * The selected chip changes its border weight and its font weight as well as its
 * fill, and the underlying radio is genuinely checked — so the state survives
 * greyscale, forced-colours mode and a screen reader. Plan 03's rule, and the
 * one that a pill group is most likely to break.
 */

export interface ChoiceChipOption {
  value: string;
  label: string;
  /** Optional second line. Only rendered in `wrap` layout — a bar has no room. */
  description?: string | null;
}

export interface ChoiceChipsProps {
  /** Names the group for assistive technology. Usually the question. */
  label: string;
  /** Distinguishes the radios when several groups share a page. */
  name: string;
  options: readonly ChoiceChipOption[];
  value: string | null;
  onChange: (value: string) => void;
  /**
   * `wrap` — pills that flow onto as many lines as they need. The default, and
   * the only one that survives a long server-authored label.
   *
   * `bar` — one joined row of equal segments. For two to four *short*, mutually
   * exclusive options that read as a scale ("Exact / ± a week / ± a month"). It
   * does not wrap, so never point it at a list whose labels come from the
   * catalogue.
   */
  layout?: "wrap" | "bar";
  disabled?: boolean;
  className?: string;
}

const BASE = cn(
  "relative flex cursor-pointer items-center justify-center gap-1 text-center",
  "transition-colors duration-fast ease-out",
  // The ring lands on the label because the input it belongs to is invisible.
  "has-[:focus-visible]:outline has-[:focus-visible]:outline-2",
  "has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring",
  "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60",
);

/** 44px tall in both layouts — these are primary answers, not dense filters. */
const SELECTED = "border-selected bg-selected-surface font-semibold text-text";
const UNSELECTED = "border-line-strong bg-surface font-medium text-text-secondary hover:bg-surface-hover hover:text-text";

export function ChoiceChips({
  label,
  name,
  options,
  value,
  onChange,
  layout = "wrap",
  disabled = false,
  className,
}: ChoiceChipsProps) {
  const labelId = useId();

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      className={cn(
        layout === "wrap" ? "flex flex-wrap gap-2" : "flex w-full",
        className,
      )}
    >
      {/* Names the group without occupying a line. The visible question is the
          caller's `Field` label, and repeating it here would be read twice. */}
      <span id={labelId} className="sr-only">
        {label}
      </span>

      {options.map((option, index) => {
        const checked = value === option.value;
        const isFirst = index === 0;
        const isLast = index === options.length - 1;

        return (
          <label
            key={option.value}
            className={cn(
              BASE,
              checked ? SELECTED : UNSELECTED,
              layout === "wrap"
                ? cn(
                    "min-h-11 rounded-control border px-4 py-2 text-sm",
                    option.description ? "flex-col items-start gap-0.5 text-left" : "",
                  )
                : cn(
                    // A joined bar: one shared edge between segments rather than
                    // two stacked borders, and only the outer corners rounded.
                    "min-h-11 flex-1 basis-0 border px-3 py-2 text-sm",
                    !isFirst && "-ml-px",
                    isFirst && "rounded-l-control",
                    isLast && "rounded-r-control",
                    // The selected segment lifts above its neighbours so its
                    // border is not half-covered by theirs.
                    checked && "z-10",
                  ),
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={checked}
              disabled={disabled}
              onChange={() => onChange(option.value)}
              // `sr-only` rather than `hidden`: a hidden input is not focusable,
              // which would take the arrow keys and the focus ring with it.
              className="sr-only"
            />
            <span>{option.label}</span>
            {option.description && layout === "wrap" ? (
              <span className="text-xs font-normal leading-5 text-text-secondary">
                {option.description}
              </span>
            ) : null}
          </label>
        );
      })}
    </div>
  );
}
