"use client";

import { describeError, isStageNotFundable, type StageKind } from "@vsolve/query";

import {
  REQUESTS_HREF,
  engagementListHref,
  requestHref,
  stageHref,
} from "@/lib/routes";
import { Badge, Button, ErrorState, Skeleton, buttonStyles } from "@vsolve/ui";
import Link from "next/link";

import { AccessRefusal } from "@/features/access/view/access-refusal";
import { toAmendmentsView, toEngagementView, type EngagementView, type StageView } from "../adapters";
import { useEngagement, useEngagementAmendments, useFundStage } from "../queries";
import { AgreedWorkPanel } from "./agreed-work-panel";
import { AgreementHistory } from "./agreement-history";
import { AmendmentPanel } from "./amendment-panel";
import { CompletionPanel } from "./completion-panel";
import { EngagementTimeline } from "./engagement-timeline";
import {
  EngagementStatusBadge,
  StageKindBadge,
  StageStatusBadge,
  nextActionCopy,
  nounsFor,
  stageKindCopy,
  type ModeNouns,
} from "./engagement-status";
import { NotBuiltYet } from "./not-built-yet";

/**
 * The engagement workspace — `M2-FE-415`..`418` (Wave A2) and `M2-FE-509`,
 * `511`, `512`, `608`, `610`, `613` (Wave A3).
 *
 * One route for both archetypes, because there is one spine. What changes is the
 * nouns, the money panels and which promises the screen is allowed to make —
 * never the structure.
 *
 * ## The first thing this screen reads, and everything else follows from it
 *
 * `commercial_mode`. It is the field that decides whether the UI promises Vsolve
 * protection or tells the Customer to settle directly with the vendor, and it is
 * published rather than derived precisely so a client cannot keep promising
 * protection through a policy change.
 *
 * - **`LEAD_ONLY` (A3).** The Customer pays the vendor directly. Service
 *   payment, service refunds and warranty are **between the Customer and the
 *   vendor**, and Vsolve's protection is matching, quote support and
 *   replacement. This screen must never describe it as a protected booking, and
 *   the panel below says the opposite in as many words — because a Customer who
 *   believes they are covered will not ask the questions that actually protect
 *   them.
 * - **`MANAGED_PAYMENT_REQUIRED` (A5).** One stage at a time, **at face value**.
 *   There is no stage credit: the visit-plan money was spent on the visits
 *   themselves, and discounting a stage by it would pay for those visits twice
 *   out of the vendor's work. Nothing on this screen subtracts anything from a
 *   stage.
 * - **Anything else** renders as "we cannot describe this". On this surface the
 *   optimistic fallback is "protected booking", which is the one claim M2 must
 *   not make wrongly.
 *
 * ## Money is read, never re-added
 *
 * Six running totals are published on the engagement and four per stage, and
 * `staged_total_paise = total_paise + amendment_delta_paise` is a database
 * constraint — so "agreed, then changed by, now owed" is three published numbers
 * side by side. Wave A2 summed `FUNDED` stages to get a funded total because no
 * field carried one; that arithmetic is gone.
 *
 * ## Stage kind, and why it changes the copy rather than the layout
 *
 * `EngagementStage.kind` (1.26.0) separates a work milestone from a
 * `MATERIAL_ADVANCE`. Material money is **spent, not earned**: it is not
 * recovered like an unearned work stage when a project ends early
 * (`M2-BE-543`), so what a Customer consents to when they fund one is a
 * different thing. The row therefore carries its own tag and its own funding
 * sentence, and an unrecognised kind gets **no funding control at all** —
 * asking somebody to pay for something this app cannot name is worse than
 * making them wait for a newer build.
 *
 * ## What is deliberately absent
 *
 * `M2-FE-612`, the vendor-replacement path, needs C5 and is marked rather than
 * mocked. The receipt is no longer absent: `Engagement.access_receipt` landed
 * at 1.26.0 and is a **reference, not a document** — see "The record" below.
 */

export interface EngagementScreenProps {
  engagementId: string;
}

