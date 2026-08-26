"use client";

import { cn } from "@vsolve/ui";
import type { LucideIcon } from "lucide-react";

/**
 * A choice question as a grid of picture-first tiles.
 *
 * The M2-revamp's rule for screen 1: the Customer recognises, they do not
 * read. A tile is an icon, a short label and — when the catalogue published
 * one — a single clamped line of description. Everything longer belongs in a
 * dialog (see `ServicePicker`) or nowhere.
 *
 * ## The icon can be absent, and the tile still reads
 *
 * `iconForOption` matches keywords and returns null for an option it does not
 * recognise. The tile then shows the option's first letter in the same tinted
 * block. A letter is plain; a wrong pictogram is misleading — see the icon
 * model's own note.
 *
 * ## One radiogroup, native inputs
 *
 * Same pattern as the visit-plan chooser: an `sr-only` radio per tile so focus,
 * arrow keys and the accessible name all come from the platform, and the
 * selection state is also in words (`aria-checked` plus the ring) rather than
 * colour alone.
 */

export interface OptionTileItem {
  value: string;
  label: string;
  /** The catalogue's one-liner, when it published one. Clamped to one line. */
  description?: string;
  icon: LucideIcon | null;
}

export interface OptionTilesProps {
  /** The question, for the group's accessible name. */
  label: string;
  /** The question code, used as the radio group name. */
  name: string;
  options: readonly OptionTileItem[];
  value: string | null;
  onChange: (value: string) => void;
  /**
   * Tiles per row on a phone. Two fits labels of most lengths; three suits
   * short-word scales like Yes/No/Not sure.
   */
  columns?: 2 | 3;
}

export function OptionTiles({
  label,
  name,
  options,
  value,
  onChange,
  columns = 2,
}: OptionTilesProps) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("grid gap-2.5", columns === 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-3")}
    >
      {options.map((option) => {
        const checked = value === option.value;
        const Icon = option.icon;

        return (
          <label
            key={option.value}
            className={cn(
              "flex cursor-pointer flex-col items-start gap-2 rounded-[14px] bg-surface p-3 text-left",
              "transition-colors duration-fast",
              "has-[:focus-visible]:outline has-[:focus-visible]:outline-2",
              "has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring",
              // The selected border thickens by a pixel and the padding loses
              // one, so choosing does not resize the tile and shift the grid.
              checked
                ? "border-2 border-action-secondary p-[11px]"
                : "border border-line hover:bg-surface-hover",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={checked}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />

            <span
              aria-hidden
              className={cn(
                "inline-flex h-10 w-10 items-center justify-center rounded-[11px]",
                checked
                  ? "bg-action-secondary text-action-secondary-text"
                  : "bg-surface-sunken text-text-secondary",
              )}
            >
              {Icon !== null ? (
                <Icon size={20} strokeWidth={2} />
              ) : (
                <span className="text-base font-bold">{monogram(option.label)}</span>
              )}
            </span>

            <span className="min-w-0">
              <span
                className={cn(
                  "block text-[13.5px] leading-[18px] text-text",
                  checked ? "font-bold" : "font-semibold",
                )}
              >
                {option.label}
              </span>
              {option.description !== undefined ? (
                <span className="mt-0.5 line-clamp-1 block text-[11.5px] leading-4 text-text-muted">
                  {option.description}
                </span>
              ) : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}

/** The first letter that exists, uppercased — "fan repair" -> "F". */
function monogram(label: string): string {
  const letter = label.trim().charAt(0);
  return letter === "" ? "•" : letter.toUpperCase();
}
