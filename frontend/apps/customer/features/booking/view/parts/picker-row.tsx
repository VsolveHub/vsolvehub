"use client";

import type { ReactNode } from "react";
import { cn } from "@vsolve/ui";

/**
 * A value that is set somewhere else — a sheet, a dialog — as one tappable row.
 *
 * Two of them on the job form: the start date and the address. Both replace
 * controls that were wrong on a phone. The date was an `<input type="date">`,
 * which renders as `dd-mm-yyyy` until it is filled and opens a different picker
 * on every platform; the address was a promoted card sized for a desktop column.
 *
 * ## The whole row is the button
 *
 * Not a row with a button in it. The target is the width of the screen rather
 * than the width of the word "Change", and the trailing affordance is
 * `aria-hidden` decoration inside the same control — a nested `<button>` is
 * invalid markup, and two focus stops that do the same thing is worse
 * navigation rather than more of it.
 *
 * The accessible name states what the control does **and** what it currently
 * holds, because "Change" alone leaves a screen-reader user hunting for the
 * value somewhere else on the screen.
 */

export interface PickerRowProps {
  /** The caption above the value: "Start from", "Where". */
  label: string;
  /** The resolved value, or null when nothing is chosen yet. */
  value: string | null;
  /** What to show in place of a value. Never a blank row. */
  placeholder: string;
  onOpen: () => void;
  /** Optional icon to render on the leading side of the row. */
  icon?: ReactNode;
  /**
   * The trailing affordance.
   *
   * `chevron` for a row that opens a picker of many equivalent values — a date.
   * `word` for one that opens a different surface entirely, where naming the
   * action reads better than an arrow.
   */
  trailing?: "chevron" | "word";
  /** The word, when `trailing` is `word`. Changes with state: Choose / Change. */
  trailingWord?: string;
  /** Draws the row with the accent border. For the one input that opens a dialog. */
  emphasis?: boolean;
  disabled?: boolean;
}

export function PickerRow({
  label,
  value,
  placeholder,
  onOpen,
  icon,
  trailing = "chevron",
  trailingWord,
  emphasis = false,
  disabled = false,
}: PickerRowProps) {
  const word = trailingWord ?? (value === null ? "Choose" : "Change");

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={disabled}
      aria-label={value === null ? `${label}. ${placeholder}` : `${label}. Currently ${value}. Change`}
      className={cn(
        "flex w-full items-center gap-3 rounded-[14px] border px-3.5 py-[13px] text-left",
        "transition-colors duration-fast disabled:cursor-not-allowed disabled:opacity-60",
        emphasis
          ? "border-[1.5px] border-action bg-action-surface hover:bg-signal-100"
          : "border-line bg-surface hover:bg-surface-hover",
      )}
    >
      {icon ? (
        <span
          aria-hidden
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-control",
            emphasis ? "bg-signal-200 text-action" : "bg-surface-sunken text-text-muted",
          )}
        >
          {icon}
        </span>
      ) : null}
      <span aria-hidden className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-xs font-semibold",
            emphasis ? "text-warning-text" : "text-text-muted",
          )}
        >
          {label}
        </span>
        {/* `truncate` needs the min-w-0 above it. A long Hyderabad address is
            the ordinary case here, not the edge. */}
        <span
          className={cn(
            "mt-0.5 block truncate text-[15px] font-semibold",
            value === null ? "text-text-muted" : "text-text",
          )}
        >
          {value ?? placeholder}
        </span>
      </span>

      {trailing === "word" ? (
        <span
          aria-hidden
          className={cn(
            "shrink-0 text-[13px] font-semibold",
            emphasis ? "text-warning-text" : "text-text-link",
          )}
        >
          {word}
        </span>
      ) : (
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 shrink-0 text-text-muted"
        >
          <path d="M7.5 4.5 13 10l-5.5 5.5" />
        </svg>
      )}
    </button>
  );
}
