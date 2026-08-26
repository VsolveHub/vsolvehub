"use client";

import { Badge, Disclosure, cn } from "@vsolve/ui";
import type { BadgeProps } from "@vsolve/ui";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Where something stands, ranked.
 *
 * ## The problem this solves, precisely
 *
 * `REQUEST_STATE_COPY` gives every state three things: a label, an explanation,
 * and the one truthful next step. All three are worth saying — the explanations
 * are the reason a Customer trusts a closure instead of phoning support about
 * it. But the old notice rendered all three as consecutive paragraphs at one
 * weight, so the screen said everything at once and therefore emphasised
 * nothing. A reader scanning for "what do I do" read three paragraphs to find
 * a sentence.
 *
 * This ranks the same words without cutting any of them:
 *
 *   chip        — the state, findable at arm's length
 *   headline    — one sentence, the answer to "what is happening"
 *   readout     — the number, when the state has one (see `Readout`)
 *   action      — the next step as a control, not as prose
 *   disclosure  — the full explanation, one tap away, for whoever wants it
 *
 * **Nothing is hidden that a Customer must have read.** The disclosure carries
 * explanation only. Anything they must act on, and anything they must have seen
 * before money moves, is the headline or the action — never behind the chevron.
 * That rule is `Disclosure`'s own and this component exists inside it, not
 * around it.
 */

export interface StatusCardProps {
  /** The state, in the words the state table uses. */
  label: string;
  tone: NonNullable<BadgeProps["tone"]>;
  /**
   * One sentence answering "what is happening". Not a restatement of the label:
   * the chip already said "Quotes ready", so the headline says what that means
   * for this record — "Three professionals have quoted for this job."
   */
  headline: string;
  /**
   * What the headline leaves out, rendered behind the disclosure and never cut.
   *
   * Empty is a legitimate value and means the headline said everything: the
   * card then renders no disclosure at all rather than a control that opens
   * onto nothing. `nextStep` and `supportAction` can still bring it back, since
   * either of those is worth a tap on its own.
   */
  explanation: string;
  /** The state table's next step, when it has one. Null renders as silence. */
  nextStep?: string | null;
  /**
   * The number this state turns on — a price, a countdown, a refund. Pass a
   * `Readout`; the card only positions it.
   */
  readout?: ReactNode;
  /**
   * The one control. A state with nothing for the Customer to do passes
   * nothing, and the card renders no button rather than one that reloads the
   * page.
   */
  action?: ReactNode;
  /**
   * Offered inside the disclosure where we are the reason there is nothing to
   * show. The caller decides — this component does not know what a failure is.
   */
  supportAction?: ReactNode;
  /**
   * Says a page rail takes over the readout and the action at this breakpoint.
   *
   * The card still *receives* both, because it owns them at narrow widths where
   * there is no rail. Above the named breakpoint it stops drawing them and the
   * rail draws them instead — which is what keeps one screen from showing a
   * price and a button twice. Omitted, the card keeps them at every width.
   */
  railedAbove?: "lg";
  className?: string;
}

/**
 * Tone drives the card's edge only. The fill stays `surface` in every state:
 * a tinted card behind a headline, a number and a button makes the button
 * harder to find, which is the opposite of what this card is for.
 */
const EDGE: Record<NonNullable<BadgeProps["tone"]>, string> = {
  success: "border-success-line",
  warning: "border-warning-line",
  danger: "border-danger-line",
  info: "border-info-line",
  brand: "border-info-line",
  action: "border-action-line",
  neutral: "border-line",
};

export function StatusCard({
  label,
  tone,
  headline,
  explanation,
  nextStep = null,
  readout,
  action,
  supportAction,
  railedAbove,
  className,
}: StatusCardProps) {
  const handedOff = railedAbove === "lg" ? "lg:hidden" : null;
  const hasMore =
    explanation.trim().length > 0 || nextStep !== null || supportAction !== undefined;
  return (
    <section
      aria-label={label}
      className={cn(
        "flex flex-col rounded-card border bg-surface shadow-card transition-shadow duration-fast",
        EDGE[tone],
        className,
      )}
    >
      <div className="flex flex-col gap-3.5 p-5 sm:p-6 lg:pb-1">
        <Badge tone={tone} dot className="self-start shadow-2xs">
          {label}
        </Badge>

        <h2 className="max-w-[44ch] text-lg font-extrabold leading-snug tracking-tight text-navy-900 sm:text-xl">
          {headline}
        </h2>

        {readout ? <div className={cn("mt-0.5", handedOff)}>{readout}</div> : null}

        {action ? (
          <div className={cn("mt-1.5 flex flex-col gap-2", handedOff)}>{action}</div>
        ) : null}
      </div>

      {hasMore ? (
        <>
          <div className="border-t border-line/80 px-4 pb-4 pt-3 sm:px-5 lg:hidden">
            <Disclosure summary="What this means">
              <p className="text-pretty text-sm leading-relaxed text-text-secondary">{explanation}</p>
              {nextStep === null ? null : (
                <p className="mt-2.5 font-bold text-navy-900">{nextStep}</p>
              )}
              {supportAction ? <div className="mt-3">{supportAction}</div> : null}
            </Disclosure>
          </div>

          <div className="hidden px-5 pb-6 sm:px-6 lg:block">
            <p className="max-w-prose text-pretty text-sm leading-relaxed text-text-secondary">
              {explanation}
            </p>
            {nextStep === null ? null : (
              <p className="mt-2.5 max-w-prose text-sm font-bold leading-relaxed text-navy-900">{nextStep}</p>
            )}
            {supportAction ? <div className="mt-3">{supportAction}</div> : null}
          </div>
        </>
      ) : null}
    </section>
  );
}

