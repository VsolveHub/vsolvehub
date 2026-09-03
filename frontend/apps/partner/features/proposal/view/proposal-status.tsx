"use client";

import { Badge, Button, Card, ConfirmAction, Dialog, ErrorState, FactList, Textarea, formatMoney } from "@vsolve/ui";
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
import { commercialEstimateFromProposal } from "../model/commercial-estimate-draft";
import { useDeclineRevisionRequest, useMyProposals, useWithdrawProposal } from "../queries";
import { EstimatePreviewSheet } from "./estimate-preview-sheet";

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
  /** Customer-facing A5 records are estimates; A3 records are quotes. */
  readonly documentKind?: "quote" | "estimate";
}

export function ProposalStatus({
  enquiryStatus,
  invitationId,
  requirementId,
  submitted,
  onRevise,
  documentKind = "quote",
}: ProposalStatusProps) {
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);
  const [viewingEstimate, setViewingEstimate] = useState(false);
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
  const documentLabel = documentKind === "estimate" ? "estimate" : "quote";
  const documentCopy = (copy: string) =>
    documentKind === "estimate"
      ? copy.replaceAll("quotes", "estimates").replaceAll("quote", "estimate")
      : copy;

  if (view.kind === "none") return null;

  if (view.kind === "unreadable") {
    return (
      <Card className="flex flex-col gap-3 p-4">
        <h2 className="text-sm font-semibold text-text">Your {documentLabel}</h2>
        {mine.isPending ? (
          <p className="text-sm leading-6 text-text-secondary">
            Loading the {documentLabel} you sent…
          </p>
        ) : (
          <>
            <p className="text-sm leading-6 text-text-secondary">
              {documentCopy(UNREADABLE_PROPOSAL_NOTICE)}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => void mine.refetch()}
                loading={mine.isFetching}
                loadingLabel="Loading"
              >
                Try again
              </Button>
              {documentKind === "quote" ? (
                <Button variant="ghost" onClick={onRevise}>
                  Send a new quote
                </Button>
              ) : null}
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
  const permissions = permissionsFor({ proposal: current, enquiryStatus, documentKind });
  const presentation = withdraw.error ? describeError(withdraw.error, "mutation") : null;
  const submittedDraft = commercialEstimateFromProposal(current);

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text">
          Your {documentLabel}
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

      <p className="text-sm leading-6 text-text-secondary">{documentCopy(status.meaning)}</p>

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

      {current.revision_request !== null ? (
        <RevisionRequestPanel
          proposal={current}
          requirementId={requirementId}
          documentLabel={documentLabel}
          onRevise={onRevise}
        />
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
          Vsolve recorded this {documentLabel} on your behalf and it has not been confirmed by you,
          so the customer cannot see it yet. Support will confirm it with you directly.
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 min-[390px]:flex-row">
          <Button onClick={() => setViewingEstimate(true)} disabled={withdraw.isPending}>
            View {documentLabel} details
          </Button>

          {permissions.canSupersede ? (
            <Button variant="outline" onClick={onRevise} disabled={withdraw.isPending}>
              Revise {documentLabel}
            </Button>
          ) : null}
        </div>

        {permissions.canWithdraw ? (
          <div className="border-t border-line pt-2 sm:border-t-0 sm:pt-0">
            <Button
              variant="ghost"
              onClick={() => setConfirmingWithdraw(true)}
              disabled={withdraw.isPending}
              loading={withdraw.isPending}
              loadingLabel="Withdrawing"
              className="text-danger-text"
            >
              Withdraw {documentLabel}
            </Button>
          </div>
        ) : null}
      </div>

      {trace.superseded.length > 0 ? (
        <SupersessionTrace rows={trace.superseded} documentLabel={documentLabel} />
      ) : null}

      <ConfirmAction
        open={confirmingWithdraw}
        onOpenChange={setConfirmingWithdraw}
        title={`Withdraw this ${documentLabel}`}
        consequence={`The customer can no longer choose this ${documentLabel}. Your enquiry stays open, so you can send a new one — but this price is off the table as soon as you confirm, and withdrawing cannot be undone.`}
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

      <EstimatePreviewSheet
        open={viewingEstimate}
        onClose={() => setViewingEstimate(false)}
        draft={submittedDraft}
        preview={current}
        vendorName={`${documentKind === "estimate" ? "Estimate" : "Quote"} revision ${current.revision}`}
        materialList={submittedDraft.materialAdded}
        partnerTurnkey={current.material_fulfilment_mode === "PARTNER_TURNKEY"}
        title={`Your submitted ${documentLabel}`}
        description={`Revision ${current.revision} · this is the detail currently with the customer.`}
        closeLabel="Close"
      />
    </Card>
  );
}

const REVISION_REASON: Record<string, string> = {
  LEAVE_OUT: "Leave something out",
  CHANGE_MATERIALS: "Change materials or finish",
  PHASE_WORK: "Split the work into phases",
  PRICE: "Asked about the price",
  OTHER: "Something else",
};

/**
 * The customer asked for a change — what, and the two honest answers.
 *
 * Accepting is not a button: it is a revised estimate, which supersedes this
 * one and closes the request in the same step. Declining takes a note the
 * customer reads beside their ask, so "no" never arrives as silence. An open
 * request also keeps the five-minute revision window open (`permissionsFor`).
 */
function RevisionRequestPanel({
  proposal,
  requirementId,
  documentLabel,
  onRevise,
}: {
  readonly proposal: Proposal;
  readonly requirementId: string;
  readonly documentLabel: "quote" | "estimate";
  readonly onRevise: () => void;
}) {
  const request = proposal.revision_request;
  const decline = useDeclineRevisionRequest();
  // `excluded_items` is a JSONField published as `unknown`; anything that is not a
  // list of non-empty strings renders as nothing rather than crashing the panel.
  const excludedItems: readonly string[] = Array.isArray(request?.excluded_items)
    ? request.excluded_items.filter((item): item is string => typeof item === "string" && item.trim() !== "")
    : [];
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");
  if (request === null) return null;
  const isOpen = request.status === "OPEN";
  const presentation = decline.error ? describeError(decline.error, "mutation") : null;
  // Basis points, and only ever on a price ask. Nothing here has moved the
  // estimate: the quote stands at `total_paise` until this vendor sends a new
  // one, and the customer can accept it at that price the whole time.
  const askedBps = request.requested_discount_bps ?? null;
  const askedSavingPaise =
    askedBps === null ? 0 : Math.round((proposal.total_paise * askedBps) / 10_000);

  return (
    <div
      className={
        isOpen
          ? "rounded-control border border-info-line bg-info-surface p-3"
          : "rounded-control border border-line bg-surface-sunken p-3"
      }
    >
      <p className="text-sm font-semibold text-text">
        {isOpen
          ? askedBps === null
            ? `The customer asked for a revised ${documentLabel}`
            : "A customer asked about your price"
          : request.status === "ANSWERED"
            ? "You answered their revision request"
            : "You declined their revision request"}
      </p>
      {askedBps !== null ? (
        // The ask in rupees, not percent. "5%" is a number to think about;
        // "you would lose Rs 11,033" is the decision actually being made, and a
        // vendor deserves it stated rather than left to work out.
        <dl className="mt-2 grid gap-1 rounded-control bg-surface px-3 py-2 text-sm tabular-nums">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-text-secondary">You quoted</dt>
            <dd className="font-bold text-text">{formatMoney(proposal.total_paise)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-text-secondary">They asked for</dt>
            <dd className="font-extrabold text-text">
              {formatMoney(proposal.total_paise - askedSavingPaise)}
              <span className="ml-1.5 font-semibold text-text-muted">({askedBps / 100}% off)</span>
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-t border-line pt-1">
            <dt className="text-text-secondary">You would lose</dt>
            <dd className="font-bold text-warning-text">{formatMoney(askedSavingPaise)}</dd>
          </div>
        </dl>
      ) : null}
      <p className="mt-1 text-sm leading-6 text-text-secondary">
        {REVISION_REASON[request.reason_code] ?? request.reason_code}
        {excludedItems.length > 0 ? `: ${excludedItems.join(", ")}` : ""}
        {request.note.trim() !== "" ? ` — “${request.note.trim()}”` : ""}
      </p>
      <p className="mt-0.5 text-xs text-text-muted">Asked {timeAgo(request.created_at)}</p>
      {request.decline_note.trim() !== "" ? (
        <p className="mt-1 text-sm text-text">Your note: “{request.decline_note.trim()}”</p>
      ) : null}
      {presentation ? (
        <ErrorState inline className="mt-2" title={presentation.title} message={presentation.message} severity={presentation.severity} />
      ) : null}
      {isOpen ? (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={onRevise}>
              {askedBps === null
                ? `Send a revised ${documentLabel}`
                : `Agree — re-issue at ${formatMoney(proposal.total_paise - askedSavingPaise)}`}
            </Button>
            {askedBps === null ? null : (
              <Button size="sm" variant="outline" onClick={onRevise}>
                Offer a different figure
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setDeclining(true)}>
              {askedBps === null ? "Decline with a note" : "Cannot move — say why"}
            </Button>
          </div>
          <p className="mt-2 text-xs leading-5 text-text-muted">
            Your {documentLabel} stays live either way. They can still accept it at{" "}
            {formatMoney(proposal.total_paise)} while you decide.
          </p>
        </>
      ) : null}

      <Dialog
        open={declining}
        onOpenChange={setDeclining}
        title="Decline the change?"
        description={`Your ${documentLabel} stays exactly as sent. Tell the customer why — they read it beside their request.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeclining(false)}>Keep thinking</Button>
            <Button
              variant="danger"
              loading={decline.isPending}
              loadingLabel="Declining"
              onClick={() =>
                decline.mutate(
                  { proposalId: proposal.id, requestId: request.id, requirementId, note: note.trim() },
                  { onSuccess: () => setDeclining(false) },
                )
              }
            >
              Decline
            </Button>
          </>
        }
      >
        <Textarea rows={3} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="The false ceiling carries the lights, so it cannot come out on its own." />
      </Dialog>
    </div>
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
            // A decimal string at 1.44.0. Compared numerically so "1.000" still
            // reads as one and is left off the row.
            Number(line.quantity) > 1 ? line.quantity.replace(/\.0+$/u, "") : null,
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
                {line.amount_paise === undefined ? "—" : formatMoney(line.amount_paise)}
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
function SupersessionTrace({
  rows,
  documentLabel,
}: {
  readonly rows: readonly Proposal[];
  readonly documentLabel: "quote" | "estimate";
}) {
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
        Vsolve never overwrites {documentLabel === "estimate" ? "an" : "a"} {documentLabel}. The
        customer can still see each version, and none can be chosen after it has been replaced.
      </p>
    </details>
  );
}
