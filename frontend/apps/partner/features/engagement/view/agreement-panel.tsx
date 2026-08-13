"use client";

import { Card, formatMoney } from "@vsolve/ui";
import { agreedTotals, orderedStages, type Engagement } from "@vsolve/query";
import { Lock } from "lucide-react";

import { shortDate } from "@/lib/format";

import { stageTitle, type StageWording } from "../model/engagement-copy";

/**
 * The immutable agreement — `M2-FE-602`.
 *
 * This is the screen where a vendor reads what they are held to. Wave C2 froze
 * eight terms on `Engagement` and `save()` refuses to move any of them
 * afterwards, so everything above the stage table is a value that cannot change
 * for the life of the engagement. Saying so is the point: a vendor who does not
 * know which numbers are frozen cannot tell an amendment from a repricing.
 *
 * ## Agreed, changed by, now owed — read, never computed
 *
 * `staged_total_paise == total_paise + amendment_delta_paise` is a **database
 * constraint**. All three are published, so all three are rendered directly. The
 * client does not add the delta to the total to produce the third, because the
 * server has already checked that arithmetic and a second implementation of it
 * can only ever disagree.
 *
 * `total_paise` never moves. An accepted amendment moves the delta, so the number
 * both parties originally agreed to stays readable beside the number they now
 * owe — which is exactly what a vendor needs when they are trying to work out
 * whether a change order landed.
 *
 * ## Three things `M2-FE-602` asks for that nothing publishes
 *
 * **Deliverables.** `EngagementStage` carries `label` and no deliverable text.
 * The proposal's `ProposalStage.deliverable` is the vendor's own description of
 * what each stage produces and it is **not copied onto the engagement**;
 * `terms_snapshot` holds the whole frozen proposal and is not serialised. So the
 * stage table below shows labels, and the panel says where the fuller wording
 * lives rather than inventing it.
 *
 * **Retention.** Nothing on `Engagement` or `EngagementStage` carries a retention
 * percentage or amount, and the retention percentage is an owner-blocked decision
 * (`07-state-machines-and-permissions.md` §9). The panel says no retention is
 * recorded — which is true and useful — instead of showing a zero that would read
 * as a decision somebody made.
 *
 * **Warranty terms.** `warranty_terms` is on the proposal, not the engagement.
 * Same treatment.
 *
 * All three are logged in `frontend-execution-plan.md` §7.
 */

export interface AgreementPanelProps {
  readonly engagement: Engagement;
  readonly wording: StageWording;
}

export function AgreementPanel({ engagement, wording }: AgreementPanelProps) {
  const totals = agreedTotals(engagement);
  const stages = orderedStages(engagement);
  const managed = engagement.commercial_mode === "MANAGED_PAYMENT_REQUIRED";

  return (
    <Card className="flex flex-col gap-4 p-4">
      <header className="flex items-start gap-2">
        <Lock size={16} aria-hidden className="mt-0.5 shrink-0 text-text-muted" />
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-text">What you agreed to</h2>
          <p className="text-sm leading-6 text-text-secondary">
            These terms were frozen when you reconfirmed and cannot be edited by anyone —
            including Vsolve. A change to the work is a separate change request that you propose
            and the customer accepts.
          </p>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <Term label="Agreed then" value={formatMoney(totals.agreedPaise)} />
        <Term
          label="Changed since"
          value={
            totals.changedByPaise === 0
              ? "Nothing"
              : `${totals.changedByPaise > 0 ? "+" : "−"}${formatMoney(Math.abs(totals.changedByPaise))}`
          }
        />
        <Term label="Owed now" value={formatMoney(totals.owedPaise)} />
        <Term
          label={totals.taxBasis.trim() === "" ? "Tax" : `Tax (${totals.taxBasis})`}
          value={formatMoney(totals.taxPaise)}
        />
        <Term
          label="Paid by"
          value={managed ? "Vsolve, one stage at a time" : "The customer, directly to you"}
        />
        <Term
          label="Commission"
          value={
            engagement.commission_paise === 0
              ? managed
                ? "None recorded"
                : "None — Vsolve collects no service money here"
              : formatMoney(engagement.commission_paise)
          }
        />
      </dl>

      {engagement.commission_treatment.trim() === "" ? null : (
        <p className="text-xs leading-5 text-text-muted">
          Commission treatment: {engagement.commission_treatment}
        </p>
      )}

      <section aria-labelledby="agreement-stages" className="flex flex-col gap-2">
        <h3
          id="agreement-stages"
          className="text-xs font-semibold uppercase tracking-wide text-text-muted"
        >
          The {wording.many}
        </h3>
        <ul className="flex flex-col divide-y divide-line">
          {stages.map((stage) => (
            <li key={stage.id} className="flex items-baseline justify-between gap-3 py-2">
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm text-text">{stageTitle(stage, wording)}</span>
                {stage.scheduled_on === null ? null : (
                  <span className="text-xs text-text-muted">
                    {shortDate(stage.scheduled_on)}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-sm tabular-nums text-text">
                {formatMoney(stage.amount_paise)}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs leading-5 text-text-muted">
          The fuller description of each {wording.one} — what it delivers, what is excluded, and
          your warranty terms — is on the estimate you sent. Vsolve does not republish that wording
          here, so this table shows the names and the money only.
        </p>
      </section>

      <section aria-labelledby="agreement-protections" className="flex flex-col gap-1">
        <h3
          id="agreement-protections"
          className="text-xs font-semibold uppercase tracking-wide text-text-muted"
        >
          Retention and warranty
        </h3>
        <p className="text-sm leading-6 text-text-secondary">
          No retention is held back on this agreement — Vsolve records none against it, so nothing
          is withheld from a {wording.one} beyond the payout hold described below. Warranty terms
          are the ones you wrote on your estimate; they are not restated here.
        </p>
      </section>
    </Card>
  );
}

function Term({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="text-sm font-medium tabular-nums text-text">{value}</dd>
    </div>
  );
}
