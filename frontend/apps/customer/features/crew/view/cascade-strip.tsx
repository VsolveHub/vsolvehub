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
  const number = current?.number ?? total;

  return (
    <p className="text-sm text-text-secondary">
      Wave {number} of {total}
    </p>
  );
}
