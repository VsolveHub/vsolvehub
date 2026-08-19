"use client";

import { useServerCountdown } from "@vsolve/query";
import { cn } from "@vsolve/ui";

import type { CascadeView, CascadeWaveView } from "../adapters";

/**
 * The whole search, at once — `M2-FE-427`.
 *
 * A waiting screen with nothing to press should still answer the two questions
 * somebody staring at it actually has: *is anything happening*, and *how long
 * does this go on for*. One progress bar and the sentence "we have widened the
 * search" answered neither, and it was all the phone had room for.
 *
 * A wide screen has room for the shape of the search itself: how many waves
 * there are, which one is out, how many supervisors are holding it right now,
 * and when it widens. All four are the server's — see `cascade_progress` — and
 * the strip prints nothing it was not sent. Waves beyond the next one carry no
 * time at all, because their timing depends on offers that have not been sent
 * and a projected schedule here would be this client promising something nobody
 * can keep.
 *
 * ## It is an ordered list, not a row of divs
 *
 * The waves are a sequence with a position in it, and `aria-current="step"` is
 * what lets assistive technology find the one that is live. Without it the strip
 * is decoration — which is exactly what a screen reader would announce.
 */

export interface CascadeStripProps {
  cascade: CascadeView;
}

export function CascadeStrip({ cascade }: CascadeStripProps) {
  return (
    <ol
      aria-label="Search progress"
      className="grid list-none gap-2 p-0 sm:grid-cols-3 lg:grid-cols-4"
    >
      {cascade.waves.map((wave) => (
        <Wave key={wave.number} wave={wave} total={cascade.waves.length} />
      ))}
    </ol>
  );
}

function Wave({ wave, total }: { wave: CascadeWaveView; total: number }) {
  // Only ever non-null on the single wave the server dated, so this hook runs
  // with `null` on the others and simply does nothing.
  const countdown = useServerCountdown(wave.firesAt);

  const detail =
    countdown !== null && !countdown.isExpired
      ? `In ${countdown.display}`
      : countdown !== null
        ? "Any moment"
        : wave.detail;

  return (
    <li
      aria-current={wave.state === "current" ? "step" : undefined}
      className={cn(
        "flex flex-col gap-1 rounded-card border p-3",
        wave.state === "current" && "border-action bg-action-surface",
        wave.state === "done" && "border-line bg-surface-sunken",
        wave.state === "upcoming" && "border-line bg-surface",
      )}
    >
      <span
        className={cn(
          "text-[0.6875rem] font-bold uppercase tracking-[0.08em]",
          wave.state === "current" ? "text-warning-text" : "text-text-muted",
        )}
      >
        Wave {wave.number}
      </span>

      <span
        className={cn(
          "text-sm font-semibold",
          wave.state === "upcoming" ? "text-text-secondary" : "text-text",
        )}
      >
        {detail ?? "Scheduled"}
      </span>

      {/* The state in words as well as in colour and position. A strip that
          distinguished "out now" from "not yet" by tint alone would say nothing
          in greyscale, and nothing at all to a screen reader. */}
      <span className="sr-only">
        {`Wave ${wave.number} of ${total}: `}
        {wave.state === "current"
          ? "out now"
          : wave.state === "done"
            ? "finished, nobody accepted"
            : "not sent yet"}
        {detail === null ? "" : `. ${detail}`}
      </span>
    </li>
  );
}
