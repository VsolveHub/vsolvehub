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
  revalidationNoticeFor,
  traceForInvitation,
  type Proposal,
} from "../model/proposal-state";
import { useMyProposals, useWithdrawProposal } from "../queries";

/**
 * The quote a vendor already sent, its state, and what they may still do.
 *
 * Closes `M2-FE-313`. Append-only throughout: nothing here edits a submitted
 * quote, because there is no edit — a revision is a new submission that marks
 * the previous row `SUPERSEDED`, so the customer can always see what they were
 * first offered.
 *
 * ## The record survives the tab now
 *
 * Until 1.24.0 no read answered "which proposal did I send for this enquiry", so
 * the id lived only as long as the tab that submitted it and this component had
 * an honest third state for that. **`GET /proposals/?requirement=` is
 * published**, so the quote is read back from the server on every mount: a
 * refresh, a second device and a new session all show the same record, and
 * withdraw is reachable again from any of them.
 *
 * The session's own submission is still accepted as a prop and **wins** over the
 * list. It is the newest thing that exists — the 201 that produced it has not
 * necessarily propagated to a cursor page yet — and showing a vendor the quote
 * they superseded thirty seconds ago would be a regression dressed as a refetch.
 *
 * ## The supersession trace is shown, not just the live row
 *
 * Every revision the vendor sent against this invitation is listed under the
 * current one. That is the record: `submit_proposal` never overwrites, the
 * customer keeps seeing what they were originally offered, and a dispute is
 * argued from the chain rather than from the latest row.
 */

const TONE = {
  progress: "info",
  settled: "neutral",
  gone: "neutral",
  won: "success",
} as const;

export interface ProposalStatusProps {
  readonly enquiryStatus: EnquiryStatus;
  readonly invitationId: string;
  readonly requirementId: string;
  /** This session's own submission, if there is one. Newer than any list read. */
  readonly submitted: Proposal | null;
  /** Opens the composer for a revision. */
  readonly onRevise: () => void;
}

export function ProposalStatus({
  enquiryStatus,
  invitationId,
  requirementId,
  submitted,
  onRevise,
}: ProposalStatusProps) {
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);
  const withdraw = useWithdrawProposal();

  // Only asked for once the enquiry says a quote exists, or this session sent
  // one. On an INVITED enquiry there is nothing to find and the request would be
  // a guaranteed empty page on every open.
  const shouldRead = enquiryStatus === "QUOTED" || enquiryStatus === "ACCEPTED";
  const mine = useMyProposals(requirementId, shouldRead);

  const trace = traceForInvitation({
    proposals: mine.data?.results ?? [],
    invitationId,
  });
  const record = submitted ?? trace.current;
  const view = resolveProposalView({ enquiryStatus, proposal: record });

  if (view.kind === "none") return null;

  if (view.kind === "unreadable") {
    return (
      <Card className="flex flex-col gap-3 p-4">
        <h2 className="text-sm font-semibold text-text">Your quote</h2>
        {mine.isPending ? (
          <p className="text-sm leading-6 text-text-secondary">Loading the quote you sent…</p>
        ) : (
          <>
            <p className="text-sm leading-6 text-text-secondary">{UNREADABLE_PROPOSAL_NOTICE}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => void mine.refetch()}
                loading={mine.isFetching}
                loadingLabel="Loading"
              >
                Try again
              </Button>
              <Button variant="ghost" onClick={onRevise}>
                Send a new quote
              </Button>
            </div>
          </>
        )}
      </Card>
    );
  }

  const current = view.proposal;
  const status = describeProposalStatus(current.status);
  const usability = describeUsability(current.usability);
  const revalidation = revalidationNoticeFor(current);
  const permissions = permissionsFor({ proposal: current, enquiryStatus });
  const presentation = withdraw.error ? describeError(withdraw.error, "mutation") : null;

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text">
          Your quote
          {current.revision > 1 ? (
            <span className="ml-2 font-normal text-text-secondary">
              revision {current.revision}
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
          { label: "Total", value: formatMoney(current.total_paise) },
          {
            label: "Tax",
            value:
              current.tax_basis === "INCLUSIVE"
                ? "Included in the total"
                : `${formatMoney(current.tax_paise)} on top`,
          },
          ...(current.rate_paise_per_worker_day !== null
            ? [
                {
                  label: "Rate",
                  value: `${formatMoney(current.rate_paise_per_worker_day)} per worker per day`,
                },
              ]
            : []),
          ...(current.minimum_days !== null
            ? [{ label: "Minimum", value: `${current.minimum_days} days` }]
            : []),
          ...(current.worker_count !== null
            ? [{ label: "Workers", value: String(current.worker_count) }]
            : []),
          ...(current.stages.length > 0
            ? [
                {
                  label: "Broken into",
                  value: `${current.stages.length} ${current.stages.length === 1 ? "part" : "parts"}`,
                },
              ]
            : []),
          ...(current.material_lines.length > 0
            ? [
                {
                  label: "Materials",
                  value: `${current.material_lines.length} ${
                    current.material_lines.length === 1 ? "line" : "lines"
                  }`,
                },
              ]
            : []),
          ...(current.site_visit !== null
            ? [{ label: "Written", value: "On site, after your visit" }]
            : []),
          ...(current.valid_until !== null
            ? [{ label: "Valid until", value: timeAgo(current.valid_until) }]
            : []),
          { label: "Sent", value: timeAgo(current.submitted_at) },
        ]}
      />

      {current.stages.length > 0 ? <StageBreakdown stages={current.stages} /> : null}

      {current.material_lines.length > 0 ? (
        <MaterialBreakdown lines={current.material_lines} />
      ) : null}

      {usability ? <p className="text-sm leading-6 text-warning-text">{usability}</p> : null}

      {revalidation ? (
        <p className="text-sm leading-6 text-warning-text">{revalidation}</p>
      ) : null}

      {current.vendor_confirmed_at === null ? (
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

      {trace.superseded.length > 0 ? <SupersessionTrace rows={trace.superseded} /> : null}

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
            { proposalId: current.id, requirementId },
            { onSuccess: () => setConfirmingWithdraw(false) },
          )
        }
      />
    </Card>
  );
}

