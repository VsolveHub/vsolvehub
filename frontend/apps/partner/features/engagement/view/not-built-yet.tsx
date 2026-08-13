"use client";

import { Card } from "@vsolve/ui";
import { Construction } from "lucide-react";

/**
 * A capability this wave deliberately did not build, said out loud.
 *
 * ## Why it is on the screen at all
 *
 * Wave B3 builds the **shared** half of the engagement spine. The
 * archetype-specific tails — crew assignment, arrival confirmation, daily
 * attendance, overtime, no-show reporting, safety incidents (`M2-FE-502..508`),
 * the customer-caused delay claim and the digital handover (`M2-FE-605`,
 * `M2-FE-606`) — all need endpoints that Wave C4 and Wave C5 have not published.
 *
 * Half-building them is the one option that is worse than either alternative: a
 * control that posts to nothing teaches a supervisor that marking attendance
 * does not work, and they stop trying. Omitting the section silently is barely
 * better — a supervisor looking for today's headcount concludes they are on the
 * wrong screen and goes hunting.
 *
 * So the section keeps its place in the layout, keeps its own noun, and says
 * what is true: this is not written yet, and here is what to do meanwhile. It
 * holds no data, real or invented, and promises no date.
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
  return (
    <Card className="flex flex-col gap-2 border-dashed p-4">
      <div className="flex items-center gap-2">
        <Construction size={16} aria-hidden className="shrink-0 text-text-muted" />
        <h3 className="text-sm font-semibold text-text">{what} is not built yet</h3>
      </div>
      <p className="text-sm leading-6 text-text-secondary">{meanwhile}</p>
      <p className="text-xs text-text-muted">{reference}</p>
    </Card>
  );
}
