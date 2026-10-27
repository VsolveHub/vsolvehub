"use client";

import { Card, useT } from "@vsolve/ui";
import { Construction } from "lucide-react";

/**
 * A capability this column has not built, said out loud.
 *
 * ## Why it is on the screen at all
 *
 * Half-building a capability is the one option that is worse than either
 * alternative: a control that posts to nothing teaches a supervisor that marking
 * attendance does not work, and they stop trying. Omitting the section silently
 * is barely better — a supervisor looking for today's headcount concludes they
 * are on the wrong screen and goes hunting.
 *
 * So the section keeps its place in the layout, keeps its own noun, and says
 * what is true: this is not written yet, and here is what to do meanwhile. It
 * holds no data, real or invented, and promises no date.
 *
 * ## What is left, and what changed under it
 *
 * Wave B3 mounted this on eight tails. Six are gone: the A3 shift-day
 * (`M2-FE-502..508`, `M2-FE-513`) was built in Wave B3W against contract 1.30.0
 * and its blocks were deleted with it.
 *
 * **Two remain — `M2-FE-605` (the Customer-caused delay claim) and `M2-FE-606`
 * (the digital handover) — and the reason they remain is no longer the reason
 * they were mounted.** Both endpoints were published by Wave C5 at contract
 * 1.31.0: `POST /engagement-stages/{id}/delay-claim/` with its
 * `ProjectDelayClaim` record and Customer decision, and
 * `POST /engagements/{id}/handover/` with its acceptance. So these are not
 * waiting on the contract any more; they are waiting on a frontend wave, and
 * Wave B4 is Operations. Both blocks say that rather than continuing to blame an
 * endpoint that exists — a stand-in whose stated reason has gone stale is worse
 * than no stand-in, because the next reader believes it.
 *
 * **Do not delete this component while either block is mounted.** A section that
 * silently disappears is the failure described above, not a cleanup.
 */

export interface NotBuiltYetProps {
  /** The capability's own name — "Today's attendance", "Safety incident". */
  readonly what: string;
  /**
   * What the vendor should do in the meantime.
   *
   * Never "check back later", which is not an action. Where there is genuinely
   * nothing to do, say that instead of inventing something.
   */
  readonly meanwhile: string;
  /** The task ID and the wave it needs, so a reader can find the plan. */
  readonly reference: string;
}

export function NotBuiltYet({ what, meanwhile, reference }: NotBuiltYetProps) {
  const t = useT();
  return (
    <Card className="flex flex-col gap-2 border-dashed p-4">
      <div className="flex items-center gap-2">
        <Construction size={16} aria-hidden className="shrink-0 text-text-muted" />
        <h3 className="text-sm font-semibold text-text">{t("work.notBuiltYet.title", { what })}</h3>
      </div>
      <p className="text-sm leading-6 text-text-secondary">{meanwhile}</p>
      <p className="text-xs text-text-muted">{reference}</p>
    </Card>
  );
}
