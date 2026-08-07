"use client";

import type { Schemas } from "@vsolve/api-client";

/**
 * Where this visit has got to, as a track rather than a word.
 *
 * A customer waiting at home is asking one thing — "are they coming?" — and a
 * status pill answers it only if you already know the vocabulary. Three dots on
 * a line answer it at a glance.
 *
 * ## Only the states a visit passes through on its way to starting
 *
 * On the way → Arrived → In progress. What happens after work begins is the
 * completion flow's business and has its own screen; carrying eleven statuses
 * through a three-dot track would need a dot for "disputed", which is not a step
 * on a journey.
 *
 * Terminal and exceptional states render nothing here. The status badge above
 * already names them, and a progress track for a cancelled visit is an animation
 * of something that is not happening.
 */

/**
 * The **Booking's** status, not the unit's.
 *
 * A unit stops at `BOOKED`; everything this track shows — setting off, arriving,
 * starting — happens on the Booking underneath it. Reading the unit here would
 * pin the track at step zero for the entire visit.
 */
type VisitStatus = Schemas["BookingStatusEnum"];

const STEPS = ["On the way", "Arrived", "In progress"] as const;

/**
 * How many steps are done, or `null` when a track makes no sense.
 *
 * Derived from the unit's own status. `BOOKED` sits at zero — nobody has set off
 * yet — and anything past `IN_PROGRESS` has left this track behind.
 */
function reachedStep(status: VisitStatus): number | null {
  switch (status) {
    case "CONFIRMED":
      return 0;
    case "EN_ROUTE":
      return 1;
    case "ARRIVED":
      return 2;
    case "IN_PROGRESS":
      return 3;
    default:
      return null;
  }
}

export function VisitProgress({ status }: { status: VisitStatus }) {
  const reached = reachedStep(status);
  if (reached === null) return null;

  return (
    <div className="rounded-card bg-surface-sunken p-4">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-text-muted">
        Visit status
      </p>

      {/* The list carries the meaning for a screen reader; the dots are
          decoration over it, which is why they are `aria-hidden`. */}
      <ol className="mt-3 flex items-start">
        {STEPS.map((label, index) => {
          const isDone = index < reached - 1;
          const isCurrent = index === reached - 1;
          const isReached = index < reached;

          return (
            <li key={label} className="flex flex-1 flex-col items-center">
              <div className="flex w-full items-center" aria-hidden>
                <span
                  className={`h-0.5 flex-1 ${index === 0 ? "bg-transparent" : isReached ? "bg-success" : "bg-line"}`}
                />
                <span
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${
                    isDone
                      ? "border-success bg-success text-text-inverse"
                      : isCurrent
                        ? "border-success bg-surface"
                        : "border-line bg-surface"
                  }`}
                >
                  {isDone ? (
                    <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M3 8.5 6.5 12 13 4.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : isCurrent ? (
                    <span className="size-2 rounded-full bg-success" />
                  ) : null}
                </span>
                <span
                  className={`h-0.5 flex-1 ${index === STEPS.length - 1 ? "bg-transparent" : index < reached - 1 ? "bg-success" : "bg-line"}`}
                />
              </div>
              <span
                className={`mt-2 text-center text-xs ${isReached ? "font-semibold text-text" : "text-text-muted"}`}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
