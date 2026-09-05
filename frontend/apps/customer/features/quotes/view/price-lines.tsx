"use client";

import { cn } from "@vsolve/ui";
import { useState } from "react";

/**
 * Where the money actually goes, at the weight the money deserves.
 *
 * ## Weight follows money
 *
 * These lines used to render at one uniform size, so ₹75,000 and ₹24 were
 * typographically the same claim on a Customer's attention. Sorting by amount
 * and putting a share bar on the largest three answers "where is my money
 * going?" in about two seconds, which is the only question this section is
 * for.
 *
 * ## Trivial lines fold, and folding is how you see them
 *
 * A real estimate carried `Wall putty application · 2 Sq ft × ₹12 · ₹24`
 * beside eight five-figure lines — stray composer input, rendered with the
 * full authority of a priced commitment. Folding sub-₹100 lines behind a
 * summary does two jobs at once: it keeps the section scannable, and it makes
 * an anomaly legible *as* an anomaly instead of hiding it in plain sight.
 * Nothing is removed — the fold opens, and every line is inside the total
 * either way.
 */

export interface PriceLineView {
  title: string;
  note: string | null;
  amountLabel: string;
  /** Null on a line the vendor listed but did not price. Excluded from the ranking. */
  amountPaise: number | null;
}

/** Below this a line is rounding, not a decision. */
const TRIVIAL_PAISE = 10_000;
/** How many lines get a share bar. Beyond three the bars stop being a comparison. */
const BARRED = 3;

export function PriceLines({
  lines,
  totalPaise,
}: {
  lines: readonly PriceLineView[];
  /** The estimate's own total, so a share is of the real denominator. */
  totalPaise: number;
}) {
  const [showTrivial, setShowTrivial] = useState(false);

  const sorted = [...lines].sort((a, b) => (b.amountPaise ?? -1) - (a.amountPaise ?? -1));
  const trivial = sorted.filter(
    (line) => line.amountPaise !== null && line.amountPaise < TRIVIAL_PAISE,
  );
  const significant = sorted.filter(
    (line) => line.amountPaise === null || line.amountPaise >= TRIVIAL_PAISE,
  );

  return (
    <div>
      <ul className="flex list-none flex-col divide-y divide-line p-0">
        {significant.map((line, index) => (
          <Row
            key={`${line.title}-${index}`}
            line={line}
            totalPaise={totalPaise}
            withBar={index < BARRED}
          />
        ))}
      </ul>

      {trivial.length > 0 ? (
        <div className="mt-2 border-t border-line pt-2">
          <button
            type="button"
            onClick={() => setShowTrivial((current) => !current)}
            className="flex w-full items-center gap-2 py-1.5 text-left text-sm font-semibold text-text-secondary hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <span aria-hidden className={cn("transition-transform", showTrivial ? "rotate-90" : "")}>
              ▸
            </span>
            {trivial.length === 1
              ? `1 line under ₹100 (${trivial[0]!.amountLabel})`
              : `${trivial.length} lines under ₹100`}
          </button>
          {showTrivial ? (
            <ul className="flex list-none flex-col divide-y divide-line p-0">
              {trivial.map((line, index) => (
                <Row key={`t-${line.title}-${index}`} line={line} totalPaise={totalPaise} withBar={false} />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <p className="mt-3 text-xs text-text-muted">Every line is already inside the total above.</p>
    </div>
  );
}

function Row({
  line,
  totalPaise,
  withBar,
}: {
  line: PriceLineView;
  totalPaise: number;
  withBar: boolean;
}) {
  const share =
    withBar && line.amountPaise !== null && totalPaise > 0
      ? Math.round((line.amountPaise / totalPaise) * 100)
      : null;

  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-text">{line.title}</p>
          {line.note !== null ? (
            <p className="text-sm tabular-nums text-text-secondary">{line.note}</p>
          ) : null}
        </div>
        <p
          className={cn(
            "shrink-0 tabular-nums text-text",
            withBar ? "text-[17px] font-extrabold" : "font-semibold",
          )}
        >
          {line.amountLabel}
        </p>
      </div>
      {share !== null ? (
        <div className="mt-1.5 flex items-center gap-2">
          <div
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken"
            role="img"
            aria-label={`${share}% of the total`}
          >
            <div className="h-full rounded-full bg-signal-500" style={{ width: `${share}%` }} />
          </div>
          <span className="w-9 shrink-0 text-right text-xs font-bold tabular-nums text-text-muted">
            {share}%
          </span>
        </div>
      ) : null}
    </li>
  );
}