export function EngagementScreen({ engagementId }: EngagementScreenProps) {
  const engagementQuery = useEngagement(engagementId);
  const amendmentsQuery = useEngagementAmendments(engagementId);
  const fund = useFundStage();

  const view = engagementQuery.data === undefined ? null : toEngagementView(engagementQuery.data);
  const amendments = amendmentsQuery.data === undefined ? null : toAmendmentsView(amendmentsQuery.data);
  // Only known once the record has loaded. A failed read falls back to the
  // list, which is a real page, rather than to a requirement id we do not have.
  const requestLink = view === null ? REQUESTS_HREF : requestHref(view.requirementId);
  const nouns = nounsFor(view?.mode ?? "unknown");

  if (engagementQuery.isPending) {
    return (
      <Wrapper>
        <div aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading your agreement</span>
          <Skeleton className="h-64 w-full" />
        </div>
      </Wrapper>
    );
  }

  if (view === null) {
    const presentation = describeError(engagementQuery.error, "read");
    return (
      <Wrapper>
        <ErrorState
          title={presentation.title}
          message={presentation.message}
          severity={presentation.severity}
          actionLabel="Try again"
          onAction={() => void engagementQuery.refetch()}
          reference={presentation.reference}
        />
        <BackLink href={requestLink} label="Back to this request" />
      </Wrapper>
    );
  }

  const refetchAll = () => {
    void engagementQuery.refetch();
    void amendmentsQuery.refetch();
  };

  return (
    <Wrapper>
      <header>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="text-xl font-semibold text-text">{nouns.engagementTitle}</h1>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {view.isDisputed ? <Badge tone="danger">Problem raised</Badge> : null}
            <EngagementStatusBadge status={view.status} />
          </div>
        </div>
        {view.createdAt !== null ? (
          <p className="mt-1 text-sm text-text-secondary">Agreed on {view.createdAt}</p>
        ) : null}
      </header>

      <ModePanel view={view} />

      {/* `M2-FE-608`: progress, active stage and next action, at the top, from
          the server's own numbers. */}
      <ProgressPanel view={view} nouns={nouns} />

      {/* `M2-FE-509`: who is doing the work, the agreed crew composition and the
          contact rule — read back off the quote the engagement was frozen from,
          because the engagement projection carries none of it. */}
      <AgreedWorkPanel
        engagement={view}
        nouns={nouns}
        quotesHref={`${requestLink}/quotes`}
      />

      <section aria-labelledby="totals-heading" className="mt-6">
        <h2 id="totals-heading" className="text-lg font-semibold text-text">
          What was agreed
        </h2>
        <dl className="mt-3 rounded-card border border-line bg-surface">
          {/* Three published numbers, not a subtraction. `total_paise` never
              moves, so the number both parties originally agreed to stays
              readable beside the number they now owe. */}
          <Row label="Originally agreed" value={view.totalLabel} />
          {view.amendmentDeltaPaise !== 0 ? (
            <Row
              label={view.amendmentDeltaPaise < 0 ? "Changes took off" : "Changes added"}
              value={view.amendmentDeltaLabel}
            />
          ) : null}
          <Row label="Agreed now" value={view.stagedTotalLabel} strong />
          <Row label="Tax" value={view.taxLabel} />
          {view.mode === "managed" ? (
            <>
              <Row label="You have funded" value={view.fundedTotalLabel} />
              <Row label="Approved" value={view.approvedTotalLabel} />
              <Row label="Paid to the professional" value={view.releasedTotalLabel} />
              {view.hasRefund ? (
                <Row label="Refunded to you" value={view.refundedTotalLabel} />
              ) : null}
            </>
          ) : null}
          {view.commissionTreatment !== null ? (
            <Row label="Commission" value={view.commissionTreatment} />
          ) : null}
        </dl>
      </section>

      <StageList
        view={view}
        nouns={nouns}
        onFund={(stageId) => fund.mutate({ engagementId, stageId })}
        isFunding={fund.isPending}
      />

      {isStageNotFundable(fund.error) ? (
        <div className="mt-4">
          <ErrorState
            title={`That ${nouns.stage} cannot be funded right now`}
            message="Either it is already funded, an earlier one is not, or this agreement is paid directly to the professional. We have re-read it — what you see now is what is actually there."
            severity="warning"
            inline
          />
        </div>
      ) : (
        <div className="mt-4">
          <AccessRefusal error={fund.error} attempting={`fund this ${nouns.stage}`} />
        </div>
      )}

      <AmendmentPanel engagement={view} nouns={nouns} />

      <CompletionPanel engagement={view} nouns={nouns} onDone={refetchAll} />

      {/* `M2-FE-612` — what happens if the professional walks away. Needs C5;
          nothing publishes what transfers or what the price difference would be,
          and inventing either would be the client authoring a remedy. Shown only
          where it is a live question. */}
      {view.status === "CANCELLED" || view.isDisputed ? (
        <NotBuiltYet
          className="mt-8"
          title="If the professional cannot finish"
          body="Moving the job to somebody else — what stays funded, what carries over and what the price difference would be — is not built yet. Nothing you have funded is lost. Contact support and we will work it out with you before anything moves."
          taskId="M2-FE-612"
        />
      ) : null}

      <section aria-labelledby="history-heading" className="mt-8">
        <h2 id="history-heading" className="text-lg font-semibold text-text">
          What was agreed, and how it changed
        </h2>
        {amendments === null ? (
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            We could not read the change history just now, so we are not going to
            show you a version of this agreement we cannot vouch for.
          </p>
        ) : (
          <AgreementHistory
            engagement={view}
            amendments={amendments}
            originalTotalPaise={view.stagedTotalPaise - view.amendmentDeltaPaise}
          />
        )}
      </section>

      <EngagementTimeline engagementId={engagementId} />

      <section aria-labelledby="record-heading" className="mt-8">
        <h2 id="record-heading" className="text-lg font-semibold text-text">
          The record
        </h2>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          What you asked for, who was invited, what they quoted, when they visited
          and what you chose all stay on the request it came from, for both of
          you.
        </p>

        <AccessReceiptPanel view={view} />

        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={requestLink} className={buttonStyles({ variant: "outline" })}>
            Open the full history
          </Link>
          {view.mode !== "unknown" ? (
            <Link href={engagementListHref(view.mode)} className={buttonStyles({ variant: "ghost" })}>
              All your {nouns.engagement}s
            </Link>
          ) : null}
        </div>
      </section>
    </Wrapper>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex w-full max-w-2xl flex-col px-4 pb-16 pt-6">{children}</div>;
}

function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <div className="mt-8">
      <Link href={href} className={buttonStyles({ variant: "ghost" })}>
        {label}
      </Link>
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line p-4 last:border-0">
      <dt className="text-sm text-text-secondary">{label}</dt>
      <dd className={strong ? "text-lg font-semibold text-text" : "text-text"}>{value}</dd>
    </div>
  );
}

