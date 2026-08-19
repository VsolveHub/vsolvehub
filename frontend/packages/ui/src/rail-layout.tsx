import type { ReactNode } from "react";

import { cn } from "./cn";

/**
 * The two-column booking shape: the thing you are changing, and what it costs.
 *
 * Five screens use it — the crew form beside its live rate, the matching screen
 * beside its request summary, the confirmation beside its fee, the project brief
 * beside its checklist, the visit plan beside its amount. Cart and checkout got
 * here first; this is that layout as one component so the sixth screen inherits
 * the behaviour rather than re-deriving the class list.
 *
 * ## Why the rail is an `<aside>` that comes second
 *
 * DOM order is reading order and tab order. The customer is filling in a form;
 * the money is a consequence of it. Putting the rail first in the markup so it
 * could be styled on the right would make a screen reader and a keyboard read
 * the answer before the question, and would put the price rail between the page
 * heading and the first field.
 *
 * That ordering is also what makes the collapse correct for free: below `lg`
 * there is one column, and the rail is already after the content, which is where
 * the mobile designs put it.
 *
 * ## Stickiness is a desktop-only affordance
 *
 * `lg:sticky` and nothing below it. A sticky rail on a phone is a panel that
 * eats a third of a small viewport and follows you down a form — the exact
 * behaviour that makes people close a booking page. On a wide screen it is the
 * whole point, because the number has to stay visible while the form scrolls.
 *
 * `lg:items-start` on the grid is load-bearing: grid children stretch to the row
 * height by default, and a full-height rail can never stick to anything.
 */

export interface RailLayoutProps {
  /** The form, the record, the thing being changed. Rendered first. */
  children: ReactNode;
  /** The summary column. Rendered after the content in DOM order — see above. */
  rail: ReactNode;
  /**
   * Names the rail region. Required: an `<aside>` with no accessible name is
   * announced as "complementary" and nothing else, which on a page with a form
   * in it tells the customer nothing about what they have landed in.
   */
  railLabel: string;
  /**
   * Rail width at `lg` and up. `24rem` suits a money summary with two-line rows;
   * `20rem` suits a checklist.
   */
  railWidth?: "20rem" | "24rem";
  className?: string;
}

const RAIL_COLUMNS = {
  "20rem": "lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]",
  "24rem": "lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]",
} as const;

export function RailLayout({
  children,
  rail,
  railLabel,
  railWidth = "24rem",
  className,
}: RailLayoutProps) {
  return (
    <div className={cn("grid gap-6 lg:items-start lg:gap-8", RAIL_COLUMNS[railWidth], className)}>
      {/* `min-w-0` so a long service name or a wide table shrinks the column
          instead of pushing the rail off the viewport. A grid track's default
          `min-width:auto` is the usual cause of a page that scrolls sideways. */}
      <div className="min-w-0">{children}</div>

      <aside aria-label={railLabel} className="min-w-0 lg:sticky lg:top-6">
        {rail}
      </aside>
    </div>
  );
}

/**
 * The rail's headline block: a dark plate with one number on it.
 *
 * Exactly one per rail. The dark ground is what makes it the loudest thing on a
 * page of white cards without needing a larger typeface than the page heading,
 * and it is reserved for the number the screen exists to communicate — the
 * published day rate, the fee about to be charged, the cash to have ready.
 *
 * ## Focus inside here switches rings
 *
 * `--color-focus-ring` is navy-600, tuned for a white surface, and it measures
 * under 3:1 against this plate. Anything focusable placed in `children` or
 * `trailing` should carry `focus-visible:outline-focus-ring-inverse`; the
 * contrast test asserts both halves of that swap.
 */
export interface RailHeadlineProps {
  /** The small uppercase line above the number. Says what the number is. */
  eyebrow: string;
  /** The number itself, already formatted. Never computed here. */
  value: string;
  /** The unit beside it — "per person, per day". */
  unit?: string;
  /**
   * The line under the rule. Terms that qualify the number, not a sentence
   * about it.
   */
  footnote?: ReactNode;
  className?: string;
}

export function RailHeadline({
  eyebrow,
  value,
  unit,
  footnote,
  className,
}: RailHeadlineProps) {
  return (
    <div className={cn("rounded-card bg-navy-900 p-5 text-text-inverse", className)}>
      <p className="text-[0.6875rem] font-bold uppercase tracking-[0.09em] text-action">
        {eyebrow}
      </p>
      <p className="mt-2.5 flex flex-wrap items-baseline gap-2">
        <span
          data-numeric
          className="text-[2.75rem] font-extrabold leading-none tracking-[-0.03em] tabular-nums"
        >
          {value}
        </span>
        {unit ? <span className="text-sm font-medium text-warm-300">{unit}</span> : null}
      </p>
      {footnote ? (
        <div className="mt-3.5 border-t border-warm-0/15 pt-3.5 text-[0.8125rem] leading-5 text-warm-300">
          {footnote}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A money breakdown as rows, which is the only way it is ever written here.
 *
 * "Three people for two days at the published rate comes to ₹5,400, of which
 * ₹5,100 is cash to the crew" is a sentence nobody reads to the end. The same
 * facts as label-and-amount rows are scannable, and each row can carry its own
 * quiet second line without becoming a subordinate clause.
 *
 * Rows are `<dt>`/`<dd>` pairs inside a `<dl>`. It is a description list —
 * every row is a term and its value — and the semantics cost nothing.
 */
export interface RailMoneyRow {
  /** Row label. */
  label: string;
  /** Second line under the label, for what qualifies the amount. */
  note?: string | null;
  /** The formatted amount. `null` renders an em dash rather than a blank. */
  amount: string | null;
  /** Sets the row apart as the total. Larger, and first in the list. */
  emphasis?: boolean;
  /** Tints the row, for the one line that is money leaving today. */
  tinted?: boolean;
}

export function RailMoney({
  rows,
  className,
}: {
  rows: readonly RailMoneyRow[];
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "overflow-hidden rounded-card border border-line bg-surface",
        className,
      )}
    >
      {rows.map((row, index) => (
        <div
          key={row.label}
          className={cn(
            "flex items-baseline justify-between gap-3 px-4 py-3.5",
            index > 0 && "border-t border-line",
            row.tinted && "bg-surface-hover",
          )}
        >
          <div className="min-w-0">
            <dt
              className={cn(
                "text-text",
                row.emphasis ? "text-[0.9375rem] font-bold" : "text-[0.8438rem] font-semibold",
              )}
            >
              {row.label}
            </dt>
            {row.note ? (
              <p className="mt-0.5 text-xs leading-5 text-text-muted">{row.note}</p>
            ) : null}
          </div>
          <dd
            data-numeric
            className={cn(
              "shrink-0 tabular-nums text-text",
              row.emphasis
                ? "text-[1.3125rem] font-extrabold tracking-[-0.015em]"
                : "text-[0.9375rem] font-semibold",
            )}
          >
            {/* An em dash, not an empty cell. A blank beside "Booking fee" reads
                as free; a dash reads as not-yet-known, which is the truth. */}
            {row.amount ?? <span className="text-text-muted">—</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