/**
 * A fact you can act on, in one row.
 *
 * ## What this replaces
 *
 * The M2 screens state their facts as sentences: "₹499 of your plan covers this
 * visit. It is paid to the professional only once they have been…", "You needed
 * this by a date that has now passed…". Every one of those sentences is worth
 * saying and none of them is worth reading *first*. Set as body copy at one
 * weight, six of them in a column, they are a wall — and the thing the Customer
 * opened the screen to do is somewhere inside it.
 *
 * A row says the same fact in a shape the eye can skip: a quiet label, the value
 * in the weight the value deserves, and — where there is more to know — an
 * affordance that says so without spending the screen on it. The full sentence
 * moves behind `Disclosure`, which is where explanation belongs.
 *
 * ## Why this is not in `@vsolve/ui`
 *
 * One consumer. The moment Partner or Operations needs the same row it moves,
 * and moving a component with one call site is cheap; maintaining a shared
 * primitive that only one app renders is not.
 *
 * ## Interactive or not, decided by the props
 *
 * A row with `href` is a link, a row with `onClick` is a button, and a row with
 * neither is a plain block — the chevron appears only in the first two, because
 * a chevron on an inert row promises somewhere to go.
 */

export interface TapRowProps {
  /** The quiet half. What kind of fact this is: "Where", "This visit". */
  label: string;
  /** The loud half, already formatted. Never a raw id or a bare number. */
  value: ReactNode;
  /** Decorative. The label carries the meaning. */
  icon?: ReactNode;
  href?: string;
  onClick?: () => void;
  /**
   * Rotates the chevron to point down and marks the control expanded. For a row
   * that opens something in place rather than navigating.
   */
  expanded?: boolean;
  /** Suppresses the divider on the last row of a stack. */
  isLast?: boolean;
  className?: string;
}

const ROW = cn(
  "flex w-full items-center gap-3 px-4 py-2.5 text-left",
  // 60px. Above the 44px floor with room for two lines of label + value, which
  // is what these rows actually carry on a 390px viewport.
  "min-h-[3.75rem]",
);

const INTERACTIVE = cn(
  "transition-colors duration-fast hover:bg-surface-hover",
  "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring",
);

export function TapRow({
  label,
  value,
  icon,
  href,
  onClick,
  expanded,
  isLast = false,
  className,
}: TapRowProps) {
  const interactive = href !== undefined || onClick !== undefined;

  const body = (
    <>
      {icon ? (
        <span
          aria-hidden
          className="flex size-[2.125rem] shrink-0 items-center justify-center rounded-control bg-surface-sunken text-text-secondary"
        >
          {icon}
        </span>
      ) : null}

      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="text-xs font-semibold text-text-muted">{label}</span>
        <span className="text-sm font-bold tracking-tight text-text">{value}</span>
      </span>

      {interactive ? (
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn(
            "size-[0.9375rem] shrink-0 text-warm-400 transition-transform duration-fast",
            expanded === undefined ? null : "text-text-muted",
            expanded ? "rotate-180" : null,
          )}
        >
          {/* A chevron that opens something points down and flips; one that
              leads somewhere points right and never moves. */}
          <path d={expanded === undefined ? "m9 18 6-6-6-6" : "m6 9 6 6 6-6"} />
        </svg>
      ) : null}
    </>
  );

  const divider = isLast ? null : "border-b border-warm-100";

  if (href !== undefined) {
    return (
      <Link href={href} className={cn(ROW, INTERACTIVE, divider, className)}>
        {body}
      </Link>
    );
  }

  if (onClick !== undefined) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-expanded={expanded}
        className={cn(ROW, INTERACTIVE, divider, className)}
      >
        {body}
      </button>
    );
  }

  return <div className={cn(ROW, divider, className)}>{body}</div>;
}

/**
 * The card the rows sit in.
 *
 * Exists so the rounding and the hairlines are stated once: a stack of rows
 * whose first and last corners are clipped by the container, rather than each
 * row carrying its own radius and none of them lining up.
 */
export function TapRowGroup({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card",
        className,
      )}
    >
      {children}
    </div>
  );
}
