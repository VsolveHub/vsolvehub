"use client";

import {
  describeError,
  isStageDisputed,
  isStageTransitionNotAllowed,
  useServerCountdown,
  type EngagementCommercialMode,
  type StageDisputeReason,
} from "@vsolve/query";
import {
  Button,
  ConfirmAction,
  ErrorState,
  Field,
  Select,
  Skeleton,
  Textarea,
  buttonStyles,
} from "@vsolve/ui";
import Link from "next/link";
import { useState } from "react";

import { AccessRefusal } from "@/features/access/view/access-refusal";
import { toEngagementView, toStandaloneStageView, type StageView } from "../adapters";
import {
  DISPUTE_REASONS,
  approvalMoneyEffect,
  canSubmitCorrection,
  canSubmitDispute,
} from "../model/stage-review";
import {
  useApproveStage,
  useDisputeStage,
  useEngagement,
  useRequestCorrection,
  useStage,
} from "../queries";
import { StageEvidenceList } from "./stage-evidence";
import { StageStatusBadge, nounsFor, type ModeNouns } from "./engagement-status";
import { NotBuiltYet } from "./not-built-yet";

/**
 * The stage review — `M2-FE-609`. The most consequential screen in the wave.
 *
 * ## Approval releases money, so the screen says what each button does first
 *
 * The task is not "warn them"; it is that what each control does to money is
 * legible **before** it is pressed. Three controls, three different effects, and
 * every one of them is stated on the screen beside the button and again in the
 * confirmation:
 *
 * - **Approve.** On a managed (A5) agreement this writes the professional's
 *   earning *held* and starts the dispute window; the money becomes payable when
 *   that window closes. On `LEAD_ONLY` (A3) nothing was collected, so nothing
 *   platform-side moves and the Customer still owes the professional directly —
 *   which is a completely different sentence and is why the effect is a property
 *   of the agreement rather than of the stage.
 * - **Ask for a correction.** Moves no money at all. It asks for the **agreed**
 *   work to be done properly; it does not change what the agreed work is. A
 *   Customer who wants something different needs a change order the professional
 *   agrees to, and the screen says so rather than letting them use a correction
 *   as a cheap amendment.
 * - **Raise a problem.** Stops **only this stage's money**. Every other stage
 *   carries on and anything already paid out stays paid out — so this is never
 *   drawn as freezing the job.
 *
 * ## The clock, and the one action that stops it
 *
 * A stage in `AWAITING_REVIEW` is a clock running against the Customer:
 * `AWAITING_REVIEW → APPROVED` happens on review timeout, and a silent
 * auto-approval nobody was warned about is money moving without consent. The
 * deadline is therefore on the screen whenever there is one.
 *
 * The timeout is refused while the stage is `DISPUTED`, which makes **disputing
 * the action that stops the clock** — so that is written next to the dispute
 * control, not buried in help text.
 *
 * And `review_due_at` is nullable. A null is a policy state: no review window is
 * configured, so this stage will never auto-approve. It renders as "no deadline
 * is set", never as time in hand, and no default is synthesised.
 */

export interface StageReviewScreenProps {
  engagementId: string;
  stageId: string;
  engagementHref: string;
}

