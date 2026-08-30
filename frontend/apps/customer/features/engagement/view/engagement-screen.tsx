"use client";

import { describeError, isStageNotFundable, type StageKind } from "@vsolve/query";

import {
  REQUESTS_HREF,
  engagementListHref,
  requestHref,
  stageHref,
} from "@/lib/routes";
import { Badge, Button, Dialog, ErrorState, Readout, Skeleton, buttonStyles, cn } from "@vsolve/ui";
import Link from "next/link";
import { useState } from "react";

import { AccessRefusal } from "@/features/access/view/access-refusal";
import { BookingSupport } from "@/features/support/view/booking-support";
import { CompletionRating } from "@/features/ratings/view/completion-rating";
import { evidenceIndex, toProjectView } from "@/features/project/adapters";
import { useProject } from "@/features/project/queries";
import { ProjectDecisions, ProjectWarranty } from "@/features/project/view/project-panels";
import { toAmendmentsView, toEngagementView, type EngagementView, type StageView } from "../adapters";
import {
  isSimulatedCaptureUnavailable,
  useEngagement,
  useEngagementAmendments,
  useFundStage,
  useSimulateStageCapture,
} from "../queries";
import { LeadOnlyHub } from "./lead-only-hub";
import { Receipt } from "./receipt";
import { ProjectCompletionCodePanel } from "./project-completion-code";
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
 * ## The A5 project read, added at 1.31.0
 *
 * `M2-FE-611` and `M2-FE-612` land here as two slots rather than one block:
 * `ProjectDecisions` above the final acceptance, because a proposed replacement
 * and an unaccepted handover are both answers the Customer owes now, and
 * `ProjectWarranty` below it, because the hold-back is the story after the work
 * is done. The read is issued **once** here and handed to both — and to the
 * completion panel, whose third refusal (an unaccepted handover) lives on it.
 *
 * It is gated on `commercial_mode` being `managed`: `GET /engagements/{id}/project/`
 * refuses on an A3 engagement with `m2_stage_transition_not_allowed`, and
 * mounting it there would put a refusal behind every workforce booking.
 *
 * A failed project read never blanks this screen — the stages, the money and the
 * funding controls are all on the engagement's own read.
 */

export interface EngagementScreenProps {
  engagementId: string;
}

