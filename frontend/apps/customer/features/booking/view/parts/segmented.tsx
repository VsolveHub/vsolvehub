"use client";

import { cn } from "@vsolve/ui";
import { useId } from "react";

/**
 * Two to four mutually exclusive options as one joined track.
 *
 * For a short scale where every option is a word or two and the set reads as a
 * range — ground / lift / stairs, exact / a week / a month. It is the control a
 * phone user recognises from the OS, and unlike chips it makes the options look
 * like *one* question rather than several.
 *
 * ## It does not wrap, so it is never pointed at catalogue text
 *
 * Segments divide the width evenly and truncate. That is fine for an authored
 * scale of three and wrong for anything whose labels come from the server, where
 * one long option silently clips. Use `ChipGroup` for that.
 *
 * Radios again, for the same reason as everywhere else in this flow: arrow keys,
 * one-answer enforcement and position announcements are the platform's, not
 * something worth re-implementing per control.
 */

export interface SegmentedOption {
  value: string;
  label: string;
}

export interface SegmentedProps {
  label: string;
  /**
   * The id of a heading already on screen that names this group.
   *
   * When given, the track points at that instead of repeating the label in its own
   * `sr-only` span — a control sitting under a visible `FieldLabel` otherwise announces
   * its question twice to a screen reader while a sighted reader sees it once.
   */
  labelledBy?: string;
  name: string;
  options: readonly SegmentedOption[];
  value: string | null;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function Segmented({
  label,
  labelledBy,
  name,
  options,
  value,
  onChange,
  disabled = false,
}: SegmentedProps) {
  const ownLabelId = useId();
  const labelId = labelledBy ?? ownLabelId;

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      className="flex gap-[5px] rounded-xl bg-warm-200 p-1"
    >
      {labelledBy === undefined ? (
        <span id={labelId} className="sr-only">
          {label}
        </span>
      ) : null}

      {options.map((option) => {
        const checked = value === option.value;
        return (
          <label
            key={option.value}
            className={cn(
              "flex h-10 flex-1 cursor-pointer items-center justify-center rounded-[9px] px-1",
              "text-center text-[13px] transition-colors duration-fast",
              "has-[:focus-visible]:outline has-[:focus-visible]:outline-2",
              "has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring",
              "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60",
              checked
                ? "bg-surface font-bold text-text shadow-sm"
                : "bg-transparent font-semibold text-warm-600",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={checked}
              disabled={disabled}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            <span className="truncate">{option.label}</span>
          </label>
        );
      })}
    </div>
  );
}