export function StageReviewScreen({
  engagementId,
  stageId,
  engagementHref,
}: StageReviewScreenProps) {
  const engagementQuery = useEngagement(engagementId);
  const stageQuery = useStage(engagementId, stageId);

  const engagement =
    engagementQuery.data === undefined ? null : toEngagementView(engagementQuery.data);
  const stage = stageQuery.data === undefined ? null : toStandaloneStageView(stageQuery.data);
  const nouns = nounsFor(engagement?.mode ?? "unknown");

  if (stageQuery.isPending) {
    return (
      <Wrapper engagementHref={engagementHref} nouns={nouns}>
        <div aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading the work to check</span>
          <Skeleton className="h-64 w-full" />
        </div>
      </Wrapper>
    );
  }

  if (stage === null) {
    const presentation = describeError(stageQuery.error, "read");
    return (
      <Wrapper engagementHref={engagementHref} nouns={nouns}>
        <ErrorState
          title={presentation.title}
          message={presentation.message}
          severity={presentation.severity}
          actionLabel="Try again"
          onAction={() => void stageQuery.refetch()}
          reference={presentation.reference}
        />
      </Wrapper>
    );
  }

  return (
    <Wrapper engagementHref={engagementHref} nouns={nouns}>
      <header>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="text-xl font-semibold text-text">{stage.label}</h1>
          <StageStatusBadge status={stage.status} />
        </div>
        {stage.scheduledOn !== null ? (
          <p className="mt-1 text-sm text-text-secondary">{stage.scheduledOn}</p>
        ) : null}
      </header>

      <ReviewClockPanel stage={stage} nouns={nouns} onRefresh={() => void stageQuery.refetch()} />

      <MoneyPanel stage={stage} mode={engagement?.mode ?? "unknown"} nouns={nouns} />

      {/* The engagement read is what says how this job is paid for, and every
          money sentence below depends on it. A stage that loaded while the
          agreement did not must not guess — the optimistic reading here is
          "protected", which is the one claim M2 may not make wrongly. */}
      {engagement === null ? (
        <div className="mt-4">
          <ErrorState
            title="We cannot tell you what approving does yet"
            message="We could not read the agreement this work belongs to, so we will not describe what happens to your money. Try again before you decide anything."
            severity="warning"
            actionLabel="Try again"
            onAction={() => void engagementQuery.refetch()}
            inline
          />
        </div>
      ) : null}

      <section aria-labelledby="evidence-heading" className="mt-6">
        <h2 id="evidence-heading" className="text-lg font-semibold text-text">
          What the professional showed
        </h2>
        <StageEvidenceList evidence={stage.evidence} stageNoun={nouns.stage} />
      </section>

      {stage.correctionNote !== null ? (
        <section className="mt-6 rounded-card border border-warning-line bg-warning-surface p-4">
          <h2 className="font-semibold text-text">What you asked for</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-text">
            {stage.correctionNote}
          </p>
        </section>
      ) : null}

      {stage.status === "DISPUTED" ? <DisputedPanel stage={stage} nouns={nouns} /> : null}

      <StageActions
        engagementId={engagementId}
        stage={stage}
        mode={engagement?.mode ?? "unknown"}
        commercialMode={engagement?.commercialMode ?? null}
        nouns={nouns}
        onDone={() => {
          void stageQuery.refetch();
          void engagementQuery.refetch();
        }}
      />

      {/* `M2-FE-510` — one-tap attendance. Out of scope in this wave; C4 owns the
          attendance model and nothing publishes it. Said out loud rather than
          left as a silent absence on the one screen an A3 Customer would look
          for it. */}
      {engagement?.mode === "lead_only" ? (
        <NotBuiltYet
          className="mt-6"
          title="Confirming who turned up today"
          body="The professional's supervisor records how many of the agreed workers were on site, and you confirm or dispute that in one tap. That is not built yet. If somebody did not turn up, raise a problem on this day and say so — it stops this day's money while we look."
          taskId="M2-FE-510"
        />
      ) : null}
    </Wrapper>
  );
}

