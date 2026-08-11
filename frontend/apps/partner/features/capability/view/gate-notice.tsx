"use client";

import { Card, buttonStyles, cn } from "@vsolve/ui";
import { ShieldCheck } from "lucide-react";
import Link from "next/link";

import type { GateExplanation } from "../adapters/gates";

/**
 * Why we need this from you, *now*.
 *
 * Closes the presentation half of `M2-FE-102` / `FLOW-06`, `FLOW-07`.
 *
 * ## Attached to the control, never to the screen
 *
 * This renders beside the button it explains — the accept, the payout, the crew
 * assignment — and never at the top of a list. That placement is the whole
 * design: a Partner who is asked for a document while browsing reads it as a
 * wall, and a Partner who is asked at the moment they press "accept" reads it as
 * the obvious next thing. The gates are the same in both cases; only the timing
 * differs, and the timing is what decides whether they finish.
 *
 * `GateNotice` therefore renders nothing at all when nothing is blocking, and
 * takes an explanation rather than a list of gates. A component holding the
 * whole gate list would eventually be put at the top of a page by someone who
 * had a list handy.
 *
 * ## Why the reason is the server's sentence
 *
 * 0013 §D1 requires the identical `reason` on the refusal that comes back if the
 * Partner gets there first. One sentence in both places means a person who read
 * it before the attempt and again after it learns nothing new and concludes
 * nothing changed — which is correct. Two sentences, however similar, read as
 * two different rules.
 *
 * ## Never blocks by itself
 *
 * This is an explanation, not an authorization. `gates.ts` is advisory; Django
 * enforces at the command. So a screen shows this *and* still handles
 * `m2_kyc_required` arriving anyway — the gate may have closed since the read.
 */

export interface GateNoticeProps {
  /** Null when nothing stands in the way. The component renders nothing. */
  readonly explanation: GateExplanation | null;
  /**
   * The action being explained, in the Partner's words — "accept this job".
   *
   * Passed by the caller because only it knows which control it drew. A generic
   * "do this" would make the notice ignorable, which defeats the placement.
   */
  readonly actionDescription: string;
  readonly className?: string;
}

export function GateNotice({ explanation, actionDescription, className }: GateNoticeProps) {
  if (explanation === null) return null;

  return (
    <Card
      // Assertive: this appears at the moment someone tried to act, and a polite
      // announcement would be read after they had already pressed again.
      aria-live="assertive"
      className={cn("border-warning-line bg-warning-surface p-4", className)}
    >
      <div className="flex gap-3">
        <ShieldCheck size={18} aria-hidden className="mt-0.5 shrink-0 text-warning-text" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-warning-text">
            One thing before you can {actionDescription}
          </h3>
          {/* The server's own words. Never summarised, never replaced. */}
          <p className="mt-1 text-sm leading-6 text-text-secondary">{explanation.reason}</p>

          {explanation.actionHref && explanation.actionLabel ? (
            <Link
              href={explanation.actionHref}
              className={buttonStyles({ size: "sm", className: "mt-3" })}
            >
              {explanation.actionLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
