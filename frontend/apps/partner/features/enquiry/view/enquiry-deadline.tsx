"use client";

import { Readout } from "@vsolve/ui";
import { useServerCountdown } from "@vsolve/query";

import { timeAgo } from "@/lib/format";
import {
  deadlineStateFor,
  describeDeadline,
  type DeadlineState,
} from "../model/enquiry-state";

/**
 * The response deadline, presented as guidance and never as authority.
 *
 * Closes `M2-FE-304`. Three rules, all of them the reason this is a component
 * rather than a line of JSX in the card:
 *
 * 1. **The countdown runs on the server clock.** `useServerCountdown` reads
 *    `serverClock`, which calibrates from the `Date` header on every response. A
 *    device two minutes fast would otherwise show a vendor a dead enquiry that
 *    Django still considers live, and the vendor would not take the job.
 *
 *    The enquiry reads publish no `server_now` field — unlike every other M2
 *    read — so calibration here is header-only, at RFC 7231's one-second
 *    granularity. Fine for a deadline hours away; requested anyway in
 *    `frontend-execution-plan.md` §7, because it is the one read where a clock
 *    is load-bearing.
 *
 * 2. **Reaching zero expires nothing.** Django expires invitations on its own
 *    schedule and `status` is the only thing that knows. So a passed deadline
 *    stops the screen *offering* an accept and says the enquiry may already have
 *    moved on. It never announces the expiry itself.
 *
 * 3. **No deadline is a real answer.** `matching._invitation_deadline` returns
 *    nothing when the service area publishes no operating window or the variant
 *    configuration carries no SLA hours, so a large share of live enquiries
 *    genuinely have none. Rendering "0:00" or hiding the section would both be
 *    lies; it says there is no published deadline.
 */

const TONE: Record<DeadlineState, "neutral" | "active" | "warning" | "danger"> = {
  none: "neutral",
  open: "active",
  closing: "warning",
  passed: "danger",
};

export interface EnquiryDeadlineProps {
  readonly respondsBy: string | null;
  /** Tick once a second only when it matters; a deadline hours out costs battery. */
  readonly tickMs?: number;
  readonly className?: string;
}

export function EnquiryDeadline({ respondsBy, tickMs = 1000, className }: EnquiryDeadlineProps) {
  const countdown = useServerCountdown(respondsBy, tickMs);
  const state = deadlineStateFor({
    respondsBy,
    remainingMs: countdown?.remainingMs ?? null,
  });

  if (state === "none" || countdown === null) {
    return (
      <p className={className ?? "text-sm leading-6 text-text-secondary"}>
        {describeDeadline("none")}
      </p>
    );
  }

  return (
    <div className={className ?? "flex flex-col gap-2"}>
      <Readout
        label={state === "passed" ? "Response window" : "Time to respond"}
        value={state === "passed" ? "Closed" : countdown.display}
        announce={state === "passed" ? "The response window has closed" : countdown.announce}
        tone={TONE[state]}
        size="sm"
        caption={respondsBy ? `Due ${timeAgo(respondsBy)}` : undefined}
      />
      <p className="text-sm leading-6 text-text-secondary">{describeDeadline(state)}</p>
    </div>
  );
}

/**
 * The compact form for a list row.
 *
 * Same clock, same rules, no plate — a page of readout plates makes none of them
 * the thing you look at. The absolute instant is the caption because a row that
 * shows only "3:12:45" cannot be checked against a calendar.
 */
export function EnquiryDeadlineInline({ respondsBy }: { readonly respondsBy: string | null }) {
  // A minute is enough resolution in a list. A per-second re-render of twenty
  // rows to move a digit nobody is watching is the definition of a battery leak.
  const countdown = useServerCountdown(respondsBy, 60_000);
  const state = deadlineStateFor({
    respondsBy,
    remainingMs: countdown?.remainingMs ?? null,
  });

  if (state === "none" || countdown === null) {
    return <span className="text-xs text-text-muted">No response deadline</span>;
  }

  const tone =
    state === "passed" ? "text-danger-text" : state === "closing" ? "text-warning-text" : "text-text-secondary";

  return (
    <span className={`text-xs font-medium ${tone}`}>
      {state === "passed" ? "Window closed by our clock" : `${countdown.announce} to respond`}
    </span>
  );
}