export function EngagementScreen({ engagementId }: EngagementScreenProps) {
  const engagementQuery = useEngagement(engagementId);
  const amendmentsQuery = useEngagementAmendments(engagementId);
  const fund = useFundStage();
  /**
   * Which stage the funding dialog is open on, held as an id rather than the
   * row itself so a refetch mid-dialog re-reads the amount instead of showing
   * the one that was on screen when it opened.
   */
  const [fundingStageId, setFundingStageId] = useState<string | null>(null);

  const view = engagementQuery.data === undefined ? null : toEngagementView(engagementQuery.data);
  const amendments = amendmentsQuery.data === undefined ? null : toAmendmentsView(amendmentsQuery.data);

  // A5 only. The read refuses on a workforce booking, and the verdict comes from
  // the engagement's own published `commercial_mode` rather than from anything
  // derived here — the same gate `useShiftDay` takes on the other archetype.
  // Called unconditionally, above every early return, because it is a hook.
  const isProject = view?.mode === "managed";
  const projectQuery = useProject(engagementId, isProject);
  const project =
    projectQuery.data === undefined || view === null
      ? null
      : // The evidence rows live on the engagement, not on the project read —
        // a deliverable carries only the id of the file it is. Joined here so
        // the handover panel can say what the record knows about a file the
        // Customer is being asked to accept and cannot open.
        toProjectView(projectQuery.data, evidenceIndex(view.stages));

  // Only known once the record has loaded. A failed read falls back to the
  // list, which is a real page, rather than to a requirement id we do not have.
  const requestLink = view === null ? REQUESTS_HREF : requestHref(view.requirementId);
  const nouns = nounsFor(view?.mode ?? "unknown");
  // Resolved from the live view every render, so a refetch while the dialog is
  // open corrects the amount rather than leaving a stale one under a Pay button.
  const fundingStage =
    view?.stages.find((stage) => stage.stageId === fundingStageId) ?? null;

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
    if (isProject) void projectQuery.refetch();
  };

  // The A3 booking hub — screens 5 through 10 and 12 of the post-booking
  // redesign. Its own return, not a branch further down: the hub replaces
  // every panel below rather than sitting among them, and reaching it through
  // the shared render would mean threading `isProject`/`nouns`/`fundingStage`
  // state that a workforce booking never uses.
  if (view.mode === "lead_only") {
    return (
      <Wrapper>
        <LeadOnlyHub view={view} onRefresh={refetchAll} />
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      {isProject ? (
        <ProjectHero
          view={view}
          nouns={nouns}
          onFund={(stageId) => setFundingStageId(stageId)}
          isFunding={fund.isPending}
        />
      ) : (
        <header>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-text-muted">{nouns.engagementTitle}</p>
              <h1 className="mt-0.5 text-xl font-semibold text-text">{view.serviceName ?? nouns.engagementTitle}</h1>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {view.isDisputed ? <Badge tone="danger">Problem raised</Badge> : null}
              <EngagementStatusBadge status={view.status} />
            </div>
          </div>
          {view.createdAt !== null ? (
            <p className="mt-1 text-sm text-text-secondary">Agreed on {view.createdAt}</p>
          ) : null}
        </header>
      )}

      <div id="engagement-detail" />

      {isProject ? null : <ModePanel view={view} />}

      {/* `M2-FE-608`: progress, active stage and next action, at the top, from
          the server's own numbers. */}
      {isProject ? null : <ProgressPanel view={view} nouns={nouns} />}

      {/* `M2-FE-509`: who is doing the work. A3 reads the supervisor and the
          frozen terms off the engagement itself (1.49.0); A5 reads the quote
          the engagement was frozen from. */}
      <AgreedWorkPanel
        engagement={view}
        nouns={nouns}
        quotesHref={`${requestLink}/quotes`}
      />

      {isProject ? (
        <ProjectMoneyFlow view={view} />
      ) : (
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
      )}

      <StageList
        view={view}
        nouns={nouns}
        // Opening a dialog rather than charging on the press. The old handler
        // fired the checkout straight from the row, which meant the one control
        // that moves money had no confirmation and no statement of the amount
        // next to it.
        onFund={(stageId) =>
          setFundingStageId(view.stages.some((stage) => stage.stageId === stageId) ? stageId : null)
        }
        isFunding={fund.isPending}
      />

      {fundingStage === null ? null : (
        <FundStageDialog
          engagementId={engagementId}
          stage={fundingStage}
          nouns={nouns}
          onClose={() => setFundingStageId(null)}
        />
      )}

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

      {/* `M2-FE-612` and the handover half of `M2-FE-611`, contract 1.31.0.
          Above the acceptance because both are decisions the Customer owes now:
          a proposed replacement carries a deadline and reprices every unfinished
          stage, and an unaccepted delivery is the thing stopping this closing. */}
      {isProject ? (
        <ProjectDecisions
          engagementId={engagementId}
          project={project}
          isPending={projectQuery.isPending}
          error={projectQuery.error}
          engagementNoun={nouns.engagement}
          stageNoun={nouns.stage}
          stagesNoun={nouns.stages}
          onDone={refetchAll}
          // Only where it is a live question. A permanent "what if they walk
          // away" block on a job that is going fine is noise, and noise here is
          // what stops the real notice being read.
          showRecoveryRoute={view.status === "CANCELLED" || view.isDisputed}
        />
      ) : null}

      {isProject ? (
        <ProjectCompletionCodePanel engagementId={view.engagementId} status={view.status} />
      ) : (
        <CompletionPanel engagement={view} project={project} nouns={nouns} onDone={refetchAll} />
      )}

      {/* The warranty half of `M2-FE-611`, below the acceptance because the
          hold-back is the story after the work is finished. Every number on it
          is the server's; nothing here computes a retention or a release date. */}
      {isProject ? (
        <ProjectWarranty
          project={project}
          isPending={projectQuery.isPending}
          engagementNoun={nouns.engagement}
        />
      ) : null}

      {isProject ? (
        <section aria-label="Agreement versions" className="mt-6">
          <details className="group overflow-hidden rounded-card border border-line bg-surface shadow-card">
            <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 transition-colors duration-fast hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring sm:px-5 [&::-webkit-details-marker]:hidden">
              <RecordIcon kind="agreement" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-extrabold text-text">Agreement versions</span>
                <span className="block text-xs font-medium text-text-secondary">
                  Original scope, accepted changes and totals
                </span>
              </span>
              <span data-numeric className="hidden text-sm font-extrabold text-text sm:block">
                {view.stagedTotalLabel}
              </span>
              <Chevron />
            </summary>
            <div className="border-t border-line bg-canvas px-4 pb-4 sm:px-5">
              {amendments === null ? (
                <p className="pt-4 text-sm leading-6 text-text-secondary">
                  We could not read the change history just now, so no unverified version is shown.
                </p>
              ) : (
                <AgreementHistory
                  engagement={view}
                  amendments={amendments}
                  originalTotalPaise={view.stagedTotalPaise - view.amendmentDeltaPaise}
                />
              )}
            </div>
          </details>
        </section>
      ) : (
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
      )}

      <EngagementTimeline engagementId={engagementId} />

      <BookingSupport reference={view.engagementId} />

      <div className={isProject ? "mt-6" : "mt-8"}>
        <CompletionRating
          subject="engagement"
          id={view.engagementId}
          isComplete={["COMPLETED", "WARRANTY", "CLOSED"].includes(view.status)}
        />
      </div>

      <section aria-labelledby="record-heading" className={isProject ? "mt-6" : "mt-8"}>
        {isProject ? (
          <details className="group overflow-hidden rounded-card border border-line bg-surface shadow-card">
            <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 transition-colors duration-fast hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring sm:px-5 [&::-webkit-details-marker]:hidden">
              <RecordIcon kind="folder" />
              <span className="min-w-0 flex-1">
                <span id="record-heading" className="block text-sm font-extrabold text-text">
                  Project records
                </span>
                <span className="block text-xs font-medium text-text-secondary">
                  Request, visits, quote and payment receipts
                </span>
              </span>
              <Chevron />
            </summary>
            <div className="border-t border-line bg-canvas px-4 pb-4 sm:px-5">
              <Receipt engagementId={view.engagementId} variant="inline" />
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Link href={requestLink} className={buttonStyles({ variant: "outline", className: "justify-between" })}>
                  Open request history
                  <ForwardChevron />
                </Link>
                <Link href={engagementListHref("managed")} className={buttonStyles({ variant: "ghost", className: "justify-between" })}>
                  All your {nouns.engagement}s
                  <ForwardChevron />
                </Link>
              </div>
            </div>
          </details>
        ) : (
          <>
            <h2 id="record-heading" className="text-lg font-semibold text-text">
              The record
            </h2>
            <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
              What you asked for, who was invited, what they quoted, when they visited
              and what you chose all stay on the request it came from, for both of
              you.
            </p>

            <Receipt engagementId={view.engagementId} variant="inline" />

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
          </>
        )}
      </section>
    </Wrapper>
  );
}

