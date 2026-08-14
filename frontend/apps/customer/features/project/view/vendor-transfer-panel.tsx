"use client";

import { isAmendmentNotActionable, isStageDisputed, useServerCountdown } from "@vsolve/query";
import { Badge, Button, ConfirmAction, ErrorState } from "@vsolve/ui";
import { useState } from "react";

import { AccessRefusal } from "@/features/access/view/access-refusal";
import type { MilestoneView, TransferView } from "../adapters";
import { useDecideTransfer } from "../queries";

/**
 * Moving the project to a replacement professional — `M2-FE-612` / `M2-BE-545`.
 *
 * ## This is not a checkout, and a screen that looked like one would invent a charge
 *
 * Accepting settles the difference **structurally**, in one server transaction:
 * every unfinished milestone refunds what was funded and nobody earned, drops
 * back to unfunded, and is repriced to the replacement's number, with the
 * agreement's own delta moving by exactly that difference. The money asked for
 * afterwards is **the ordinary stage funding that was always coming**, at the
 * price just accepted. There is no transfer payment, no new payment purpose and
 * nothing to pay here — which is precisely what stops anybody paying twice, and
 * why this panel offers a decision rather than a total.
 *
 * ## Operations proposes; the Customer decides
 *
 * There is no Customer-side initiation to build. Their remaining cost changes,
 * and `07-state-machines-and-permissions.md` §7 does not let Operations change
 * somebody's agreement for them — so the proposal arrives, and this is the
 * answer. The replacement is a bare id on the wire and is never named: identity
 * disclosure follows the same ladder every other M2 read obeys, and a transfer
 * proposal is not the place to widen it.
 *
 * ## Priced per milestone, never as a lump
 *
 * A replacement who names one number for "the rest of it" has not said which of
 * the agreed milestones they are doing, and a Customer accepting a total against
 * a scope nobody restated is the failure this whole record is shaped to prevent.
 * The per-milestone table is therefore the point of the screen and not a detail
 * — and when it cannot be trusted, the panel shows the two totals and says the
 * breakdown is unavailable rather than showing a shorter list of work.
 *
 * ## The number nobody enjoys
 *
 * `material_advance_outstanding_paise` is money the Customer already paid the
 * outgoing professional for materials. This transfer deliberately does **not**
 * recover it and does not hand it to the replacement — that money bought goods,
 * and no command in this system will ever refund it. It is rendered as an open
 * question for support and never as a pending refund. A cancelled **work** stage
 * does have its unearned funding returned; one sentence cannot be true of both,
 * so the panel reads the milestone's kind and says the right one.
 */

export interface VendorTransferPanelProps {
  engagementId: string;
  transfer: TransferView;
  /** Funded material advances the outgoing professional kept. Usually empty. */
  leftWithVendor: readonly MilestoneView[];
  /** "project" — the noun this agreement uses. */
  engagementNoun: string;
  /** "stage" / "stages". */
  stageNoun: string;
  stagesNoun: string;
  onDone: () => void;
}

