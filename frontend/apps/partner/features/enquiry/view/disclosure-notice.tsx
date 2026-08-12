"use client";

import { Card } from "@vsolve/ui";
import { ShieldCheck } from "lucide-react";

/**
 * What Vsolve does and does not share, and what that means for the vendor.
 *
 * Closes what is buildable of `M2-FE-307`.
 *
 * ## The honest answer to "consent before contact disclosure" is that there is
 * no disclosure
 *
 * Nothing in the Partner surface at contract 1.21.0 carries customer identity.
 * `EnquirySummarySerializer` and `EnquiryDetailSerializer` read the snapshot —
 * archetype, answers, dates, budget, language — and the snapshot never held a
 * name, an address or a number. There is no contact-disclosure endpoint, no
 * consent record and no revocation, in this contract or in proposals 0012 and
 * 0013.
 *
 * That makes two of the task's three clauses vacuously satisfied and worth
 * saying out loud rather than leaving as an assumption:
 *
 * - **Nothing can be revealed from cached client state after a revocation,**
 *   because no contact data was ever in the cache to survive one. The enquiry
 *   boundary test asserts that property directly rather than trusting this note.
 * - **There is no server outcome to record,** because there is no command whose
 *   outcome it would be. Requested in `frontend-execution-plan.md` §7.
 *
 * What is left is the part that does apply today: a vendor can still put their
 * own number into a question, and that is the disclosure this product actually
 * has to guard. The guidance therefore sits on the question composer, where it
 * arrives in time to change what somebody types, and this card carries the
 * standing statement — that the protection runs both ways, and what it costs to
 * step outside it.
 */

export function DisclosureNotice() {
  return (
    <Card className="flex items-start gap-3 p-4">
      <ShieldCheck size={18} aria-hidden className="mt-0.5 shrink-0 text-text-muted" />
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-text">Working through Vsolve</h2>
        <p className="text-sm leading-6 text-text-secondary">
          You will not see the customer&rsquo;s name, address or phone number on this request, and
          they will not see yours. Everything either of you needs to agree runs through the record
          on this screen.
        </p>
        <p className="text-sm leading-6 text-text-secondary">
          If work is arranged off the platform, neither side is covered: no payment protection, no
          dispute record, and nothing for support to act on. Questions are reviewed, and repeatedly
          passing out contact details puts your capability at risk.
        </p>
      </div>
    </Card>
  );
}
