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
 * ## One group, native inputs
 *
 * Same pattern as the visit-plan chooser: an `sr-only` input per tile so focus,
 * arrow keys and the accessible name all come from the platform, and the
 * selection state is also in words (`aria-checked` plus the ring) rather than
 * colour alone.
 *
 * ## Single or multi
 *
 * A single-choice question is a radiogroup with one `value`; a multi-select
 * question ("What should we decorate?") passes `values` and `onToggle` instead
 * and renders checkboxes. Same tile, same grid — only the input type and the
 * group role change, so the two kinds of question look alike on screen.
 */

export interface OptionTileItem {
  value: string;
  label: string;
  /** The catalogue's one-liner, when it published one. Clamped to one line. */
  description?: string;
  icon: LucideIcon | null;
}

interface OptionTilesBaseProps {
  /** The question, for the group's accessible name. */
  label: string;
  /** The question code, used as the input group name. */
  name: string;
  options: readonly OptionTileItem[];
  /**
   * Tiles per row on a phone. Two fits labels of most lengths; three suits
   * short-word scales like Yes/No/Not sure.
   */
  columns?: 2 | 3;
}

export interface SingleOptionTilesProps extends OptionTilesBaseProps {
  value: string | null;
  onChange: (value: string) => void;
  values?: undefined;
  onToggle?: undefined;
}

export interface MultiOptionTilesProps extends OptionTilesBaseProps {
  values: readonly string[];
  onToggle: (value: string) => void;
  value?: undefined;
  onChange?: undefined;
}

export type OptionTilesProps = SingleOptionTilesProps | MultiOptionTilesProps;

export function OptionTiles(props: OptionTilesProps) {
  const { label, name, options, columns = 2 } = props;
  const multiple = props.values !== undefined;

  return (
    <div
      role={multiple ? "group" : "radiogroup"}
      aria-label={label}
      className={cn("grid gap-2.5", columns === 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-3")}
    >
      {options.map((option) => {
        const checked = multiple
          ? props.values.includes(option.value)
          : props.value === option.value;
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
              type={multiple ? "checkbox" : "radio"}
              name={name}
              value={option.value}
              checked={checked}
              onChange={() =>
                multiple ? props.onToggle(option.value) : props.onChange(option.value)
              }
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

/** Flip one value in a multi-select answer. Exported for the screens' reducers. */
export function toggleValue(values: readonly string[], value: string): string[] {
  return values.includes(value)
    ? values.filter((entry) => entry !== value)
    : [...values, value];
}

/** The first letter that exists, uppercased — "fan repair" -> "F". */
function monogram(label: string): string {
  const letter = label.trim().charAt(0);
  return letter === "" ? "•" : letter.toUpperCase();
}
