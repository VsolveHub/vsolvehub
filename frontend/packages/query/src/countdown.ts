"use client";

import { serverClock } from "@vsolve/api-client";
import { useEffect, useState } from "react";

/**
 * A countdown measured against the server's clock, not the device's.
 *
 * Every deadline this product shows is operationally meaningful: a Partner's
 * 120-second undo window, an offer expiry, a Booking Group's next transition. A
 * device whose clock is two minutes fast would show a Partner an offer that
 * looks dead while the server still considers it live — and the Partner would
 * not take the job.
 *
 * So the arithmetic goes through `serverClock`, which calibrates from the `Date`
 * header on every response and from `server_now` where an endpoint publishes one.
 * Nothing here ever subtracts a deadline from a raw `Date.now()`.
 *
 * ## The countdown is presentation, never authority
 *
 * Reaching zero locally does not expire anything. The server decides that, and
 * the screen finds out by re-reading. `isExpired` therefore means "our clock says
 * this has passed" and is used to stop offering an action, never to assert that
 * the thing is gone — the difference matters at the boundary, where the local
 * estimate can be a second either side of the truth.
 *
 * ## Why it stops ticking
 *
 * The interval clears once the deadline passes and while the tab is hidden. A
 * background tab cannot show anyone a countdown, and on a phone it is the tab
 * most likely to be doing this on a metered connection and a limited battery.
 * Returning to the tab recomputes immediately rather than waiting a tick.
 */

export interface Countdown {
  /** Milliseconds left by the server clock, floored at zero. */
  remainingMs: number;
  /** True once the local estimate has passed the deadline. Presentation only. */
  isExpired: boolean;
  /** "1:42" — for the visible digits. */
  display: string;
  /**
   * "about 2 minutes left" — for assistive technology.
   *
   * Deliberately coarse. A per-second string under an `aria-live` region would
   * make a screen reader unusable; this is written for a value that is read when
   * the user arrives at it, not shouted on every tick.
   */
  announce: string;
}

function twoDigits(value: number): string {
  return value.toString().padStart(2, "0");
}

function display(remainingMs: number): string {
  if (remainingMs <= 0) return "0:00";
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${twoDigits(minutes)}:${twoDigits(seconds)}`
    : `${minutes}:${twoDigits(seconds)}`;
}

function announce(remainingMs: number): string {
  if (remainingMs <= 0) return "Time is up";
  const totalSeconds = Math.ceil(remainingMs / 1000);
  if (totalSeconds < 60) return `less than a minute left`;
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `about ${minutes} ${minutes === 1 ? "minute" : "minutes"} left`;
  const hours = Math.round(minutes / 60);
  return `about ${hours} ${hours === 1 ? "hour" : "hours"} left`;
}

export function describeCountdown(remainingMs: number): Countdown {
  return {
    remainingMs,
    isExpired: remainingMs <= 0,
    display: display(remainingMs),
    announce: announce(remainingMs),
  };
}

/**
 * @param deadlineIso A server-authored instant, or null when there is no deadline.
 * @param tickMs How often to recompute. One second for a short window; a longer
 *   interval is correct for a deadline hours away and costs less battery.
 */
export function useServerCountdown(deadlineIso: string | null, tickMs = 1000): Countdown | null {
  /**
   * A bare ticker, not the remaining time.
   *
   * The remaining time is *derived during render* from `serverClock`, and this
   * state exists only to schedule the re-render that recomputes it. Storing the
   * number instead would mean two sources for one value, and a window — one
   * commit wide — where a changed `deadlineIso` is rendered against the previous
   * deadline's countdown. Deriving removes that window rather than shortening it.
   */
  const [, tick] = useState(0);

  useEffect(() => {
    if (deadlineIso === null) return;

    let timer: ReturnType<typeof setInterval> | undefined;

    const start = () => {
      if (timer !== undefined) return;
      timer = setInterval(() => {
        tick((count) => count + 1);
        // Nothing left to count. Clearing here rather than letting it spin means
        // an expired offer left on screen costs nothing at all.
        if (serverClock.remainingMs(deadlineIso) <= 0 && timer !== undefined) {
          clearInterval(timer);
          timer = undefined;
        }
      }, tickMs);
    };

    const stop = () => {
      if (timer === undefined) return;
      clearInterval(timer);
      timer = undefined;
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        // Catch up immediately rather than after one tick — returning to a tab
        // that shows a stale countdown is worse than one that shows none.
        tick((count) => count + 1);
        start();
      } else {
        stop();
      }
    };

    if (typeof document === "undefined" || document.visibilityState === "visible") start();
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      stop();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [deadlineIso, tickMs]);

  // Read at render time, so the value always belongs to the current deadline and
  // to the latest clock calibration.
  return deadlineIso === null ? null : describeCountdown(serverClock.remainingMs(deadlineIso));
}
