import type { ReactNode } from "react";

import { cn } from "./cn";

/**
 * The shared chronological record.
 *
 * One component for the customer's request timeline, the engagement timeline
 * both parties read, and the Operations audit view. They differ in what they are
 * allowed to show, never in how a sequence of events is drawn — and building
 * three would guarantee the Operations one grew a detail the customer one
 * quietly lacked.
 *
 * ## What a timeline may not do
 *
 * It renders events the server sent. It never synthesises one — no "matching
 * started" entry inferred from a status, no optimistic "payment received" ahead
 * of a verified callback. A fabricated event in a record both parties rely on
 * during a dispute is worse than a gap, because it looks like evidence.
 *
 * ## Structure
 *
 * An ordered list, so assistive technology announces position and count and a
 * reader knows how much came before. The connecting rail is decorative CSS on
 * the list items rather than an element, which keeps it out of the accessibility
 * tree entirely.
 */

export type TimelineTone = "neutral" | "active" | "success" | "warning" | "danger";

const markerTones: Record<TimelineTone, string> = {
  neutral: "bg-line-strong",
  active: "bg-action ring-4 ring-signal-100",
  success: "bg-success",
  warning: "bg-warning-text",
  danger: "bg-danger",
};

export interface TimelineEventProps {
  /** What happened, in plain language. "Vendor asked a question", not "QUESTION_POSTED". */
  title: string;
  /**
   * When, already formatted and already localised.
   *
   * A string rather than a Date: the caller has the server clock and this
   * component does not, and a component that formatted timestamps itself would
   * be reading the device clock to do it.
   */
  timestamp: string;
  /** Who acted, when the record names them and the reader is allowed to know. */
  actor?: string;
  /** Detail, evidence links or a nested summary. */
  children?: ReactNode;
  tone?: TimelineTone;
  className?: string;
}

export function TimelineEvent({
  title,
  timestamp,
  actor,
  children,
  tone = "neutral",
  className,
}: TimelineEventProps) {
  return (
    <li className={cn("group relative flex gap-3 pb-5 last:pb-0", className)}>
      {/* Rail. Decorative, and stopped on the last item so the sequence reads as
          finished rather than trailing into nothing. `group-last:` rather than
          `last:` because the variant has to test the list item, not this span —
          which is always the first child of its own parent. */}
      <span
        aria-hidden
        className="absolute bottom-0 left-[0.3125rem] top-5 w-px bg-line group-last:hidden"
      />

      <span
        aria-hidden
        className={cn("relative mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", markerTones[tone])}
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className="text-sm font-semibold text-text">{title}</p>
          <p className="text-xs text-text-muted">{timestamp}</p>
        </div>
        {actor ? <p className="mt-0.5 text-xs text-text-secondary">{actor}</p> : null}
        {children ? <div className="mt-1.5 text-sm text-text-secondary">{children}</div> : null}
      </div>
    </li>
  );
}

export interface TimelineProps {
  /** `TimelineEvent` children, newest last unless the caller says otherwise. */
  children: ReactNode;
  /** Accessible name. Required — several timelines can share one screen. */
  label: string;
  className?: string;
}

export function Timeline({ children, label, className }: TimelineProps) {
  return (
    <ol aria-label={label} className={cn("m-0 list-none p-0", className)}>
      {children}
    </ol>
  );
}
