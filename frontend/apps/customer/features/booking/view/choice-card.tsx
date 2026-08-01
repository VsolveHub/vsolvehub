"use client";

import { cn } from "@vsolve/ui";
import type { ReactNode } from "react";

/**
 * A large selectable card backed by a real radio input.
 *
 * Used for booking type, slots and providers — every "pick one of these" moment
 * in the workspace. Built on a native radio rather than buttons with
 * `aria-pressed` so arrow-key navigation, form semantics and the roving focus
 * of a radiogroup all come for free and behave the way a screen-reader user
 * expects.
 *
 * The input is visually hidden but not `display: none`, so it remains focusable
 * and the focus ring can be drawn on the card.
 */

export interface ChoiceCardProps {
  name: string;
  value: string;
  checked: boolean;
  onSelect: (value: string) => void;
  disabled?: boolean;
  title: string;
  /** Short supporting line. */
  description?: string | null;
  /** Right-aligned content: a price difference, an availability note. */
  trailing?: ReactNode;
  /** Extra content below the description. */
  children?: ReactNode;
  /** Announced in place of the title when the card needs more context. */
  ariaLabel?: string;
  className?: string;
}

export function ChoiceCard({
  name,
  value,
  checked,
  onSelect,
  disabled = false,
  title,
  description,
  trailing,
  children,
  ariaLabel,
  className,
}: ChoiceCardProps) {
  return (
    <label
      className={cn(
        "relative flex cursor-pointer items-start gap-3 rounded-plate border p-4",
        // 44px minimum target (plan 03) — comfortably exceeded, but stated so a
        // future compaction does not quietly break it.
        "min-h-11",
        "transition-colors duration-fast ease-out",
        checked
          ? "border-action bg-signal-50"
          : "border-line-strong bg-surface hover:border-warm-600",
        disabled && "cursor-not-allowed border-line bg-surface-sunken",
        // Focus is drawn on the card because the input itself is invisible.
        "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-action",
        className,
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={() => onSelect(value)}
        className="sr-only"
      />

      <span
        aria-hidden
        className={cn(
          "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2",
          checked ? "border-action" : "border-line-strong",
          disabled && "border-line",
        )}
      >
        {checked ? <span className="h-2.5 w-2.5 rounded-full bg-action" /> : null}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span
            className={cn(
              "font-semibold text-text",
              disabled && "text-text-muted",
            )}
          >
            {title}
          </span>
          {trailing ? <span className="shrink-0 text-sm">{trailing}</span> : null}
        </span>

        {description ? (
          <span
            className={cn(
              "mt-0.5 block text-sm text-text-secondary",
              disabled && "text-text-muted",
            )}
          >
            {description}
          </span>
        ) : null}

        {children}
      </span>
    </label>
  );
}