function Wrapper({
  engagementHref,
  nouns,
  children,
}: {
  engagementHref: string;
  nouns: ModeNouns;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col px-4 pb-16 pt-6">
      {children}
      <div className="mt-8">
        <Link href={engagementHref} className={buttonStyles({ variant: "ghost" })}>
          Back to {nouns.engagement === "agreement" ? "the agreement" : `your ${nouns.engagement}`}
        </Link>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   The clock
   -------------------------------------------------------------------------- */

function ReviewClockPanel({
  stage,
  nouns,
  onRefresh,
}: {
  stage: StageView;
  nouns: ModeNouns;
  onRefresh: () => void;
}) {
  // Measured against the server's clock, never the device's. The countdown is
  // presentation and never authority: reaching zero locally does not approve
  // anything — the server decides, and the screen finds out by re-reading.
  const countdown = useServerCountdown(stage.autoApprovalDeadline, 30_000);

  if (stage.clock === "not_running") return null;

  if (stage.clock === "stopped") {
    return (
      <section className="mt-4 rounded-card border border-danger-line bg-danger-surface p-4">
        <h2 className="font-semibold text-text">The clock is stopped</h2>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text">
          You raised a problem on this {nouns.stage}, so it will{" "}
          <strong className="font-semibold">not</strong> be approved automatically
          and no money moves on it while we look into it.
        </p>
      </section>
    );
  }

  if (stage.clock === "no_deadline") {
    return (
      <section className="mt-4 rounded-card border border-line bg-surface-sunken p-4">
        <h2 className="font-semibold text-text">No deadline is set for this</h2>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          Nothing is approved automatically. This {nouns.stage} waits until you
          decide, however long that takes.
        </p>
      </section>
    );
  }

  // `auto_approves`. The deadline is real and silence is consent, so the screen
  // says exactly that — including what "nothing" means in money.
  const expiredLocally = countdown?.isExpired === true;

  return (
    <section className="mt-4 rounded-card border border-warning-line bg-warning-surface p-4">
      <h2 className="font-semibold text-text">
        {expiredLocally ? "This review window has closed" : "If you do nothing, this is approved"}
      </h2>
      {expiredLocally ? (
        <>
          <p className="mt-1 max-w-prose text-sm leading-6 text-text">
            By our clock the window has passed, so this {nouns.stage} may already
            have been approved automatically. We have not assumed either way.
          </p>
          <div className="mt-3">
            <Button variant="outline" onClick={onRefresh}>
              Check what happened
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-1 max-w-prose text-sm leading-6 text-text">
            This {nouns.stage} is approved automatically on{" "}
            <strong className="font-semibold">{stage.autoApprovalDeadlineLabel}</strong> if
            you do not decide before then — and approving is what moves the money.
            Raising a problem is the only thing that stops it.
          </p>
          {countdown !== null ? (
            <p className="mt-2 text-sm text-text-secondary" aria-live="polite">
              {countdown.announce}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

/* --------------------------------------------------------------------------
   Money
   -------------------------------------------------------------------------- */

function MoneyPanel({
  stage,
  mode,
  nouns,
}: {
  stage: StageView;
  mode: "lead_only" | "managed" | "unknown";
  nouns: ModeNouns;
}) {
  return (
    <section aria-labelledby="stage-money-heading" className="mt-6">
      <h2 id="stage-money-heading" className="text-lg font-semibold text-text">
        The money on this {nouns.stage}
      </h2>

      <dl className="mt-3 rounded-card border border-line bg-surface">
        <Row label="Agreed for this" value={stage.amountLabel} strong />
        {/* The four published numbers, and only on the archetype where they can
            be anything but zero. A row of ₹0s under a lead-only booking would
            imply Vsolve is holding money it has never touched. */}
        {mode === "managed" ? (
          <>
            <Row label="You have funded" value={stage.fundedLabel} />
            <Row label="Approved" value={stage.approvedLabel} />
            <Row label="Paid to the professional" value={stage.releasedLabel} />
            {stage.hasRefund ? <Row label="Refunded to you" value={stage.refundedLabel} /> : null}
          </>
        ) : null}
      </dl>

      {mode === "lead_only" ? (
        <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
          You pay the professional directly for this work. Vsolve is not holding
          this money, so approving here records that the {nouns.stage} was done —
          it does not send anybody a payment.
        </p>
      ) : null}

      {mode === "managed" && stage.payoutReleaseDeadlineLabel !== null ? (
        <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
          Once approved, the money is held until {stage.payoutReleaseDeadlineLabel}{" "}
          before it reaches the professional.
        </p>
      ) : null}
    </section>
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

function DisputedPanel({ stage, nouns }: { stage: StageView; nouns: ModeNouns }) {
  return (
    <section className="mt-6 rounded-card border border-danger-line bg-danger-surface p-4">
      <h2 className="font-semibold text-text">You raised a problem on this {nouns.stage}</h2>
      <p className="mt-1 max-w-prose text-sm leading-6 text-text">
        We are looking into it. This {nouns.stage}&apos;s money is on hold and
        nothing is approved automatically. The rest of the job carries on, and
        anything already paid out stays paid out.
      </p>
      {stage.disputedAt !== null ? (
        <p className="mt-2 text-sm text-text-secondary">Raised {stage.disputedAt}.</p>
      ) : null}
    </section>
  );
}

/* --------------------------------------------------------------------------
   The three actions
   -------------------------------------------------------------------------- */

const DISPUTE_REASON_LABEL: Record<StageDisputeReason, string> = {
  NOT_DONE: "The work was not done",
  PARTIALLY_DONE: "Only part of the work was done",
  POOR_QUALITY: "The work was done badly",
  WRONG_SCOPE: "This is not what we agreed",
  OTHER: "Something else",
};

function StageActions({
  engagementId,
  stage,
  mode,
  commercialMode,
  nouns,
  onDone,
}: {
  engagementId: string;
  stage: StageView;
  mode: "lead_only" | "managed" | "unknown";
  commercialMode: EngagementCommercialMode | null;
  nouns: ModeNouns;
  onDone: () => void;
}) {
  const approve = useApproveStage();
  const correction = useRequestCorrection();
  const dispute = useDisputeStage();

  const [confirmingApproval, setConfirmingApproval] = useState(false);
  const [correctionNote, setCorrectionNote] = useState("");
  const [disputeReason, setDisputeReason] = useState<StageDisputeReason | null>(null);
  const [disputeNote, setDisputeNote] = useState("");
  const [confirmingDispute, setConfirmingDispute] = useState(false);

  const anyPending = approve.isPending || correction.isPending || dispute.isPending;
  const commandError = approve.error ?? correction.error ?? dispute.error;

  if (!stage.canApprove && !stage.canRequestCorrection && !stage.canDispute) {
    return (
      <div className="mt-6">
        {/* Nothing is offered, and the screen says why rather than showing an
            empty space where three buttons used to be. */}
        <p className="rounded-card border border-line bg-surface-sunken p-4 text-sm leading-6 text-text-secondary">
          There is nothing to decide on this {nouns.stage} right now.
        </p>
      </div>
    );
  }

  /**
   * The one sentence this whole screen exists to get right.
   *
   * Derived from the **agreement's** commercial mode rather than from anything
   * about the stage, because the same command does two different things to money
   * depending on who is holding it — and an unknown mode says nothing at all
   * rather than picking the friendlier of the two.
   */
  const approvalConsequence = ((): string => {
    switch (approvalMoneyEffect(commercialMode)) {
      case "releases_held_earning":
        return `${stage.amountLabel} is approved and set aside for the professional. Once the hold period ends it is theirs, and you cannot take it back from this screen.`;
      case "no_platform_money":
        return `This records that the ${nouns.stage} was done. Vsolve is not holding your money for this job, so no payment is sent — you still owe the professional ${stage.amountLabel} directly.`;
      default:
        return "This app cannot describe how this agreement is paid for, so we will not tell you what this does to your money. Please contact support before approving.";
    }
  })();

  return (
    <section aria-labelledby="decide-heading" className="mt-8">
      <h2 id="decide-heading" className="text-lg font-semibold text-text">
        What do you want to do?
      </h2>

      {/* Approve */}
      {stage.canApprove ? (
        <div className="mt-3 rounded-card border border-line bg-surface p-4">
          <h3 className="font-semibold text-text">This is done properly</h3>
          <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
            {approvalConsequence}
          </p>
          <div className="mt-3">
            <Button onClick={() => setConfirmingApproval(true)} disabled={anyPending}>
              Approve this {nouns.stage}
            </Button>
          </div>
          <ConfirmAction
            open={confirmingApproval}
            onOpenChange={setConfirmingApproval}
            title={`Approve this ${nouns.stage}?`}
            consequence={approvalConsequence}
            confirmLabel="Yes, approve it"
            pending={approve.isPending}
            onConfirm={() => {
              approve.mutate(
                { engagementId, stageId: stage.stageId },
                {
                  onSuccess: () => {
                    setConfirmingApproval(false);
                    onDone();
                  },
                },
              );
            }}
          />
        </div>
      ) : null}

      {/* Correction — the one that moves no money */}
      {stage.canRequestCorrection ? (
        <div className="mt-3 rounded-card border border-line bg-surface p-4">
          <h3 className="font-semibold text-text">Something needs redoing</h3>
          <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
            Sends it back to be done properly.{" "}
            <strong className="font-semibold">No money moves</strong>, and nothing
            about what you agreed changes. When they submit again you get a fresh
            window to check it. If you want something{" "}
            <em>different</em> from what you agreed, that is a change to the job
            and the professional has to agree to it — ask them for one instead.
          </p>
          <Field
            label="What needs doing"
            description="They see exactly what you write here."
            required
            className="mt-3"
          >
            <Textarea
              value={correctionNote}
              onChange={(event) => setCorrectionNote(event.target.value)}
              placeholder="The second coat was missed on the back wall."
            />
          </Field>
          <div className="mt-3">
            <Button
              variant="outline"
              disabled={!canSubmitCorrection(correctionNote) || anyPending}
              loading={correction.isPending}
              loadingLabel="Sending"
              onClick={() =>
                correction.mutate(
                  { engagementId, stageId: stage.stageId, note: correctionNote.trim() },
                  {
                    onSuccess: () => {
                      setCorrectionNote("");
                      onDone();
                    },
                  },
                )
              }
            >
              Ask for it to be corrected
            </Button>
          </div>
          {!canSubmitCorrection(correctionNote) ? (
            <p className="mt-2 text-sm text-text-secondary">
              Say what needs doing first — a {nouns.stage} sent back with no
              instruction helps nobody.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Dispute — the one that stops the clock */}
      {stage.canDispute ? (
        <div className="mt-3 rounded-card border border-danger-line bg-surface p-4">
          <h3 className="font-semibold text-text">Something is wrong</h3>
          <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
            {mode === "managed"
              ? `Holds ${stage.amountLabel} on this ${nouns.stage} and asks us to look into it. `
              : `Records a problem on this ${nouns.stage} and asks us to look into it. `}
            It stops <strong className="font-semibold">only this {nouns.stage}</strong> —
            the rest of the job carries on and anything already paid out stays
            paid out. It is also the one thing that stops this being approved
            automatically.
          </p>
          <Field label="What went wrong" required className="mt-3">
            <Select
              placeholder="Choose one"
              value={disputeReason ?? ""}
              onChange={(event) =>
                setDisputeReason(
                  event.target.value === ""
                    ? null
                    : (event.target.value as StageDisputeReason),
                )
              }
            >
              {DISPUTE_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {DISPUTE_REASON_LABEL[reason]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Tell us what happened"
            description={
              disputeReason === "OTHER"
                ? "Required — we cannot act on 'something else' with nothing after it."
                : "Optional, but it is what we and the professional read first."
            }
            required={disputeReason === "OTHER"}
            className="mt-3"
          >
            <Textarea
              value={disputeNote}
              onChange={(event) => setDisputeNote(event.target.value)}
            />
          </Field>
          <div className="mt-3">
            <Button
              variant="danger"
              disabled={!canSubmitDispute(disputeReason, disputeNote) || anyPending}
              onClick={() => setConfirmingDispute(true)}
            >
              Raise a problem
            </Button>
          </div>
          <ConfirmAction
            open={confirmingDispute}
            onOpenChange={setConfirmingDispute}
            title="Raise a problem on this work?"
            destructive
            consequence={
              mode === "managed"
                ? `${stage.amountLabel} stays where it is and does not reach the professional while we look into this. The rest of the job carries on. This ${nouns.stage} will not be approved automatically.`
                : `We record the problem and look into it. Vsolve is not holding money for this job, so nothing is held back — but this ${nouns.stage} will not be approved automatically.`
            }
            confirmLabel="Yes, raise it"
            pending={dispute.isPending}
            onConfirm={() => {
              if (disputeReason === null) return;
              dispute.mutate(
                {
                  engagementId,
                  stageId: stage.stageId,
                  reasonCode: disputeReason,
                  note: disputeNote.trim(),
                },
                {
                  onSuccess: () => {
                    setConfirmingDispute(false);
                    setDisputeNote("");
                    setDisputeReason(null);
                    onDone();
                  },
                },
              );
            }}
          />
        </div>
      ) : null}

      {/* The two refusals this screen can meet on a well-formed request, each
          with a recovery that is a re-read rather than the same button again. */}
      {isStageDisputed(commandError) ? (
        <div className="mt-4">
          <ErrorState
            title="This work is already disputed"
            message="A problem was raised on it, so it cannot be approved. We have re-read it — what you see now is what is actually there."
            severity="warning"
            actionLabel="Refresh"
            onAction={onDone}
            inline
          />
        </div>
      ) : isStageTransitionNotAllowed(commandError) ? (
        <div className="mt-4">
          <ErrorState
            title="That is not possible right now"
            message={`This ${nouns.stage} has moved on since this screen loaded. We have re-read it.`}
            severity="warning"
            actionLabel="Refresh"
            onAction={onDone}
            inline
          />
        </div>
      ) : (
        <div className="mt-4">
          <AccessRefusal error={commandError} attempting="do that" />
        </div>
      )}
    </section>
  );
}
