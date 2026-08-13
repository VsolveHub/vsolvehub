"use client";

import { Badge } from "@vsolve/ui";

import { toAgreementHistory, type AmendmentsView, type EngagementView } from "../adapters";

/**
 * What this agreement has been, version by version — `M2-FE-613`.
 *
 * ## What a version is, and what one is not
 *
 * A version is the original agreement, plus every amendment the server stamped
 * `applied_at` on, in the order it applied them. A **proposed** amendment is not
 * a version — it is a request, and putting it in this list would be exactly the
 * failure `M2-FE-610` exists to prevent, reached from the other direction.
 *
 * ## Why the money reconciles without this component doing arithmetic
 *
 * `Engagement.total_paise` never moves: an accepted amendment moves
 * `amendment_delta_paise`, and `staged_total_paise = total_paise + delta` is a
 * database constraint. So the original number and the current number are both
 * published, and the running total between them is walked from the applied
 * deltas — which sums to the published current total by that same constraint. A
 * disagreement between the last row here and the agreement panel above would
 * therefore be a server bug rather than a client one, which is the right place
 * for it to be visible.
 *
 * ## What this history cannot yet show
 *
 * The **scope** of each version. `Engagement` publishes the proposal it was
 * frozen from as a bare id and no snapshot of its inclusions, exclusions,
 * schedule or warranty terms, so the agreed work itself is only readable back on
 * the quote it came from. Each version therefore carries its money and its
 * change lines, and the panel links to the request rather than paraphrasing
 * terms this client has not been given. Logged in §7.
 */

export interface AgreementHistoryProps {
  engagement: EngagementView;
  amendments: AmendmentsView;
  /** The engagement's untouched original total, in paise. Never recomputed. */
  originalTotalPaise: number;
}

export function AgreementHistory({
  engagement,
  amendments,
  originalTotalPaise,
}: AgreementHistoryProps) {
  const versions = toAgreementHistory(engagement, amendments, originalTotalPaise);

  // One version means nothing has ever changed, and a "history" of one row
  // invites the reader to look for a second. The agreement panel already shows
  // the total; this says the plainer thing.
  if (versions.length === 1) {
    return (
      <p className="mt-2 text-sm leading-6 text-text-secondary">
        What you agreed has not changed since it was signed.
      </p>
    );
  }

  return (
    <ol className="mt-3 flex list-none flex-col gap-2 p-0">
      {versions.map((version) => (
        <li key={version.version} className="rounded-card border border-line bg-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-semibold text-text">{version.title}</h3>
              {version.at !== null ? (
                <p className="mt-0.5 text-sm text-text-secondary">{version.at}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {version.version === 0 ? (
                <Badge tone="neutral">Original</Badge>
              ) : (
                <Badge tone={version.removesScope ? "success" : "info"}>
                  {version.removesScope ? "−" : "+"}
                  {version.changeLabel}
                </Badge>
              )}
              <p className="font-semibold text-text">{version.totalLabel}</p>
            </div>
          </div>

          {version.reason !== null ? (
            <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
              {version.reason}
            </p>
          ) : null}

          {version.lines.length > 0 ? (
            <ul className="mt-2 flex list-none flex-col gap-1 border-t border-line p-0 pt-2">
              {version.lines.map((line) => (
                <li
                  key={line.position}
                  className="flex items-baseline justify-between gap-3 text-sm"
                >
                  <span className="text-text-secondary">
                    {line.title}
                    {line.quantity !== 1 ? ` × ${line.quantity}` : ""}
                  </span>
                  <span className="text-text-secondary">
                    {line.removesScope ? "removes " : ""}
                    {line.amountLabel}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
