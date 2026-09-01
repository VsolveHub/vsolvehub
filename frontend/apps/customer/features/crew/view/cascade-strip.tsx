"use client";

import type { CascadeView } from "../adapters";

/**
 * "Wave 2 of 3" — the whole search, reduced to one line.
 *
 * The wide screen used to draw one card per wave, done/current/upcoming, with
 * a countdown to the next one. A waiting screen with nothing to press does not
 * need the shape of the search, only the two facts that answer "is this still
 * moving": which wave is out, and how many waves there are. Both are the
 * server's own — `cascade_progress` — and this prints nothing it was not sent.
 */
export function CascadeStrip({ cascade }: { cascade: CascadeView }) {
  const total = cascade.waves.length;
  if (total < 1) return null;
  const current = cascade.waves.find((wave) => wave.state === "current");
  /* No current wave means none is out — which used to fall back to `total` and tell somebody
     "Wave 4 of 4": we have searched as hard as we can, when in fact nothing had been searched at
     all. The number is the server's or it is not shown; a count invented on this side of the wire
     is worse than a blank line, because it is read as progress. */
  if (current === undefined) return null;

  return (
    <p className="text-sm text-text-secondary">
      Wave {current.number} of {total}
    </p>
  );
}
