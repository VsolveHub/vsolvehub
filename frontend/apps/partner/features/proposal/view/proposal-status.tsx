"use client";

import { Badge, Button, Card, ConfirmAction, ErrorState, FactList, formatMoney } from "@vsolve/ui";
import { describeError } from "@vsolve/query";
import { useState } from "react";

import { timeAgo } from "@/lib/format";
import type { EnquiryStatus } from "@/features/enquiry/model/enquiry-state";
import {
  UNREADABLE_PROPOSAL_NOTICE,
  describeProposalStatus,
  describeUsability,
  permissionsFor,
  resolveProposalView,
  type Proposal,
} from "../model/proposal-state";
import { useWithdrawProposal } from "../queries";

/**
 * The quote a vendor already sent, its state, and what they may still do.
 *
 * Closes `M2-FE-313`. Append-only throughout: nothing here edits a submitted
 * quote, because there is no edit — a revision is a new submission that marks
 * the previous row `SUPERSEDED`, so the customer can always see what they were
 * first offered.
 *
 * ## The state this screen has to admit to
 *
 * There is no read that answers "which proposal did I send for this enquiry".
 * Contract 1.21.0 publishes submit, read-by-id and withdraw, and
 * `EnquiryDetail` carries questions and site visits but no proposal. So once the
 * id leaves this tab — a refresh, a second device, tomorrow — the only readable
 * truth is that the invitation is `QUOTED`.
 *
 * `unreadable` is that fact rendered honestly. Nothing is persisted locally to
 * fake the read: a client-held id survives neither a cleared tab nor another
 * phone, and a screen that works on one machine and not the next is worse than
 * one that is limited on both. The vendor is told plainly and offered the thing
 * that still works — sending a revision, which supersedes whatever is with the
 * customer.
 *
 * Requested in `frontend-execution-plan.md` §7.
 */

const TONE = {
  progress: "info",
  settled: "neutral",
  gone: "neutral",
  won: "success",
} as const;

export interface ProposalStatusProps {
  readonly enquiryStatus: EnquiryStatus;
  readonly proposal: Proposal | null;
  readonly requirementId: string;
  /** Opens the composer for a revision. */
  readonly onRevise: () => void;
}

export function ProposalStatus({
  enquiryStatus,
  proposal,
  requirementId,
  onRevise,
}: ProposalStatusProps) {
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);
  const withdraw = useWithdrawProposal();

  const view = resolveProposalView({ enquiryStatus, proposal });

  if (view.kind === "none") return null;

  if (view.kind === "unreadable") {
    return (
      <Card className="flex flex-col gap-3 p-4">
        <h2 className="text-sm font-semibold text-text">Your quote</h2>
        <p className="text-sm leading-6 text-text-secondary">{UNREADABLE_PROPOSAL_NOTICE}</p>
        <Button variant="outline" onClick={onRevise}>
          Send a revised quote
        </Button>
      </Card>
    );
  }

  const record = view.proposal;
  const status = describeProposalStatus(record.status);
  const usability = describeUsability(record.usability);
  const permissions = permissionsFor({ proposal: record, enquiryStatus });
  const presentation = withdraw.error ? describeError(withdraw.error, "mutation") : null;

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text">
          Your quote
          {record.revision > 1 ? (
            <span className="ml-2 font-normal text-text-secondary">
              revision {record.revision}
            </span>
          ) : null}
        </h2>
        <Badge tone={TONE[status.tone]} dot>
          {status.label}
        </Badge>
      </div>

      <p className="text-sm leading-6 text-text-secondary">{status.meaning}</p>

      <FactList
        items={[
          { label: "Total", value: formatMoney(record.total_paise) },
          {
            label: "Tax",
            value:
              record.tax_basis === "INCLUSIVE"
                ? "Included in the total"
                : `${formatMoney(record.tax_paise)} on top`,
          },
          ...(record.rate_paise_per_worker_day !== null
            ? [
                {
                  label: "Rate",
                  value: `${formatMoney(record.rate_paise_per_worker_day)} per worker per day`,
                },
              ]
            : []),
          ...(record.minimum_days !== null
            ? [{ label: "Minimum", value: `${record.minimum_days} days` }]
            : []),
          ...(record.worker_count !== null
            ? [{ label: "Workers", value: String(record.worker_count) }]
            : []),
          ...(record.valid_until !== null
            ? [{ label: "Valid until", value: timeAgo(record.valid_until) }]
            : []),
          { label: "Sent", value: timeAgo(record.submitted_at) },
        ]}
      />

      {usability ? (
        <p className="text-sm leading-6 text-warning-text">{usability}</p>
      ) : null}

      {record.vendor_confirmed_at === null ? (
        // A quote Operations captured by phone. It is not shown to the customer
        // until the vendor confirms it, and confirmation has no published route
        // — so this states where it stands rather than offering a button that
        // cannot exist yet. `M2-FE-705` is where that path gets built.
        <p className="text-sm leading-6 text-warning-text">
          Vsolve recorded this quote on your behalf and it has not been confirmed by you, so the
          customer cannot see it yet. Support will confirm it with you directly.
        </p>
      ) : null}

      {presentation ? (
        <ErrorState
          inline
          title={presentation.title}
          message={presentation.message}
          severity={presentation.severity}
          reference={presentation.reference}
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        {permissions.canSupersede ? (
          <Button variant="outline" onClick={onRevise} disabled={withdraw.isPending}>
            Send a revised quote
          </Button>
        ) : null}

        {permissions.canWithdraw ? (
          <Button
            variant="ghost"
            onClick={() => setConfirmingWithdraw(true)}
            disabled={withdraw.isPending}
            loading={withdraw.isPending}
            loadingLabel="Withdrawing"
          >
            Withdraw it
          </Button>
        ) : null}
      </div>

      <ConfirmAction
        open={confirmingWithdraw}
        onOpenChange={setConfirmingWithdraw}
        title="Withdraw this quote"
        consequence="The customer can no longer choose this quote. Your enquiry stays open, so you can send a new one — but this price is off the table as soon as you confirm, and withdrawing cannot be undone."
        confirmLabel="Withdraw"
        destructive
        pending={withdraw.isPending}
        onConfirm={() =>
          withdraw.mutate(
            { proposalId: record.id, requirementId },
            { onSuccess: () => setConfirmingWithdraw(false) },
          )
        }
      />
    </Card>
  );
}