/**
 * What the quote is broken into, from the published `ProposalStage` shape.
 *
 * Until 1.24.0 `stages` was an untyped list and the domain read one key, so
 * there was nothing stable to render. `{title, deliverable, amount_paise,
 * ends_on}` is published now — and read defensively, because a stage stored
 * before the shape existed can carry `label` instead of `title` and must degrade
 * to a blank name rather than a crash.
 */
function StageBreakdown({ stages }: { readonly stages: Proposal["stages"] }) {
  return (
    <ul className="flex list-none flex-col gap-2 p-0">
      {stages.map((stage, index) => (
        <li
          key={`${stage.title}-${index}`}
          className="flex items-start justify-between gap-3 rounded-control border border-line p-3"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-text">
              {stage.title.trim() === "" ? `Part ${index + 1}` : stage.title}
            </p>
            {stage.deliverable ? (
              <p className="mt-0.5 text-sm leading-6 text-text-secondary">{stage.deliverable}</p>
            ) : null}
            {stage.ends_on ? (
              <p className="mt-0.5 text-xs text-text-muted">Done by {stage.ends_on}</p>
            ) : null}
          </div>
          <span className="shrink-0 text-sm font-semibold text-text">
            {formatMoney(stage.amount_paise)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The materials, kept visibly apart from the work.
 *
 * `Proposal.material_lines` is published at 1.26.0 and is **not** a stage list.
 * Rendering the two in one column would undo the whole point of the row type:
 * the customer funds a material line as an advance and signs off a stage as
 * work, and the vendor should see their own estimate the way the money will
 * actually move.
 *
 * `quantity` and `unit` are shown only where they say something — a line of one
 * with no unit reads as "1" and a blank, which is noise beside the name the
 * vendor wrote.
 */
function MaterialBreakdown({ lines }: { readonly lines: Proposal["material_lines"] }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        Materials (paid as an advance)
      </h3>
      <ul className="flex list-none flex-col gap-2 p-0">
        {lines.map((line, index) => {
          const measure = [
            line.quantity > 1 ? String(line.quantity) : null,
            line.unit.trim() === "" ? null : line.unit.trim(),
          ]
            .filter((part): part is string => part !== null)
            .join(" ");

          return (
            <li
              key={`${line.title}-${index}`}
              className="flex items-start justify-between gap-3 rounded-control border border-line p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-text">
                  {line.title.trim() === "" ? `Material ${index + 1}` : line.title}
                </p>
                {measure === "" ? null : (
                  <p className="mt-0.5 text-xs text-text-muted">{measure}</p>
                )}
              </div>
              <span className="shrink-0 text-sm font-semibold text-text">
                {formatMoney(line.amount_paise)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Everything this quote replaced.
 *
 * Read-only and never offered as selectable, because it is not: only the live
 * row can be chosen. It is here because append-only is the point — a vendor
 * arguing about what they quoted needs the chain, not the latest number.
 */
function SupersessionTrace({ rows }: { readonly rows: readonly Proposal[] }) {
  return (
    <details className="rounded-control border border-line p-3">
      <summary className="min-h-11 cursor-pointer text-sm font-semibold text-text">
        Earlier versions ({rows.length})
      </summary>
      <ul className="mt-2 flex list-none flex-col gap-2 p-0">
        {rows.map((row) => {
          const status = describeProposalStatus(row.status);
          return (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-text-secondary">
                Revision {row.revision} · {formatMoney(row.total_paise)} · sent{" "}
                {timeAgo(row.submitted_at)}
              </span>
              <Badge tone={TONE[status.tone]}>{status.label}</Badge>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs leading-5 text-text-muted">
        Vsolve never overwrites a quote. The customer can still see each of these, and none of them
        can be chosen once it has been replaced.
      </p>
    </details>
  );
}
