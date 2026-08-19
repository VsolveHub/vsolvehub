"use client";

import { cn } from "@vsolve/ui";
import type { ReactNode } from "react";

/**
 * Something the customer may add and does not have to.
 *
 * ## Why it looks different from every other row
 *
 * A dashed border and no fill. Every filled card on these screens is an answer;
 * this is an invitation, and drawing it identically would make the brief look
 * four fields longer than it is. On the "must finish by" row specifically, the
 * old design asked for a hard deadline in a solid required-looking field with
 * forty words of explanation about closing dates underneath — and a customer who
 * read that as "roughly when I'd like it" had their request expire on the day
 * they named.
 *
 * So it is optional-looking, and the consequence is six words rather than forty:
 * vendors see it as a hard deadline.
 *
 * ## Once answered, it stops being an invitation
 *
 * The caller swaps in its filled form. That is deliberate rather than a styling
 * toggle here: an answered optional field is an ordinary answer and should read
 * like the rows above it, with its own remove affordance.
 */

export interface OptionalRowProps {
  title: string;
  /** The one line under it. Six words, not forty. */
  description: string;
  onAdd: () => void;
  disabled?: boolean;
}

export function OptionalRow({ title, description, onAdd, disabled = false }: OptionalRowProps) {
  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-3 rounded-[14px] border border-dashed border-warm-400",
        "bg-transparent px-3.5 py-[13px] text-left transition-colors duration-fast",
        "hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-text">{title}</span>
        <span className="mt-0.5 block text-[12.5px] leading-5 text-text-muted">
          {description}
        </span>
      </span>
      <span
        aria-hidden
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-warm-400 text-lg leading-none text-text-secondary"
      >
        +
      </span>
    </button>
  );
}

/**
 * The same row once it holds an answer, with the way back out.
 *
 * The remove control is a sibling of the value rather than nested inside a
 * button wrapping the whole row — a nested `<button>` is invalid markup and
 * makes "clear this" and "change this" the same tap.
 */
export function AnsweredOptionalRow({
  title,
  value,
  onRemove,
  children,
}: {
  title: string;
  value: string;
  onRemove: () => void;
  /** Rendered under the row, for an inline picker. */
  children?: ReactNode;
}) {
  return (
    <div className="rounded-[14px] border border-line bg-surface px-3.5 py-[13px]">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-text-muted">{title}</p>
          <p className="mt-0.5 truncate text-[15px] font-semibold text-text">{value}</p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex h-11 shrink-0 items-center rounded-control px-2 text-[13px] font-semibold text-text-link hover:bg-surface-hover"
        >
          Remove
          <span className="sr-only">{` ${title.toLowerCase()}`}</span>
        </button>
      </div>
      {children}
    </div>
  );
}
