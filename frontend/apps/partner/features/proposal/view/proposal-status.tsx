"use client";

import {
  Badge,
  Button,
  Card,
  ConfirmAction,
  Dialog,
  ErrorState,
  FactList,
  Textarea,
  formatMoney,
  useT,
} from "@vsolve/ui";
import { describeError } from "@vsolve/query";
import { useState } from "react";

import { timeAgo } from "@/lib/format";
import type { EnquiryStatus } from "@/features/enquiry/model/enquiry-state";
import {
  describeProposalStatus,
  describeUsability,
  documentNouns,
  permissionsFor,
  resolveProposalView,
  revalidationNoticeFor,
  traceForInvitation,
  unreadableProposalNotice,
  type Proposal,
} from "../model/proposal-state";
import { commercialEstimateFromProposal } from "../model/commercial-estimate-draft";
import { useDeclineRevisionRequest, useMyProposals, useWithdrawProposal } from "../queries";
import { EstimatePreviewSheet } from "./estimate-preview-sheet";
import { OverallDiscountDialog } from "./overall-discount-dialog";

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
  const t = useT();
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
  const record =
    submitted !== null && (trace.current === null || submitted.revision >= trace.current.revision)
      ? submitted
      : trace.current;
  const view = resolveProposalView({ enquiryStatus, proposal: record });
  const documentLabel = documentKind === "estimate" ? "estimate" : "quote";
  const { doc } = documentNouns(t, documentKind);

  if (view.kind === "none") return null;

  if (view.kind === "unreadable") {
    return (
      <Card className="flex flex-col gap-3 p-4">
        <h2 className="text-sm font-semibold text-text">{t("proposal.status.yourDoc", { doc })}</h2>
        {mine.isPending ? (
          <p className="text-sm leading-6 text-text-secondary">
            {t("proposal.status.loadingSent", { doc })}
          </p>
        ) : (
          <>
            <p className="text-sm leading-6 text-text-secondary">
              {unreadableProposalNotice(t, documentKind)}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => void mine.refetch()}
                loading={mine.isFetching}
                loadingLabel={t("proposal.status.loading")}
              >
                {t("common.tryAgain")}
              </Button>
              {documentKind === "quote" ? (
                <Button variant="ghost" onClick={onRevise}>
                  {t("proposal.status.sendNewQuote")}
                </Button>
              ) : null}
            </div>
          </>
        )}
      </Card>
    );
  }

  const current = view.proposal;
  const status = describeProposalStatus(current.status, t, documentKind);
  const usability = describeUsability(current.usability, t);
  const revalidation = revalidationNoticeFor(current, t);
  const permissions = permissionsFor({ proposal: current, enquiryStatus, documentKind });
  const presentation = withdraw.error ? describeError(withdraw.error, "mutation") : null;
  const submittedDraft = commercialEstimateFromProposal(current);

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text">
          {t("proposal.status.yourDoc", { doc })}
          {current.revision > 1 ? (
            <span className="ml-2 font-normal text-text-secondary">
              {t("proposal.status.revisionLower", { revision: current.revision })}
            </span>
          ) : null}
        </h2>
        <Badge tone={TONE[status.tone]} dot>
          {status.label}
        </Badge>
      </div>

      <p className="text-sm leading-6 text-text-secondary">{status.meaning}</p>

      {current.discount_paise > 0 ? <AppliedDiscountSummary proposal={current} /> : null}

      <FactList
        items={[
          ...(current.discount_paise > 0
            ? []
            : [{ label: t("proposal.status.fact.total"), value: formatMoney(current.total_paise) }]),
          {
            label: t("proposal.status.fact.tax"),
            value:
              current.tax_basis === "INCLUSIVE"
                ? t("proposal.status.fact.taxIncluded")
                : t("proposal.status.fact.taxOnTop", { amount: formatMoney(current.tax_paise) }),
          },
          ...(current.rate_paise_per_worker_day !== null
            ? [
                {
                  label: t("proposal.status.fact.rate"),
                  value: t("proposal.status.fact.ratePerWorkerDay", {
                    amount: formatMoney(current.rate_paise_per_worker_day),
                  }),
                },
              ]
            : []),
          ...(current.minimum_days !== null
            ? [
                {
                  label: t("proposal.status.fact.minimum"),
                  value: t("proposal.status.fact.minimumDays", { days: current.minimum_days }),
                },
              ]
            : []),
          ...(current.worker_count !== null
            ? [{ label: t("proposal.status.fact.workers"), value: String(current.worker_count) }]
            : []),
          ...(current.stages.length > 0
            ? [
                {
                  label: t("proposal.status.fact.brokenInto"),
                  value: t("proposal.status.fact.parts", { count: current.stages.length }),
                },
              ]
            : []),
          ...(current.material_lines.length > 0
            ? [
                {
                  label: t("proposal.status.fact.materials"),
                  value: t("proposal.status.fact.lines", { count: current.material_lines.length }),
                },
              ]
            : []),
          ...(current.site_visit !== null
            ? [
                {
                  label: t("proposal.status.fact.written"),
                  value: t("proposal.status.fact.writtenOnSite"),
                },
              ]
            : []),
          ...(current.valid_until !== null
            ? [{ label: t("proposal.status.fact.validUntil"), value: timeAgo(current.valid_until, t) }]
            : []),
          { label: t("proposal.status.fact.sent"), value: timeAgo(current.submitted_at, t) },
        ]}
      />

      {current.revision_request !== null ? (
        <RevisionRequestPanel
          proposal={current}
          requirementId={requirementId}
          documentLabel={documentLabel}
          onRevise={onRevise}
        />
      ) : null}

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
          {t("proposal.status.recordedOnBehalf", { doc })}
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
            {t("proposal.status.viewDetails", { doc })}
          </Button>

          {permissions.canSupersede ? (
            <Button variant="outline" onClick={onRevise} disabled={withdraw.isPending}>
              {t("proposal.status.revise", { doc })}
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
              loadingLabel={t("proposal.status.withdrawing")}
              className="text-danger-text"
            >
              {t("proposal.status.withdrawDoc", { doc })}
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
        title={t("proposal.status.withdrawTitle", { doc })}
        consequence={t("proposal.status.withdrawConsequence", { doc })}
        confirmLabel={t("proposal.status.withdraw")}
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
        vendorName={t(
          documentKind === "estimate"
            ? "proposal.status.estimateRevision"
            : "proposal.status.quoteRevision",
          { revision: current.revision },
        )}
        materialList={submittedDraft.materialAdded}
        partnerTurnkey={current.material_fulfilment_mode === "PARTNER_TURNKEY"}
        title={t("proposal.status.yourSubmitted", { doc })}
        description={t("proposal.status.submittedDescription", { revision: current.revision })}
        closeLabel={t("common.close")}
      />
    </Card>
  );
}

