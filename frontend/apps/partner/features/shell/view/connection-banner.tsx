"use client";

import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * The strip that appears when the phone loses its connection.
 *
 * ## Why this is not optional in this product
 *
 * A Partner is outdoors, in a basement, in a lift, in a stairwell. Losing data
 * mid-job is normal, not exceptional. Without this the app's failure modes are
 * indistinguishable from each other: a spinner that never resolves, a card that
 * will not open, a "Try again" that fails again — all of which read as "the app
 * is broken" rather than "your signal is gone", and the second one is the one
 * the Partner can actually do something about.
 *
 * It also matters for the one thing this app promises: duty. `DutyPill` goes
 * `stale` after ninety seconds without an acknowledged heartbeat, which is
 * correct but slow. `navigator.onLine` going false is instant, and it tells the
 * Partner why their status is about to change before it changes.
 *
 * ## What `navigator.onLine` is and is not
 *
 * It is honest about *disconnected* and optimistic about *connected*: false
 * reliably means there is no network interface, while true only means one
 * exists — a captive portal or dead upstream still reports true. So this only
 * ever draws the negative case. The positive case is left to the heartbeat,
 * which asks a real server.
 *
 * Mounted in the shell rather than per-screen, so it is present on every
 * authenticated route including pushed ones.
 */
export function ConnectionBanner() {
  /*
    Starts `true` on both sides of hydration rather than reading
    `navigator.onLine` in a `useState` initialiser: the server has no navigator,
    so an initialiser would make the two trees disagree, and the reconciliation
    flashes an offline banner at every user on every first paint.
  */
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    update();

    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div
      /*
        `role="status"`, not `alert`. This is a condition the Partner is already
        aware of by the time they read it, and an assertive interruption of
        whatever they were doing adds nothing.
      */
      role="status"
      className="flex items-center justify-center gap-2 bg-warning-surface px-4 py-2 text-caption font-bold text-warning-text"
    >
      <WifiOff size={15} aria-hidden />
      No connection — we will catch up when your signal returns
    </div>
  );
}
