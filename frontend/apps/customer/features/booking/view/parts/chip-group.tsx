"use client";

import { cn } from "@vsolve/ui";
import { useId } from "react";

/**
 * One answer from a list, as pills that wrap.
 *
 * ## Why the descriptions do not come to the phone
 *
 * The catalogue publishes a sentence per option and the desktop form renders it,
 * because on a wide screen it costs nothing and it is the difference between
 * choosing the work and guessing which label is closest. On a phone the same
 * data is eight two-line cards — a full screen of scrolling to answer the first
 * of six questions, which is where people abandon the form.
 *
 * So the phone shows labels only. The information is not deleted: anything that
 * genuinely needs explaining belongs in a `Disclosure` under the group, once,
 * rather than inline against every option.
 *
 * ## Still radios
 *
 * Same reasoning as the desktop chips: `<input type="radio">` inside a `<label>`
 * buys one-answer enforcement, arrow-key movement, "2 of 5" position
 * announcements and a real focus ring, none of which a row of `<button>`s gets
 * without re-implementing all four.
 *
 * Selection is carried by fill **and** by the checked input, so it survives
 * greyscale and forced-colours mode rather than being a colour swap.
 */

export interface ChipOption {
  value: string;
  label: string;
}

export interface ChipGroupProps {
  /** Names the group for assistive technology. Usually the question. */
  label: string;
  /** Distinguishes the radios from any other group on the page. */
  name: string;
  options: readonly ChipOption[];
  value: string | null;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function ChipGroup({
  label,
  name,
  options,
  value,
  onChange,
  disabled = false,
}: ChipGroupProps) {
  const labelId = useId();

  return (
    <div role="radiogroup" aria-labelledby={labelId} className="flex flex-wrap gap-2">
      {/* The visible question is the caller's `FieldLabel`; repeating it here
          would have it announced twice. */}
      <span id={labelId} className="sr-only">
        {label}
      </span>

      {options.map((option) => {
        const checked = value === option.value;
        return (
          <label
            key={option.value}
            className={cn(
              "inline-flex h-10 cursor-pointer items-center rounded-full border px-[15px]",
              "text-[13px] font-semibold transition-colors duration-fast",
              "has-[:focus-visible]:outline has-[:focus-visible]:outline-2",
              "has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring",
              "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60",
              checked
                ? "border-navy-900 bg-navy-900 text-text-inverse"
                : "border-warm-300 bg-surface text-text-secondary hover:border-line-strong",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={checked}
              disabled={disabled}
              onChange={() => onChange(option.value)}
              // `sr-only` and never `hidden`: a hidden input is not focusable,
              // which takes the arrow keys and the focus ring with it.
              className="sr-only"
            />
            {option.label}
          </label>
        );
      })}
    </div>
  );
}