/** Catalogue keys for the customer's revision reason codes. */
const REVISION_REASON: Record<string, string> = {
  LEAVE_OUT: "proposal.status.reason.leaveOut",
  CHANGE_MATERIALS: "proposal.status.reason.changeMaterials",
  PHASE_WORK: "proposal.status.reason.phaseWork",
  PRICE: "proposal.status.reason.price",
  OTHER: "proposal.status.reason.other",
};

function AppliedDiscountSummary({ proposal }: { readonly proposal: Proposal }) {
  const t = useT();
  const percentLabel =
    proposal.discount_bps === null
      ? null
      : t("proposal.status.percentOff", { percent: proposal.discount_bps / 100 });
  return (
    <section
      aria-labelledby="applied-discount-title"
      className="rounded-card border border-success-line bg-success-surface p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id="applied-discount-title" className="text-2xl font-extrabold tabular-nums text-text">
          {formatMoney(proposal.total_paise)}
        </p>
        {percentLabel ? <Badge tone="success">{percentLabel}</Badge> : null}
      </div>
      <dl className="mt-3 grid gap-1.5 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-text-secondary">{t("proposal.status.originalEstimate")}</dt>
          <dd className="tabular-nums text-text-secondary line-through">
            {formatMoney(proposal.discount_base_paise)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-text-secondary">{t("proposal.status.overallDiscount")}</dt>
          <dd className="font-bold tabular-nums text-success-text">
            −{formatMoney(proposal.discount_paise)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t border-success-line pt-2">
          <dt className="font-extrabold text-text">{t("proposal.status.finalCustomerTotal")}</dt>
          <dd className="font-extrabold tabular-nums text-text">
            {formatMoney(proposal.total_paise)}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-xs leading-5 text-success-text">
        {t("proposal.status.discountApplied")}
      </p>
    </section>
  );
}

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
  const t = useT();
  const { doc } = documentNouns(t, documentLabel);
  const request = proposal.revision_request;
  const decline = useDeclineRevisionRequest();
  // `excluded_items` is a JSONField published as `unknown`; anything that is not a
  // list of non-empty strings renders as nothing rather than crashing the panel.
  const excludedItems: readonly string[] = Array.isArray(request?.excluded_items)
    ? request.excluded_items.filter((item): item is string => typeof item === "string" && item.trim() !== "")
    : [];
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");
  const [discounting, setDiscounting] = useState(false);
  const [discountMode, setDiscountMode] = useState<"PERCENT" | "FIXED">("PERCENT");
  if (request === null) return null;
  const isOpen = request.status === "OPEN";
  const presentation = decline.error ? describeError(decline.error, "mutation") : null;
  // Basis points, and only ever on a price ask. Nothing here has moved the
  // estimate: the quote stands at `total_paise` until this vendor sends a new
  // one, and the customer can accept it at that price the whole time.
  const askedBps = request.requested_discount_bps ?? null;
  const askedSavingPaise =
    askedBps === null ? 0 : Math.round((proposal.total_paise * askedBps) / 10_000);

  if (isOpen && askedBps !== null) {
    return (
      <>
        <section
          aria-labelledby="overall-discount-request"
          className="rounded-card border border-line bg-surface-sunken p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p id="overall-discount-request" className="text-sm font-extrabold text-text">
              {t("proposal.status.price")}
            </p>
            <Badge tone="neutral">{t("proposal.status.requestedNotApplied")}</Badge>
          </div>
          <dl className="mt-3 grid gap-1.5 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-text-secondary">{t("proposal.status.currentEstimate")}</dt>
              <dd className="font-bold tabular-nums text-text">
                {formatMoney(proposal.total_paise)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-text-secondary">{t("proposal.status.customerRequested")}</dt>
              <dd className="font-bold text-text">
                {t("proposal.status.percentOverall", { percent: askedBps / 100 })}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-text-secondary">{t("proposal.status.overallDiscount")}</dt>
              <dd className="font-bold tabular-nums text-success-text">
                −{formatMoney(askedSavingPaise)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-line pt-2">
              <dt className="font-extrabold text-text">{t("proposal.status.newTotalIfApplied")}</dt>
              <dd className="text-lg font-extrabold tabular-nums text-text">
                {formatMoney(proposal.total_paise - askedSavingPaise)}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-text-muted">
            {t("proposal.status.requestedAgo", { when: timeAgo(request.created_at, t) })}
          </p>
          {request.note.trim() !== "" ? (
            <p className="mt-2 text-sm leading-6 text-text-secondary">“{request.note.trim()}”</p>
          ) : null}
          {presentation ? (
            <ErrorState
              inline
              className="mt-3"
              title={presentation.title}
              message={presentation.message}
              severity={presentation.severity}
            />
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                setDiscountMode("PERCENT");
                setDiscounting(true);
              }}
            >
              {t("proposal.status.applyPercent", { percent: askedBps / 100 })}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDiscountMode("FIXED");
                setDiscounting(true);
              }}
            >
              {t("proposal.status.setAnotherDiscount")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDeclining(true)}>
              {t("proposal.status.keepCurrentPrice")}
            </Button>
          </div>
          <p className="mt-2 text-xs leading-5 text-text-muted">
            {t("proposal.status.scopeUnchanged")}
          </p>
        </section>

        <Dialog
          open={declining}
          onOpenChange={setDeclining}
          title={t("proposal.status.keepPriceTitle")}
          description={t("proposal.status.keepPriceDescription", { doc })}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDeclining(false)}>
                {t("common.back")}
              </Button>
              <Button
                variant="danger"
                loading={decline.isPending}
                loadingLabel={t("proposal.status.keepingCurrentPrice")}
                onClick={() =>
                  decline.mutate(
                    {
                      proposalId: proposal.id,
                      requestId: request.id,
                      requirementId,
                      note: note.trim(),
                    },
                    { onSuccess: () => setDeclining(false) },
                  )
                }
              >
                {t("proposal.status.keepCurrentPrice")}
              </Button>
            </>
          }
        >
          <Textarea
            rows={3}
            maxLength={1000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t("proposal.status.keepPricePlaceholder")}
          />
        </Dialog>

        <OverallDiscountDialog
          open={discounting}
          onClose={() => setDiscounting(false)}
          proposal={proposal}
          requestId={request.id}
          requestedBps={askedBps}
          requirementId={requirementId}
          initialMode={discountMode}
        />
      </>
    );
  }

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
            ? t("proposal.status.askedForRevised", { doc })
            : t("proposal.status.askedAboutPrice")
          : request.status === "ANSWERED"
            ? t("proposal.status.answeredRequest")
            : t("proposal.status.declinedRequest")}
      </p>
      {askedBps !== null ? (
        // The ask in rupees, not percent. "5%" is a number to think about;
        // "you would lose Rs 11,033" is the decision actually being made, and a
        // vendor deserves it stated rather than left to work out.
        <dl className="mt-2 grid gap-1 rounded-control bg-surface px-3 py-2 text-sm tabular-nums">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-text-secondary">{t("proposal.status.youQuoted")}</dt>
            <dd className="font-bold text-text">{formatMoney(proposal.total_paise)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-text-secondary">{t("proposal.status.theyAskedFor")}</dt>
            <dd className="font-extrabold text-text">
              {formatMoney(proposal.total_paise - askedSavingPaise)}
              <span className="ml-1.5 font-semibold text-text-muted">
                ({t("proposal.status.percentOff", { percent: askedBps / 100 })})
              </span>
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-t border-line pt-1">
            <dt className="text-text-secondary">{t("proposal.status.youWouldLose")}</dt>
            <dd className="font-bold text-warning-text">{formatMoney(askedSavingPaise)}</dd>
          </div>
        </dl>
      ) : null}
      <p className="mt-1 text-sm leading-6 text-text-secondary">
        {(() => {
          const reasonKey = REVISION_REASON[request.reason_code];
          return reasonKey === undefined ? request.reason_code : t(reasonKey);
        })()}
        {excludedItems.length > 0 ? `: ${excludedItems.join(", ")}` : ""}
        {request.note.trim() !== "" ? ` — “${request.note.trim()}”` : ""}
      </p>
      <p className="mt-0.5 text-xs text-text-muted">
        {t("proposal.status.askedAgo", { when: timeAgo(request.created_at, t) })}
      </p>
      {request.decline_note.trim() !== "" ? (
        <p className="mt-1 text-sm text-text">
          {t("proposal.status.yourNote", { note: request.decline_note.trim() })}
        </p>
      ) : null}
      {presentation ? (
        <ErrorState inline className="mt-2" title={presentation.title} message={presentation.message} severity={presentation.severity} />
      ) : null}
      {isOpen ? (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={onRevise}>
              {askedBps === null
                ? t("proposal.status.sendRevised", { doc })
                : t("proposal.status.agreeReissue", {
                    amount: formatMoney(proposal.total_paise - askedSavingPaise),
                  })}
            </Button>
            {askedBps === null ? null : (
              <Button size="sm" variant="outline" onClick={onRevise}>
                {t("proposal.status.offerDifferentFigure")}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setDeclining(true)}>
              {askedBps === null
                ? t("proposal.status.declineWithNote")
                : t("proposal.status.cannotMove")}
            </Button>
          </div>
          <p className="mt-2 text-xs leading-5 text-text-muted">
            {t("proposal.status.staysLive", { doc, amount: formatMoney(proposal.total_paise) })}
          </p>
        </>
      ) : null}

      <Dialog
        open={declining}
        onOpenChange={setDeclining}
        title={t("proposal.status.declineTitle")}
        description={t("proposal.status.declineDescription", { doc })}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeclining(false)}>
              {t("proposal.status.keepThinking")}
            </Button>
            <Button
              variant="danger"
              loading={decline.isPending}
              loadingLabel={t("proposal.status.declining")}
              onClick={() =>
                decline.mutate(
                  { proposalId: proposal.id, requestId: request.id, requirementId, note: note.trim() },
                  { onSuccess: () => setDeclining(false) },
                )
              }
            >
              {t("proposal.status.decline")}
            </Button>
          </>
        }
      >
        <Textarea rows={3} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("proposal.status.declinePlaceholder")} />
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
  const t = useT();
  return (
    <ul className="flex list-none flex-col gap-2 p-0">
      {stages.map((stage, index) => (
        <li
          key={`${stage.title}-${index}`}
          className="flex items-start justify-between gap-3 rounded-control border border-line p-3"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-text">
              {stage.title.trim() === ""
                ? t("proposal.status.partN", { n: index + 1 })
                : stage.title}
            </p>
            {stage.deliverable ? (
              <p className="mt-0.5 text-sm leading-6 text-text-secondary">{stage.deliverable}</p>
            ) : null}
            {stage.ends_on ? (
              <p className="mt-0.5 text-xs text-text-muted">
                {t("proposal.status.doneBy", { date: stage.ends_on })}
              </p>
            ) : null}
          </div>
          <span className="shrink-0 text-sm font-semibold text-text">
            {formatMoney(stage.discounted_amount_paise)}
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
  const t = useT();
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        {t("proposal.status.materialsAdvance")}
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
                  {line.title.trim() === ""
                    ? t("proposal.status.materialN", { n: index + 1 })
                    : line.title}
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
  const t = useT();
  return (
    <details className="rounded-control border border-line p-3">
      <summary className="min-h-11 cursor-pointer text-sm font-semibold text-text">
        {t("proposal.status.earlierVersions", { count: rows.length })}
      </summary>
      <ul className="mt-2 flex list-none flex-col gap-2 p-0">
        {rows.map((row) => {
          const status = describeProposalStatus(row.status, t);
          return (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-text-secondary">
                {t("proposal.status.traceRow", {
                  revision: row.revision,
                  amount: formatMoney(row.total_paise),
                  when: timeAgo(row.submitted_at, t),
                })}
              </span>
              <Badge tone={TONE[status.tone]}>{status.label}</Badge>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs leading-5 text-text-muted">
        {t(
          documentLabel === "estimate"
            ? "proposal.status.neverOverwrites.estimate"
            : "proposal.status.neverOverwrites.quote",
        )}
      </p>
    </details>
  );
}