export function VendorTransferPanel({
  engagementId,
  transfer,
  leftWithVendor,
  engagementNoun,
  stageNoun,
  stagesNoun,
  onDone,
}: VendorTransferPanelProps) {
  const decide = useDecideTransfer();
  const [confirming, setConfirming] = useState<"accept" | "decline" | null>(null);
  const countdown = useServerCountdown(transfer.isDecidable ? transfer.expiresAtIso : null, 60_000);

  // A status this build cannot name offers nothing at all — the same fail-closed
  // rule the amendment panel applies, and for a sharper reason: the optimistic
  // fallback here is "a live proposal you can accept", and accepting moves a
  // whole project to a different professional.
  if (!transfer.isKnownStatus) {
    return (
      <Section>
        <h2 id="transfer-heading" className="text-lg font-semibold text-text">
          We cannot describe this
        </h2>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          There is a change of professional recorded on this {engagementNoun} and
          this app does not recognise the state it is in, so it is not going to
          guess. Nothing about your agreement has changed. Please contact
          support.
        </p>
      </Section>
    );
  }

  if (transfer.status === "DECLINED") {
    return (
      <Section>
        <h2 id="transfer-heading" className="text-lg font-semibold text-text">
          You kept the current professional
        </h2>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          You turned down the replacement we proposed
          {transfer.decidedAt === null ? "" : ` on ${transfer.decidedAt}`}. The
          professional, the {stagesNoun} and the prices are all exactly as they
          were. If the work still is not moving, contact support and we will
          look again.
        </p>
      </Section>
    );
  }

  if (transfer.status === "EXPIRED") {
    return (
      <Section>
        <h2 id="transfer-heading" className="text-lg font-semibold text-text">
          A replacement was offered and the offer ran out
        </h2>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          Nobody answered in time, so nothing changed — the professional, the{" "}
          {stagesNoun} and the prices stand. Replacements are held open for a
          limited time because somebody else is keeping the dates free. Contact
          support if you still need one.
        </p>
      </Section>
    );
  }

  if (transfer.status === "ACCEPTED") {
    return (
      <Section>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 id="transfer-heading" className="text-lg font-semibold text-text">
            This {engagementNoun} moved to a new professional
          </h2>
          <Badge tone="info">Replacement in place</Badge>
        </div>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          You accepted the replacement
          {transfer.appliedAt === null ? "" : ` on ${transfer.appliedAt}`}. The
          unfinished {stagesNoun} are now at the new prices you agreed.
        </p>

        <Totals transfer={transfer} stagesNoun={stagesNoun} />
        <MilestoneTable transfer={transfer} stageNoun={stageNoun} />

        {transfer.hasRefund ? (
          <p className="mt-3 max-w-prose text-sm leading-6 text-text">
            <strong className="font-semibold">{transfer.refundedLabel}</strong> went
            back to you — everything you had funded on those {stagesNoun} that
            nobody had earned. It returns the way you paid it, which can take a
            few working days.
          </p>
        ) : (
          <p className="mt-3 max-w-prose text-sm leading-6 text-text-secondary">
            Nothing was refunded, because nothing you had funded on the
            unfinished {stagesNoun} was still sitting with us.
          </p>
        )}

        <MaterialsLeftBehind
          transfer={transfer}
          leftWithVendor={leftWithVendor}
          engagementNoun={engagementNoun}
        />

        <p className="mt-3 max-w-prose text-sm leading-6 text-text">
          This {engagementNoun} is back at &quot;not started&quot;, because the new
          professional has nothing funded and no clearance to begin. Work
          restarts when you fund the first {stageNoun} above — at the price you
          just accepted, and there is nothing extra to pay for the change itself.
        </p>
      </Section>
    );
  }

  /* PROPOSED — the decision. */
  return (
    <Section>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="transfer-heading" className="text-lg font-semibold text-text">
          We have found somebody to finish this {engagementNoun}
        </h2>
        {/* Never "agreed", "updated" or "new professional". Nothing has moved. */}
        <Badge tone="warning">Proposed — not agreed</Badge>
      </div>

      <p className="mt-2 max-w-prose text-sm leading-6 text-text">
        The professional on this {engagementNoun} is not going to finish it, so we
        have found another one and asked them to price{" "}
        <strong className="font-semibold">every {stageNoun} that is left</strong>,
        one by one. Nothing has changed yet. This is yours to accept or turn
        down.
      </p>

      {transfer.note !== null ? (
        <p className="mt-2 max-w-prose whitespace-pre-wrap text-sm leading-6 text-text-secondary">
          {transfer.note}
        </p>
      ) : null}

      <Totals transfer={transfer} stagesNoun={stagesNoun} />
      <MilestoneTable transfer={transfer} stageNoun={stageNoun} />

      <div className="mt-3 rounded-card border border-line bg-surface-sunken p-4">
        <h3 className="text-sm font-semibold text-text">What happens to your money</h3>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm leading-6 text-text-secondary">
          <li>
            Everything you have funded on the unfinished {stagesNoun} that nobody
            has earned is <strong className="font-semibold">refunded to you first</strong>.
          </li>
          <li>
            Those {stagesNoun} then go back to unfunded at the new prices, and
            you fund them one at a time as you reach them — exactly as before.
          </li>
          <li>
            <strong className="font-semibold">
              There is nothing to pay for the change itself.
            </strong>{" "}
            No new charge is created here, and you are never asked twice for the
            same {stageNoun}.
          </li>
          <li>
            Work stops until you fund the first {stageNoun} again. The new
            professional starts with nothing funded, the same as at the
            beginning.
          </li>
        </ul>
      </div>

      <MaterialsLeftBehind
        transfer={transfer}
        leftWithVendor={leftWithVendor}
        engagementNoun={engagementNoun}
      />

      {countdown !== null && !countdown.isExpired && transfer.expiresAt !== null ? (
        <p className="mt-3 text-sm text-text-secondary">
          The replacement is holding these dates until {transfer.expiresAt}.
        </p>
      ) : null}

      {transfer.isDecidable ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => setConfirming("accept")} disabled={decide.isPending}>
            Accept this replacement
          </Button>
          <Button
            variant="outline"
            onClick={() => setConfirming("decline")}
            disabled={decide.isPending}
          >
            No, keep looking
          </Button>
        </div>
      ) : null}

      <ConfirmAction
        open={confirming === "accept"}
        onOpenChange={(open) => setConfirming(open ? "accept" : null)}
        title="Move this project to the replacement?"
        consequence={
          transfer.direction === "costs_more"
            ? `The unfinished ${stagesNoun} are repriced, and finishing this ${engagementNoun} will cost ${transfer.deltaLabel} more than it would have. Anything you funded and nobody earned comes back to you first, and you fund the new prices one ${stageNoun} at a time. There is nothing to pay right now, and this cannot be undone.`
            : transfer.direction === "costs_less"
              ? `The unfinished ${stagesNoun} are repriced, and finishing this ${engagementNoun} will cost ${transfer.deltaLabel} less than it would have. Anything you funded and nobody earned comes back to you first. There is nothing to pay right now, and this cannot be undone.`
              : `The unfinished ${stagesNoun} are repriced at the same total. Anything you funded and nobody earned comes back to you first. There is nothing to pay right now, and this cannot be undone.`
        }
        confirmLabel="Yes, move it"
        pending={decide.isPending}
        onConfirm={() =>
          decide.mutate(
            { engagementId, transferId: transfer.transferId, accept: true },
            {
              onSuccess: () => {
                setConfirming(null);
                onDone();
              },
            },
          )
        }
      />

      <ConfirmAction
        open={confirming === "decline"}
        onOpenChange={(open) => setConfirming(open ? "decline" : null)}
        title="Turn down this replacement?"
        consequence={`Nothing changes: the current professional, the ${stagesNoun} and the prices all stay exactly as they are. We will not offer this particular replacement again, and if the work still does not move you will need to ask us to find somebody else.`}
        confirmLabel="Yes, turn it down"
        pending={decide.isPending}
        onConfirm={() =>
          decide.mutate(
            { engagementId, transferId: transfer.transferId, accept: false },
            {
              onSuccess: () => {
                setConfirming(null);
                onDone();
              },
            },
          )
        }
      />

      <DecisionRefusal
        error={decide.error}
        engagementNoun={engagementNoun}
        stageNoun={stageNoun}
        onRefresh={onDone}
      />
    </Section>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <section aria-labelledby="transfer-heading" className="mt-8">
      {children}
    </section>
  );
}

