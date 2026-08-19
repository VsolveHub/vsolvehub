"use client";

import { cn } from "@vsolve/ui";

/**
 * How far the crew search has got, as a row of bars.
 *
 * Replaces the paragraph that said "we have widened the search". A customer
 * watching a search they cannot influence wants two facts — is anything
 * happening, and how long does this go on for — and a sentence answers neither
 * as fast as a meter with a caption under it.
 *
 * ## The bar count is the server's, not three
 *
 * `total_waves` is owner configuration and it is **four** with the seeded
 * cascade, not the three the mock drew. Hardcoding three would show a customer a
 * search that had finished when it had not. Same for the current wave and the
 * number of supervisors holding an offer: all three come from `cascade`, and
 * when that is absent — an unconfigured cascade, a booking that is no longer out
 * — this renders nothing rather than a meter for a search that is not running.
 */

export interface WaveMeterProps {
  /** 1-based, the server's own numbering. */
  wave: number;
  totalWaves: number;
}

export function WaveMeter({ wave, totalWaves }: WaveMeterProps) {
  if (totalWaves < 1) return null;

  return (
    <div>
      <div
        role="img"
        aria-label={`Wave ${wave} of ${totalWaves}`}
        className="flex gap-[5px]"
      >
        {Array.from({ length: totalWaves }, (_, index) => (
          <span
            key={index}
            aria-hidden
            className={cn(
              "h-1 flex-1 rounded-full",
              index < wave ? "bg-action" : "bg-navy-800",
            )}
          />
        ))}
      </div>
      <p className="mt-2 text-xs leading-5 text-warm-300">
        Wave {wave} of {totalWaves} — we widen the search on our own.
      </p>
    </div>
  );
}