/**
 * Wide enough for the A3 confirmation's rail, with everything else held to a
 * reading width by its own containers. A stage list stretched to 1100px is
 * harder to scan, not easier.
 */
function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col px-4 pb-16 pt-6 sm:px-6">
      {children}
    </div>
  );
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

function ProjectHero({
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
  const active = view.stages.find((stage) => stage.stageId === view.activeStageId) ?? null;
  const nextFundable =
    view.stages.find((stage) => stage.stageId === view.nextFundableStageId) ?? null;
  const reviewStage =
    view.stages.find((stage) => stage.stageId === view.stagesAwaitingReviewIds[0]) ?? null;
  const focus = reviewStage ?? nextFundable ?? active;

  return (
    <section className="overflow-hidden rounded-card border border-navy-700 bg-surface shadow-card">
      <div className="bg-navy-900 px-5 py-5 text-white sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-navy-100">Your project</p>
            <h1 className="mt-1 text-3xl font-extrabold leading-tight sm:text-4xl">
              {view.serviceName ?? focus?.label ?? "Project journey"}
            </h1>
            {view.serviceName !== null && focus !== null ? (
              <p className="mt-1 text-sm font-semibold text-navy-100">{focus.label}</p>
            ) : null}
            {view.createdAt !== null ? (
              <p className="mt-2 text-sm font-medium text-navy-100">Agreed {view.createdAt}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {view.isDisputed ? <Badge tone="danger">Problem raised</Badge> : null}
            <EngagementStatusBadge status={view.status} />
          </div>
        </div>

        <ProjectStageMap view={view} />
      </div>

      <div className="grid gap-5 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-action-surface text-action-active ring-1 ring-action-line">
            <ActionGlyph action={view.nextAction} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-text-muted">What happens next</p>
            <p className="mt-1 text-lg font-extrabold leading-snug text-text">
              {nextActionCopy(view.nextAction, nouns, actionStageKind(view))}
            </p>
            {focus?.scheduledOn !== null && focus?.scheduledOn !== undefined ? (
              <p className="mt-1 text-sm font-medium text-text-secondary">{focus.scheduledOn}</p>
            ) : null}
          </div>
        </div>
        <ProjectHeroAction
          view={view}
          reviewStage={reviewStage}
          nextFundable={nextFundable}
          onFund={onFund}
          isFunding={isFunding}
        />
      </div>

      <details className="group border-t border-line">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 py-3 transition-colors duration-fast hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring sm:px-6 [&::-webkit-details-marker]:hidden">
          <span className="text-sm font-extrabold text-text">How stage payments protect you</span>
          <span className="ml-auto hidden text-xs font-semibold text-text-secondary sm:block">Pay one stage at a time</span>
          <Chevron />
        </summary>
        <div className="border-t border-line bg-canvas px-5 py-5 sm:px-6">
          <PaymentProtectionFlow />
          <p className="mt-4 max-w-2xl text-sm font-medium leading-6 text-text-secondary">
            You fund only the stage that is ready. Work money reaches the professional after
            you approve that stage. Site-visit fees remain separate from project work.
          </p>
        </div>
      </details>
    </section>
  );
}

function ProjectStageMap({ view }: { view: EngagementView }) {
  if (view.stages.length === 0) {
    return <p className="mt-6 text-sm font-medium text-navy-100">Stages will appear here once agreed.</p>;
  }

  return (
    <ol
      className="mt-7 grid list-none p-0"
      style={{ gridTemplateColumns: `repeat(${view.stages.length}, minmax(0, 1fr))` }}
      aria-label="Project stages"
    >
      {view.stages.map((stage) => {
        const body = (
          <>
            <span
              aria-hidden
              className={cn(
                "relative z-10 grid size-10 place-items-center rounded-full border-2 ring-4 ring-navy-900",
                stage.status === "PENDING" ? "border-navy-500 bg-navy-800 text-navy-200" : null,
                stage.status === "IN_PROGRESS" || stage.status === "CORRECTION_REQUESTED"
                  ? "border-action-line bg-action text-action-text"
                  : null,
                stage.status === "AWAITING_REVIEW"
                  ? "border-white bg-white text-navy-900"
                  : null,
                stage.status === "APPROVED" || stage.status === "RELEASED"
                  ? "border-success-line bg-success-surface text-success-text"
                  : null,
                stage.status === "DISPUTED" ? "border-danger-line bg-danger-surface text-danger-text" : null,
                stage.status === "CANCELLED" ? "border-navy-600 bg-navy-800 text-navy-300" : null,
              )}
            >
              <StageGlyph status={stage.status} />
            </span>
            <span className="mt-2 line-clamp-2 text-xs font-bold leading-4 text-white">
              {stage.label}
            </span>
          </>
        );

        return (
          <li key={stage.stageId} className="relative flex min-w-0 flex-col items-center px-1 text-center before:absolute before:left-0 before:right-0 before:top-5 before:h-0.5 before:bg-navy-600 first:before:left-1/2 last:before:right-1/2">
            {stage.status === "PENDING" ? (
              <div className="flex min-w-0 flex-col items-center">{body}</div>
            ) : (
              <Link href={stageHref(view.engagementId, stage.stageId)} className="group flex min-w-0 flex-col items-center rounded-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
                {body}
                <span className="sr-only">Open {stage.label}</span>
              </Link>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function StageGlyph({ status }: { status: StageView["status"] }) {
  if (status === "APPROVED" || status === "RELEASED") {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.7} strokeLinecap="round" strokeLinejoin="round" className="size-4"><path d="m5 12 4 4 10-10" /></svg>;
  }
  if (status === "DISPUTED" || status === "CANCELLED") {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4"><path d="m7 7 10 10m0-10L7 17" /></svg>;
  }
  if (status === "IN_PROGRESS") {
    return <span className="relative grid size-4 place-items-center"><span className="absolute size-4 animate-ping rounded-full bg-current opacity-20 motion-reduce:animate-none" /><span className="size-2 rounded-full bg-current" /></span>;
  }
  return <span className="size-2 rounded-full bg-current" />;
}

function ActionGlyph({ action }: { action: EngagementView["nextAction"] }) {
  if (action === "review_stage" || action === "accept_completion") {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5"><path d="m5 12 4 4 10-10" /></svg>;
  }
  if (action === "fund_stage") {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="size-5"><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18m-5 5h2" /></svg>;
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="size-5"><circle cx="12" cy="12" r="8" /><path d="M12 8v4m0 4h.01" /></svg>;
}

function ProjectHeroAction({
  view,
  reviewStage,
  nextFundable,
  onFund,
  isFunding,
}: {
  view: EngagementView;
  reviewStage: StageView | null;
  nextFundable: StageView | null;
  onFund: (stageId: string) => void;
  isFunding: boolean;
}) {
  if (view.nextAction === "review_stage" && reviewStage !== null) {
    return (
      <Link href={stageHref(view.engagementId, reviewStage.stageId)} className={buttonStyles({ size: "lg", className: "w-full lg:w-auto" })}>
        Check this stage
      </Link>
    );
  }
  if (view.nextAction === "fund_stage" && nextFundable !== null) {
    return (
      <Button size="lg" onClick={() => onFund(nextFundable.stageId)} loading={isFunding} loadingLabel="Opening payment" className="w-full lg:w-auto">
        Fund {nextFundable.amountLabel}
      </Button>
    );
  }
  if (view.nextAction === "accept_completion") {
    return (
      <Link href="#completion-code" className={buttonStyles({ size: "lg", className: "w-full lg:w-auto" })}>
        Show completion code
      </Link>
    );
  }
  return null;
}

function PaymentProtectionFlow() {
  const steps = [
    ["wallet", "Fund a stage"],
    ["work", "Professional works"],
    ["check", "You approve"],
    ["payout", "They are paid"],
  ] as const;

  return (
    <ol className="grid grid-cols-4" aria-label="How stage payments move">
      {steps.map(([icon, label]) => (
        <li key={label} className="relative flex min-w-0 flex-col items-center px-1 text-center before:absolute before:left-0 before:right-0 before:top-4 before:h-px before:bg-line first:before:left-1/2 last:before:right-1/2">
          <span aria-hidden className="relative z-10 grid size-8 place-items-center rounded-full bg-surface text-action-active ring-4 ring-canvas">
            <MoneyGlyph kind={icon} />
          </span>
          <span className="mt-2 text-xs font-bold leading-4 text-text-secondary">{label}</span>
        </li>
      ))}
    </ol>
  );
}

function ProjectMoneyFlow({ view }: { view: EngagementView }) {
  const steps = [
    ["Agreed", view.stagedTotalLabel, "wallet"],
    ["Funded", view.fundedTotalLabel, "lock"],
    ["Approved", view.approvedTotalLabel, "check"],
    ["Paid out", view.releasedTotalLabel, "payout"],
  ] as const;

  return (
    <section aria-labelledby="money-flow-heading" className="mt-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-text-muted">Project money</p>
          <h2 id="money-flow-heading" className="mt-1 text-xl font-extrabold text-text">Follow every rupee</h2>
        </div>
        {view.hasRefund ? <Badge tone="info">Refund recorded</Badge> : null}
      </div>
      <div className="mt-3 overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <ol className="grid grid-cols-4 bg-canvas px-2 py-5 sm:px-5" aria-label="Project money flow">
          {steps.map(([label, value, icon]) => (
            <li key={label} className="relative flex min-w-0 flex-col items-center px-1 text-center before:absolute before:left-0 before:right-0 before:top-5 before:h-0.5 before:bg-line first:before:left-1/2 last:before:right-1/2">
              <span aria-hidden className="relative z-10 grid size-10 place-items-center rounded-full bg-surface text-action-active ring-4 ring-canvas">
                <MoneyGlyph kind={icon} />
              </span>
              <span className="mt-2 text-xs font-bold text-text-secondary">{label}</span>
              <span data-numeric className="mt-0.5 max-w-full text-sm font-extrabold text-text sm:text-base">{value}</span>
            </li>
          ))}
        </ol>
        <details className="group border-t border-line">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 transition-colors duration-fast hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring [&::-webkit-details-marker]:hidden">
            <span className="text-sm font-extrabold text-text">Full money breakdown</span>
            <span className="ml-auto hidden text-xs font-semibold text-text-secondary sm:block">Tax, changes and refunds</span>
            <Chevron />
          </summary>
          <dl className="border-t border-line bg-canvas">
            <Row label="Originally agreed" value={view.totalLabel} />
            {view.amendmentDeltaPaise !== 0 ? (
              <Row label={view.amendmentDeltaPaise < 0 ? "Changes took off" : "Changes added"} value={view.amendmentDeltaLabel} />
            ) : null}
            <Row label="Tax" value={view.taxLabel} />
            {view.hasRefund ? <Row label="Refunded to you" value={view.refundedTotalLabel} /> : null}
            {view.commissionTreatment !== null ? <Row label="Commission" value={view.commissionTreatment} /> : null}
          </dl>
        </details>
      </div>
    </section>
  );
}

function MoneyGlyph({ kind }: { kind: "wallet" | "work" | "check" | "lock" | "payout" }) {
  const path = {
    wallet: "M5 6h12a2 2 0 0 1 2 2v10H5a2 2 0 0 1-2-2V6Zm0 0 10-3v3m1 6h3",
    work: "M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7m-9 0h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Zm-2 5h14",
    check: "m5 12 4 4 10-10",
    lock: "M7 10V8a5 5 0 0 1 10 0v2m-11 0h12v10H6V10Z",
    payout: "M4 12h16m-5-5 5 5-5 5",
  }[kind];
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="size-4"><path d={path} /></svg>;
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4 shrink-0 text-text-muted transition-transform duration-fast group-open:rotate-180">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function ForwardChevron() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4 shrink-0">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function RecordIcon({ kind }: { kind: "agreement" | "folder" }) {
  const path =
    kind === "agreement"
      ? "M7 3h7l4 4v14H7V3Zm7 0v5h5M10 13h5m-5 4h5"
      : "M3 7h7l2 2h9v10H3V7Zm0 0V5h6l2 2";

  return (
    <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-sunken text-action-active">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="size-4">
        <path d={path} />
      </svg>
    </span>
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
          {view.partnerContact !== null
            ? `${view.partnerContact.name}'s number is on the card below.`
            : view.contactReleasedAt !== null
              ? `You can contact each other from ${view.contactReleasedAt}.`
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
      <p className="text-xs font-bold uppercase text-text-muted">Project plan</p>
      <h2 id="stages-heading" className="mt-1 text-xl font-extrabold text-text">
        {nouns.stagesHeading}
      </h2>
      <ol className="mt-4 flex list-none flex-col gap-3 p-0">
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
    <li className="relative pl-11 before:absolute before:bottom-[-0.75rem] before:left-[1.15rem] before:top-9 before:w-px before:bg-line last:before:hidden">
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-3 grid size-9 place-items-center rounded-full border-2 bg-surface ring-4 ring-canvas",
          stage.status === "PENDING" ? "border-line text-text-muted" : null,
          stage.status === "IN_PROGRESS" || stage.status === "CORRECTION_REQUESTED" ? "border-action-line bg-action-surface text-action-active" : null,
          stage.status === "AWAITING_REVIEW" ? "border-warning-line bg-warning-surface text-warning-text" : null,
          stage.status === "APPROVED" || stage.status === "RELEASED" ? "border-success-line bg-success-surface text-success-text" : null,
          stage.status === "DISPUTED" ? "border-danger-line bg-danger-surface text-danger-text" : null,
          stage.status === "CANCELLED" ? "border-line bg-surface-sunken text-text-muted" : null,
        )}
      >
        <StageGlyph status={stage.status} />
      </span>
      <article className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-extrabold text-text">{stage.label}</p>
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
        <p data-numeric className="shrink-0 text-lg font-extrabold text-text">{stage.amountLabel}</p>
      </div>

      {/* The review is the money screen, so it gets a real link whenever there is
          something to decide — and whenever there is not, so the evidence and
          the decision that was taken stay readable. */}
      {stage.status !== "PENDING" ? (
        <div className="mt-4">
          <Link href={reviewHref} className={buttonStyles({ variant: stage.canApprove ? "primary" : "outline", className: "w-full sm:w-auto" })}>
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

      {/* A cancelled row (1.31.0) owes nobody any work, so every funding
          sentence below is false of it — including the quiet one, "you will be
          asked for this when the stage before it is done", which `_cancel_stage`
          guarantees will never happen because it leaves `funding_state` exactly
          as it found it. Said plainly instead, and deliberately without a claim
          about the money: a terminated work stage has its unearned funding
          returned and a cancelled material advance does not, and the totals
          above already report both truthfully. */}
      {stage.status === "CANCELLED" ? (
        <p className="mt-3 max-w-prose text-sm leading-6 text-text-secondary">
          {isMaterial
            ? "These materials are no longer part of this project. What was already spent on them is shown above."
            : `This ${nouns.stage} is no longer part of this project and nobody is working on it. Nothing more will be asked of you for it.`}
        </p>
      ) : mode !== "managed" ? null : stage.isFundingPending ? (
        <p className="mt-3 text-sm leading-6 text-text-secondary" role="status">
          We are confirming your payment for this stage. Your bank or UPI app
          tells us the outcome and that can take a few minutes — do not pay again.
        </p>
      ) : stage.fundingState === "FUNDED" ? (
        <StageMoneyDetails summary="Funded" detail={isMaterial ? "The professional buys the agreed materials with this money." : "This money is held until you approve the work."} />
      ) : stage.isNextToFund && stage.kind === "unknown" ? (
        // Fail closed. This app cannot name what the money is for, so it does
        // not collect it — the same rule the unknown commercial mode follows,
        // and for the same reason: the optimistic reading is the wrong one.
        <StageMoneyDetails summary="Why payment is unavailable" detail={kindCopy.fundingPurpose} />
      ) : stage.isNextToFund ? (
        <div className="mt-3">
          <div>
            <Button
              onClick={() => onFund(stage.stageId)}
              loading={isFunding}
              loadingLabel="Starting your payment"
              className="w-full sm:w-auto"
            >
              {isMaterial
                ? `Pay for these materials — ${stage.amountLabel}`
                : `Fund this stage — ${stage.amountLabel}`}
            </Button>
          </div>
          <StageMoneyDetails summary="What this payment covers" detail={kindCopy.fundingPurpose} />
        </div>
      ) : stage.fundingState === "REQUIRED" ? (
        <StageMoneyDetails summary="Payment comes later" detail={isMaterial ? "You will be asked for this after the earlier work is done." : "You will be asked for this after the previous stage is done."} />
      ) : null}
      </div>
      </article>
    </li>
  );
}

function StageMoneyDetails({ summary, detail }: { summary: string; detail: string }) {
  return (
    <details className="group mt-3 border-t border-line pt-1">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 py-2 text-sm font-bold text-text transition-colors duration-fast hover:text-text-link focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring [&::-webkit-details-marker]:hidden">
        <span>{summary}</span>
        <Chevron />
      </summary>
      <p className="pb-2 text-sm font-medium leading-6 text-text-secondary">{detail}</p>
    </details>
  );
}

/**
 * Funding one stage: the amount, the consequence, and one press.
 *
 * ## What was here before
 *
 * The row's Pay button called the checkout command directly. That created a
 * `PaymentAttempt` and handed back a `payment_attempt_id` which nothing used —
 * no provider is configured in this environment — so the stage sat at
 * `PROVIDER_PENDING` indefinitely, the engagement's totals never moved, and the
 * vendor was never told they could start. The control worked; the outcome did
 * not exist. And it charged on a single press with the amount nowhere near the
 * button.
 *
 * ## The two steps, and why the Customer sees one
 *
 * Funding is genuinely two server calls — create the checkout, then capture it —
 * and there is no honest way to collapse them, because the second is what a
 * payment provider would do. So the dialog runs both behind one confirmation:
 * the checkout is created, and if it came back on the **fake** provider the
 * capture is simulated immediately.
 *
 * `provider` is the server's own field on the checkout, not a guess. On any
 * real provider this stops after the checkout and says so plainly, rather than
 * pretending money moved — and `simulate-capture` answers `404` wherever it is
 * switched off, which is production, so the panel cannot be talked into working
 * there either.
 *
 * ## Why the confirmation is not optional
 *
 * Capture is irreversible from the Customer's side: undoing it means a refund,
 * not a delete. A dialog stating the amount is the difference between a
 * deliberate payment and a mis-tap on a list of stages.
 */
function FundStageDialog({
  engagementId,
  stage,
  nouns,
  onClose,
}: {
  engagementId: string;
  stage: StageView;
  nouns: ModeNouns;
  onClose: () => void;
}) {
  const fund = useFundStage();
  const capture = useSimulateStageCapture();
  const [settled, setSettled] = useState<"paid" | "awaiting-provider" | null>(null);

  const isWorking = fund.isPending || capture.isPending;
  const failure = fund.error ?? (isSimulatedCaptureUnavailable(capture.error) ? null : capture.error);

  async function pay() {
    // `useFundStage` keys its idempotency on the stage, so a second press
    // returns the same attempt rather than a second charge.
    const checkout = await fund.mutateAsync({ engagementId, stageId: stage.stageId });

    const attemptId = checkout?.payment_attempt_id ?? null;
    if (attemptId === null || checkout?.provider !== "fake") {
      // A real provider is configured and this app has no sheet to hand the
      // charge to. Saying so beats a success state nothing backs up.
      setSettled("awaiting-provider");
      return;
    }

    try {
      await capture.mutateAsync({ engagementId, paymentAttemptId: attemptId });
      setSettled("paid");
    } catch (error) {
      // Capture switched off is what production looks like, and the checkout
      // above genuinely was created — so it settles as awaiting rather than as
      // a failure that lost the Customer's press.
      if (isSimulatedCaptureUnavailable(error)) setSettled("awaiting-provider");
      else throw error;
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !isWorking) onClose();
      }}
      title={settled === "paid" ? `${nouns.stage} funded` : `Fund this ${nouns.stage}?`}
      description={
        settled === "paid"
          ? undefined
          : `${stage.label} — the professional is told to start once this clears.`
      }
      footer={
        settled !== null ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={isWorking}>
              Cancel
            </Button>
            <Button
              loading={isWorking}
              loadingLabel="Taking payment"
              onClick={() => void pay()}
            >
              Pay {stage.amountLabel}
            </Button>
          </>
        )
      }
    >
      {settled === "paid" ? (
        <p className="text-sm leading-6 text-text-secondary">
          {stage.amountLabel} is funded and held against this {nouns.stage}. It
          reaches the professional only after you accept the work — you are not
          paying them yet.
        </p>
      ) : settled === "awaiting-provider" ? (
        <p className="text-sm leading-6 text-text-secondary" role="status">
          The charge has been created and is with the payment provider. Your bank
          or UPI app tells us the outcome and that can take a few minutes — do
          not pay again.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <Readout label="Amount" value={stage.amountLabel} tone="active" />
          <p className="text-sm leading-6 text-text-secondary">
            This money is held against this {nouns.stage}. It reaches the
            professional only after you have seen the work and accepted it, and
            it comes back to you if this {nouns.stage} is never delivered.
          </p>
          {failure !== null && failure !== undefined ? (
            <p role="alert" className="text-sm text-danger-text">
              {describeError(failure, "mutation").message}
            </p>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}