/**
 * The access fee's receipt — `M2-FE-418`, closed by 1.26.0.
 *
 * **A number, not a link, and deliberately not called an invoice.**
 * `AccessReceipt` carries `{kind, number, series, sequence, amount_paise}` and
 * no document id: `TaxDocument.order` is not nullable and an access fee has no
 * `Order`, so there is nothing to download. The number is allocated from the
 * same gapless `commerce.DocumentSequence` under an `M2A-` series, which makes
 * it exactly what it is presented as — the durable reference a Customer quotes
 * to support. GST treatment of both access fees is an open owner decision, so
 * this screen does not use the word "invoice" or imply a tax document exists.
 *
 * `null` means one of three things — no fee charged yet, a plan covered entirely
 * by a reclassification credit, or a row that predates receipt numbering — and
 * none of them is an error. The panel says there is no number rather than
 * asserting nothing was ever paid, because it cannot tell the three apart.
 */
function AccessReceiptPanel({ view }: { view: EngagementView }) {
  const receipt = view.accessReceipt;

  if (receipt === null) {
    return (
      <p className="mt-3 max-w-prose text-sm leading-6 text-text-secondary">
        There is no access-fee receipt number on this agreement. That is normal
        if nothing was charged to reach it. If you paid one and it is not here,
        contact support with the date and we will find it.
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-card border border-line bg-surface-sunken p-4">
      <h3 className="text-sm font-semibold text-text">Your receipt number</h3>
      <p className="mt-1 font-mono text-base text-text">{receipt.number}</p>
      <p className="mt-1 text-sm text-text-secondary">
        {receipt.purpose} · {receipt.amountLabel}
      </p>
      <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
        Quote this number to support and they can find the payment. It is a
        receipt reference for the fee you paid us — not a tax invoice, and not
        the money you pay the professional for the work itself.
      </p>
    </div>
  );
}

/** `M2-FE-415` / `M2-FE-416` — what this platform is and is not responsible for. */
function ModePanel({ view }: { view: EngagementView }) {
  if (view.mode === "lead_only") {
    return (
      <section className="mt-4 rounded-card border border-warning-line bg-warning-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-semibold text-text">You pay the professional directly</h2>
          <Badge tone="warning">Not a Vsolve booking</Badge>
        </div>
        <p className="mt-2 max-w-prose text-sm leading-6 text-text">
          We connected you and we will help if the connection fails — we will find
          you somebody else. We do <strong className="font-semibold">not</strong>{" "}
          hold your money for this work, so{" "}
          <strong className="font-semibold">
            payment, refunds and any guarantee on the work are between you and
            them
          </strong>
          . Agree what you are paying, and when, before anybody starts.
        </p>
        {/* `M2-FE-509` — the contact rule, from the server's own field. No phone
            number is published anywhere at 1.25.0, so this says when contact is
            permitted and never implies a number is available here. */}
        <p className="mt-2 text-sm text-text-secondary">
          {view.contactReleasedAt !== null
            ? `You can contact each other from ${view.contactReleasedAt}. We do not show their number on this screen — it reaches you the way we agreed with them.`
            : "Contact details are not released yet."}
        </p>
      </section>
    );
  }

  if (view.mode === "managed") {
    return (
      <section className="mt-4 rounded-card border border-success-line bg-success-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-semibold text-text">You pay through Vsolve, one stage at a time</h2>
          <Badge tone="success">Staged funding</Badge>
        </div>
        <p className="mt-2 max-w-prose text-sm leading-6 text-text">
          You are never asked for the whole project up front. Each stage is funded
          when it starts, and the money reaches the professional after you have
          approved what they did. If the work stops, only the unearned stages are
          at stake.
        </p>
        <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
          What you paid for the site visits is separate and is already spent — it
          paid the professionals who came out and wrote your estimates. It does
          not come off these stages.
        </p>
        {view.workMayStartAt === null ? (
          <p className="mt-2 text-sm text-text-secondary">
            Work starts once the first stage is funded.
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section className="mt-4 rounded-card border border-line bg-surface-sunken p-4">
      <h2 className="font-semibold text-text">We cannot describe this agreement</h2>
      <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
        This app does not recognise how this job is being paid for, so it is not
        going to guess. Nothing here is a promise about who holds your money.
      </p>
    </section>
  );
}

/**
 * The kind of the row the next action is about, or null.
 *
 * Only two of the six actions are about one row, and they are about *different*
 * rows: funding is about the next fundable stage and a review is about the
 * earliest one awaiting review. Reading either from `activeStage` would name
 * the wrong row on a project where a milestone is in progress while a materials
 * line waits to be paid for.
 */
function actionStageKind(view: EngagementView): StageKind | null {
  if (view.nextAction === "fund_stage") return view.nextFundableStageKind;
  if (view.nextAction !== "review_stage") return null;
  const reviewing = view.stagesAwaitingReviewIds[0] ?? null;
  if (reviewing === null) return null;
  return view.stages.find((stage) => stage.stageId === reviewing)?.kind ?? null;
}

/** `M2-FE-608` — progress, the active stage and the one next action. */
function ProgressPanel({ view, nouns }: { view: EngagementView; nouns: ModeNouns }) {
  const { done, total } = view.progress;
  const active = view.stages.find((stage) => stage.stageId === view.activeStageId) ?? null;

  return (
    <section aria-labelledby="progress-heading" className="mt-6">
      <h2 id="progress-heading" className="sr-only">
        Where this has got to
      </h2>
      <div className="rounded-card border border-line bg-surface p-4">
        <p className="text-sm text-text-secondary">
          {/* Counted in {nouns.stages}, not in money — a money ratio reads 0% for
              a finished lead-only booking, because Vsolve collects nothing. */}
          {done} of {total} {total === 1 ? nouns.stage : nouns.stages} done
        </p>
        {active !== null ? (
          <p className="mt-1 font-medium text-text">
            Now: {active.label}
            {active.scheduledOn !== null ? ` · ${active.scheduledOn}` : ""}
          </p>
        ) : null}
        <p className="mt-2 text-sm leading-6 text-text">
          {nextActionCopy(view.nextAction, nouns, actionStageKind(view))}
        </p>
      </div>
    </section>
  );
}

/**
 * The stages, the single funding control, and the way in to each review.
 *
 * Exactly one stage can carry a funding button, and it is the first unsettled
 * one: `POST /engagement-stages/{id}/funding/` refuses a later stage while an
 * earlier one is unfunded, so a second button would be a second refusal. A stage
 * whose charge is in flight shows the pending state and no control — `M2-FE-417`,
 * and the same rule as every other charge in this wave: **never a false
 * confirmed state, and never a second charge while the first is unresolved.**
 */
function StageList({
  view,
  nouns,
  onFund,
  isFunding,
}: {
  view: EngagementView;
  nouns: ModeNouns;
  onFund: (stageId: string) => void;
  isFunding: boolean;
}) {
  if (view.stages.length === 0) return null;

  return (
    <section aria-labelledby="stages-heading" className="mt-6">
      <h2 id="stages-heading" className="text-lg font-semibold text-text">
        {nouns.stagesHeading}
      </h2>
      <ol className="mt-3 flex list-none flex-col gap-2 p-0">
        {view.stages.map((stage) => (
          <StageRow
            key={stage.stageId}
            stage={stage}
            mode={view.mode}
            nouns={nouns}
            reviewHref={stageHref(view.engagementId, stage.stageId)}
            onFund={onFund}
            isFunding={isFunding}
          />
        ))}
      </ol>
    </section>
  );
}

function StageRow({
  stage,
  mode,
  nouns,
  reviewHref,
  onFund,
  isFunding,
}: {
  stage: StageView;
  mode: EngagementView["mode"];
  nouns: ModeNouns;
  reviewHref: string;
  onFund: (stageId: string) => void;
  isFunding: boolean;
}) {
  const kindCopy = stageKindCopy(stage.kind, nouns);
  const isMaterial = stage.kind === "material_advance";

  return (
    <li className="rounded-card border border-line p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-text">{stage.label}</p>
          {stage.scheduledOn !== null ? (
            <p className="mt-0.5 text-sm text-text-secondary">{stage.scheduledOn}</p>
          ) : null}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StageStatusBadge status={stage.status} />
            {/* `EngagementStage.kind` — a materials line is money for goods, not
                a milestone somebody performs, and it is laid out after every
                work stage on purpose. Tagged so the row is not read as one. */}
            <StageKindBadge kind={stage.kind} nouns={nouns} />
          </div>
        </div>
        <p className="shrink-0 font-medium text-text">{stage.amountLabel}</p>
      </div>

      {/* The review is the money screen, so it gets a real link whenever there is
          something to decide — and whenever there is not, so the evidence and
          the decision that was taken stay readable. */}
      {stage.status !== "PENDING" ? (
        <div className="mt-3">
          <Link href={reviewHref} className={buttonStyles({ variant: stage.canApprove ? "primary" : "outline" })}>
            {stage.canApprove
              ? isMaterial
                ? "Check the materials"
                : "Check the work"
              : isMaterial
                ? "See this materials payment"
                : `See this ${nouns.stage}`}
          </Link>
        </div>
      ) : null}

      {stage.clock === "auto_approves" && stage.autoApprovalDeadlineLabel !== null ? (
        <p className="mt-2 text-sm leading-6 text-warning-text">
          Approved automatically on {stage.autoApprovalDeadlineLabel} if you do
          not decide.
        </p>
      ) : stage.clock === "no_deadline" ? (
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          No deadline is set, so nothing is approved automatically.
        </p>
      ) : null}

      {mode !== "managed" ? null : stage.isFundingPending ? (
        <p className="mt-3 text-sm leading-6 text-text-secondary" role="status">
          We are confirming your payment for this stage. Your bank or UPI app
          tells us the outcome and that can take a few minutes — do not pay again.
        </p>
      ) : stage.fundingState === "FUNDED" ? (
        <p className="mt-3 text-sm text-text-secondary">
          {isMaterial
            ? "Funded. The professional buys the materials with it."
            : "Funded. It reaches the professional once you approve the work."}
        </p>
      ) : stage.isNextToFund && stage.kind === "unknown" ? (
        // Fail closed. This app cannot name what the money is for, so it does
        // not collect it — the same rule the unknown commercial mode follows,
        // and for the same reason: the optimistic reading is the wrong one.
        <p className="mt-3 max-w-prose text-sm leading-6 text-text-secondary">
          {kindCopy.fundingPurpose}
        </p>
      ) : stage.isNextToFund ? (
        <div className="mt-3">
          <p className="max-w-prose text-sm leading-6 text-text-secondary">
            {kindCopy.fundingPurpose} It is {stage.amountLabel}, at its full
            price.
          </p>
          <div className="mt-2">
            <Button
              onClick={() => onFund(stage.stageId)}
              loading={isFunding}
              loadingLabel="Starting your payment"
            >
              {isMaterial
                ? `Pay for these materials — ${stage.amountLabel}`
                : `Fund this stage — ${stage.amountLabel}`}
            </Button>
          </div>
        </div>
      ) : stage.fundingState === "REQUIRED" ? (
        <p className="mt-3 text-sm text-text-secondary">
          {isMaterial
            ? "You will be asked for this when the work before it is done."
            : "You will be asked for this when the stage before it is done."}
        </p>
      ) : null}
    </li>
  );
}