/**
 * The two numbers the Customer decides on, and the published difference.
 *
 * Three server fields side by side. The difference is **not** subtracted here:
 * `delta_paise` is held equal to it by a database constraint, so re-deriving it
 * would be a second implementation of an equation that cannot disagree with
 * itself on the server and can here.
 */
function Totals({ transfer, stagesNoun }: { transfer: TransferView; stagesNoun: string }) {
  return (
    <dl className="mt-3 rounded-card border border-line bg-surface">
      <Row
        label={`What the current professional was owed for the unfinished ${stagesNoun}`}
        value={transfer.previousRemainingLabel}
      />
      <Row
        label="What the replacement wants for the same work"
        value={transfer.replacementRemainingLabel}
      />
      {transfer.direction === "same" ? (
        <Row label="Difference" value="No change" strong />
      ) : (
        <Row
          label={transfer.direction === "costs_more" ? "It costs you" : "It saves you"}
          value={`${transfer.deltaLabel} ${transfer.direction === "costs_more" ? "more" : "less"}`}
          strong
        />
      )}
    </dl>
  );
}

/** Every unfinished milestone at both prices — the whole point of the screen. */
function MilestoneTable({ transfer, stageNoun }: { transfer: TransferView; stageNoun: string }) {
  if (transfer.lines === null) {
    return (
      <p className="mt-3 max-w-prose text-sm leading-6 text-text-secondary">
        We cannot show you the price for each {stageNoun} on this replacement, so
        we are not going to show you a partial list — the two totals above are
        the ones that were priced. Ask support for the {stageNoun}-by-{stageNoun}{" "}
        breakdown before you accept.
      </p>
    );
  }

  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-md border-collapse text-sm">
        <caption className="sr-only">
          Each unfinished {stageNoun}, at the agreed price and the replacement&apos;s price
        </caption>
        <thead>
          <tr className="border-b border-line text-left">
            <th scope="col" className="py-2 pr-3 font-medium text-text-secondary">
              What is left
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium text-text-secondary">
              Agreed
            </th>
            <th scope="col" className="py-2 text-right font-medium text-text-secondary">
              Replacement
            </th>
          </tr>
        </thead>
        <tbody>
          {transfer.lines.map((line) => (
            <tr key={line.stageId} className="border-b border-line last:border-0">
              <td className="py-2 pr-3 text-text">{line.label}</td>
              <td className="py-2 pr-3 text-right text-text-secondary">{line.agreedLabel}</td>
              <td className="py-2 text-right font-medium text-text">{line.replacementLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Materials the outgoing professional already bought — an open question, never a
 * refund on its way.
 *
 * The one block on this screen that promises nothing, because there is nothing
 * to promise: this transfer does not recover that money and does not hand it to
 * the replacement, and no command in this system will ever refund it. A cancelled
 * **work** stage is a different sentence entirely and is not made here.
 */
function MaterialsLeftBehind({
  transfer,
  leftWithVendor,
  engagementNoun,
}: {
  transfer: TransferView;
  leftWithVendor: readonly MilestoneView[];
  engagementNoun: string;
}) {
  if (!transfer.hasMaterialOutstanding) return null;

  return (
    <div className="mt-3 rounded-card border border-warning-line bg-warning-surface p-4">
      <h3 className="text-sm font-semibold text-text">
        {transfer.materialOutstandingLabel} you paid for materials stays with the current
        professional
      </h3>
      <p className="mt-1 max-w-prose text-sm leading-6 text-text">
        That money was for goods they were supposed to buy for your job, so it is
        not part of the work being moved. It is{" "}
        <strong className="font-semibold">not refunded and not handed to the replacement</strong> —
        buying the same materials twice would cost you more, not less. Where those
        goods actually went is a question for a person, not for this screen:
        contact support with this {engagementNoun} and we will work it out with
        you.
      </p>
      {leftWithVendor.length > 0 ? (
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm leading-6 text-text-secondary">
          {leftWithVendor.map((milestone) => (
            <li key={milestone.stageId}>
              {milestone.label} — {milestone.fundedLabel} paid
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Why the decision was refused. Both codes mean "re-read", never "press again". */
function DecisionRefusal({
  error,
  engagementNoun,
  stageNoun,
  onRefresh,
}: {
  error: unknown;
  engagementNoun: string;
  stageNoun: string;
  onRefresh: () => void;
}) {
  if (error === null || error === undefined) return null;

  if (isStageDisputed(error)) {
    return (
      <div className="mt-3">
        <ErrorState
          title="A problem you raised has to be settled first"
          message={`A ${stageNoun} on this ${engagementNoun} has an open problem on it. Moving the work to somebody else around that would close your objection by deleting it, so we will not do it. Nothing has changed — we will settle the problem and come back to you.`}
          severity="warning"
          inline
        />
      </div>
    );
  }

  if (isAmendmentNotActionable(error)) {
    return (
      <div className="mt-3">
        <ErrorState
          title="This replacement is no longer on the table"
          message={`It has already been answered, or it ran out, or the work left on this ${engagementNoun} changed after it was priced — in which case the prices were for a list of work that no longer exists, and we will not let you accept them. Nothing has changed. We have re-read it.`}
          severity="warning"
          actionLabel="Refresh"
          onAction={onRefresh}
          inline
        />
      </div>
    );
  }

  return (
    <div className="mt-3">
      <AccessRefusal error={error} attempting="answer this replacement" />
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line p-4 last:border-0">
      <dt className="text-sm text-text-secondary">{label}</dt>
      <dd className={strong ? "shrink-0 text-lg font-semibold text-text" : "shrink-0 text-text"}>
        {value}
      </dd>
    </div>
  );
}
