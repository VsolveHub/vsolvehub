import type { ReactNode } from "react";

import { cn } from "./cn";

/**
 * The heading above a group of priced rows.
 *
 * An estimate with six lines and no grouping is a list; the same six lines under
 * "Wiring & points", "Fixtures" and "Panel & safety" is a document somebody can
 * check. The reference estimates all group, and the running subtotal on the
 * right is what makes a group worth having — it lets a partner see where the
 * money actually is without adding anything up.
 *
 * `trailing` takes either a subtotal or a count, never both. Two numbers on one
 * band forces the reader to work out which one they are looking at, and the
 * answer differs per screen: a composer wants the subtotal, a catalogue wants
 * the count.
 *
 * This is a heading, not a landmark. It renders no heading tag of its own —
 * the caller owns the document outline and passes whatever level fits, because
 * a band nested inside a section that already has an `h2` must not be a second
 * `h2`.
 */

export interface SectionBandProps {
  /** The group name. Rendered uppercase; pass it in sentence case. */
  children: ReactNode;
  /** A subtotal or a count, right-aligned. Omit for an unnumbered group. */
  trailing?: ReactNode;
  /**
   * Tones the trailing value. `total` is the default and reads as money;
   * `muted` is for counts, which should not compete with the amounts below.
   */
  trailingTone?: "total" | "muted";
  className?: string;
}

export function SectionBand({
  children,
  trailing,
  trailingTone = "total",
  className,
}: SectionBandProps) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 pb-2", className)}>
      <span className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-text-muted">
        {children}
      </span>

      {trailing !== undefined ? (
        <span
          className={cn(
            "shrink-0 text-[12.5px] font-extrabold tabular-nums",
            trailingTone === "total" ? "text-text-link" : "text-text-muted",
          )}
        >
          {trailing}
        </span>
      ) : null}
    </div>
  );
}
