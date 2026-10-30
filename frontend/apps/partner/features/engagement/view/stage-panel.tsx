"use client";

import { Badge, Button, Card, Disclosure, ErrorState, formatMoney, useT } from "@vsolve/ui";
import {
  autoApprovalDeadline,
  correctionRequested,
  describeError,
  isStageTransitionNotAllowed,
  reviewClock,
  stageDeadline,
  stageIsWaitingOnFunding,
  vendorStageCommands,
  workMayStart,
  type Engagement,
  type EngagementStage,
} from "@vsolve/query";
import { ArrowRight, Play } from "lucide-react";
import Link from "next/link";

import { shortDate, timeAgo } from "@/lib/format";

import { useStartStage } from "../queries";
import {
  materialAdvanceNote,
  describeStageStatus,
  isMaterialAdvance,
  stageTitle,
  type StageWording,
} from "../model/engagement-copy";
import { EvidenceComposer } from "./evidence-composer";
import { ProjectCompletionControl } from "./project-completion-control";

/**
 * One shift-day or one milestone, with everything a vendor does to it.
 *
 * The shared spine, rendered once. A3 and A5 differ in the noun and in what the
 * commands refuse — never in which controls exist — so there is one component
 * here rather than two.
 *
 * ## Where a control is withheld, and where it is offered anyway
 *
 * Withheld where the client's knowledge is authoritative and the refusal is
 * certain: a managed stage the customer has not funded gets a waiting sentence
 * and **no** start button, because pressing it can only ever return
 * `m2_stage_not_funded` and the vendor cannot fix that — it is the customer's
 * payment.
 *
 * Offered where this screen's copy of the record could be a minute old, which is
 * the `M2-FE-315` precedent: the state is explained above the control and the
 * server's refusal routes to the same explanation.
 *
 * ## Materials are marked, not separated
 *
 * `EngagementStage.kind` (1.26.0) tells a material advance from a work
 * milestone. Both live on the one spine and take the same commands, so this
 * component still renders both — what changes is that a material row says what
 * it is. Hiding it, or giving it its own list, would be this client inventing a
 * second money surface the server does not have.
 *
 * ## The correction block
 *
 * A correction is **not** an amendment and this is the screen that has to say so.
 * The customer has asked for the agreed work to be done properly; the price, the
 * scope and this stage's own amount are all exactly what they were. A vendor who
 * reads a sent-back stage as a price cut has been misled by their own app.
 */

const TONE = {
  action: "action",
  info: "info",
  neutral: "neutral",
  warning: "warning",
  danger: "danger",
  success: "success",
} as const;

export interface StagePanelProps {
  readonly engagement: Engagement;
  readonly stage: EngagementStage;
  readonly wording: StageWording;
  /**
   * Where this stage's own screen lives, when it has one.
   *
   * `null` on A5: a milestone's whole surface — evidence, submission, the review
   * clock — is already on this card, and a link to a screen that repeated it
   * would be two places to do one thing. An A3 shift-day is different: it has a
   * crew list, a headcount, an arrival and an evening settlement that only exist
   * on the shift-day read, and none of them are on the engagement payload.
   */
  readonly dayHref?: string | null;
  /** Keeps a stage route action-first and places supporting detail behind taps. */
  readonly compact?: boolean;
  readonly workspace: "workforce" | "project";
}

export function StagePanel({
  engagement,
  stage,
  wording,
  dayHref = null,
  compact = false,
  workspace,
}: StagePanelProps) {
  const t = useT();
  const status = describeStageStatus(stage, wording, t);
  const commands = vendorStageCommands(engagement, stage);
  const correction = correctionRequested(stage);
  const material = isMaterialAdvance(stage);
  const start = useStartStage(engagement.id);
  const deadline = stageDeadline(stage, engagement.server_now);

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-col gap-3 p-4">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="truncate text-base font-semibold text-text">
              {stageTitle(stage, wording, t)}
            </h2>
            <span className="flex flex-wrap items-center gap-2">
              {status ? (
                <Badge tone={TONE[status.tone]} dot>
                  {status.label}
                </Badge>
              ) : (
                <Badge tone="neutral">{t("work.stagePanel.status.unknown")}</Badge>
              )}
              {/* `EngagementStage.kind`, published at 1.26.0. Without it a
                  material advance renders as an ordinary milestone and a vendor
                  reads the customer as approving cement as work. */}
              {material ? <Badge tone="neutral">{t("work.stagePanel.materialsAdvanceBadge")}</Badge> : null}
            </span>
          </div>
          <span className="text-sm font-semibold tabular-nums text-text">
            {formatMoney(stage.amount_paise)}
          </span>
        </header>

        <p className="text-sm leading-6 text-text-secondary">
          {status?.sentence ?? t("work.stagePanel.unknownStatus", { parent: wording.parent })}
        </p>

        {material && !compact ? (
          <p className="text-sm leading-6 text-text-secondary">{materialAdvanceNote(t)}</p>
        ) : null}

        {deadline === null ? null : (
          <div
            className={`rounded-card border p-3 ${
              deadline.state === "extra"
                ? "border-warning-line bg-warning-surface"
                : "border-line bg-canvas"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                {t("work.stagePanel.deadline.label")}
              </span>
              <Badge tone={deadline.state === "extra" ? "warning" : deadline.state === "complete" ? "success" : "info"}>
                {deadline.label}
              </Badge>
            </div>
            <p className="mt-2 text-sm font-semibold text-text">
              {deadline.startsOn
                ? t("work.stagePanel.deadline.startsOn", { date: shortDate(deadline.startsOn) })
                : ""}
              {t("work.stagePanel.deadline.dueOn", { date: shortDate(deadline.dueOn) })}
              {deadline.durationDays
                ? t("work.stagePanel.deadline.duration", { count: deadline.durationDays })
                : ""}
            </p>
            {deadline.state === "extra" ? (
              <p className="mt-1 text-xs leading-5 text-warning-text">
                {t("work.stagePanel.deadline.noExtraCharge")}
              </p>
            ) : null}
          </div>
        )}

        {correction === null ? null : (
          <Card className="border-warning-line bg-warning-surface p-3">
            <h3 className="mb-1 text-sm font-semibold text-warning-text">
              {t("work.stagePanel.correction.heading")}
            </h3>
            <p className="whitespace-pre-wrap text-sm leading-6 text-warning-text">
              {correction.trim() === "" ? t("work.stagePanel.correction.noReason") : correction}
            </p>
            {compact ? (
              <Disclosure summary={t("work.stagePanel.correction.disclosureSummary")}>
                {t("work.stagePanel.correction.disclosureBody")}
              </Disclosure>
            ) : (
              <p className="mt-2 text-xs leading-5 text-warning-text">
                {t("work.stagePanel.correction.fullBody", { one: wording.one })}
              </p>
            )}
          </Card>
        )}

        {compact ? (
          <Disclosure
            summary={t("work.stagePanel.disclosure.stageDetails")}
            hint={
              stage.evidence.length > 0
                ? t("work.stagePanel.disclosure.evidenceHint", { count: stage.evidence.length })
                : undefined
            }
          >
            <div className="flex flex-col gap-2">
              {material ? <p>{materialAdvanceNote(t)}</p> : null}
              <ReviewClockLine stage={stage} wording={wording} />
            </div>
          </Disclosure>
        ) : (
          <ReviewClockLine stage={stage} wording={wording} />
        )}

        <StartControl
          engagement={engagement}
          stage={stage}
          wording={wording}
          canStart={commands.includes("start")}
          isPending={start.isPending}
          error={start.isError ? start.error : null}
          onStart={() => start.mutate({ stageId: stage.id })}
        />

        {workspace === "project" ? <ProjectCompletionControl engagement={engagement} /> : null}

        {dayHref === null ? null : (
          <Link
            href={dayHref}
            className="inline-flex min-h-11 w-fit items-center gap-2 rounded-control text-sm font-semibold text-action focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
          >
            {t("work.stagePanel.dayLink")}
            <ArrowRight size={16} aria-hidden />
          </Link>
        )}
      </Card>

      {workspace === "workforce" && (commands.includes("attach_evidence") || stage.evidence.length > 0) ? (
        compact ? (
          <Card className="p-4">
            <Disclosure
              summary={
                commands.includes("submit")
                  ? t("work.stagePanel.evidenceDisclosure.summaryWithSubmit")
                  : t("work.stagePanel.evidenceDisclosure.summary")
              }
              hint={
                stage.evidence.length > 0
                  ? t("work.stagePanel.evidenceDisclosure.hintAdded", { count: stage.evidence.length })
                  : t("work.stagePanel.evidenceDisclosure.hintOpen")
              }
            >
              <EvidenceComposer
                engagement={engagement}
                stage={stage}
                wording={wording}
                canAttach={commands.includes("attach_evidence")}
                canSubmit={commands.includes("submit")}
              />
            </Disclosure>
          </Card>
        ) : (
          <EvidenceComposer
            engagement={engagement}
            stage={stage}
            wording={wording}
            canAttach={commands.includes("attach_evidence")}
            canSubmit={commands.includes("submit")}
          />
        )
      ) : null}
    </div>
  );
}

/**
 * The customer's review window, or the fact that there is not one.
 *
 * `reviewClock` has four answers and each is a different sentence. **A null
 * `review_due_at` is a policy state**: no review window is configured, so this
 * stage never auto-approves and waits for a person. Rendering a countdown to a
 * deadline nobody set would tell a vendor their money arrives on a date.
 */
function ReviewClockLine({
  stage,
  wording,
}: {
  readonly stage: EngagementStage;
  readonly wording: StageWording;
}) {
  const t = useT();
  switch (reviewClock(stage)) {
    case "auto_approves": {
      const deadline = autoApprovalDeadline(stage);
      return deadline === null ? null : (
        <p className="text-xs leading-5 text-text-muted">
          {t("work.stagePanel.reviewClock.autoApproves", {
            date: shortDate(deadline),
            one: wording.one,
          })}
        </p>
      );
    }
    case "no_deadline":
      return (
        <p className="text-xs leading-5 text-text-muted">
          {t("work.stagePanel.reviewClock.noDeadline", { one: wording.one })}
        </p>
      );
    case "stopped":
      return (
        <p className="text-xs leading-5 text-text-muted">
          {t("work.stagePanel.reviewClock.stopped")}
        </p>
      );
    default:
      return stage.evidence_submitted_at === null ? null : (
        <p className="text-xs leading-5 text-text-muted">
          {t("work.stagePanel.reviewClock.lastSent", { time: timeAgo(stage.evidence_submitted_at, t) })}
        </p>
      );
  }
}

/**
 * Start, or the reason there is no start button.
 *
 * Three withholding reasons, each with its own sentence, because they have
 * different fixes: the customer has not paid, Vsolve has not cleared the work to
 * begin, or this stage is simply not at a startable point.
 */
function StartControl({
  engagement,
  stage,
  wording,
  canStart,
  isPending,
  error,
  onStart,
}: {
  readonly engagement: Engagement;
  readonly stage: EngagementStage;
  readonly wording: StageWording;
  readonly canStart: boolean;
  readonly isPending: boolean;
  readonly error: unknown;
  readonly onStart: () => void;
}) {
  const t = useT();
  const startable = stage.status === "PENDING" || stage.status === "CORRECTION_REQUESTED";

  if (!startable) return null;

  if (stageIsWaitingOnFunding(engagement, stage)) {
    return (
      <p className="text-sm leading-6 text-text-secondary">
        {stage.funding_state === "PENDING"
          ? t("work.stagePanel.start.paymentWithBank", { one: wording.one })
          : t("work.stagePanel.start.notPaidYet", { one: wording.one })}
      </p>
    );
  }

  if (!workMayStart(engagement)) {
    return (
      <p className="text-sm leading-6 text-text-secondary">
        {t("work.stagePanel.start.notCleared", { parent: wording.parent })}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        onClick={onStart}
        loading={isPending}
        loadingLabel={t("work.stagePanel.start.loading")}
        disabled={!canStart}
        icon={<Play size={16} aria-hidden />}
      >
        {stage.status === "CORRECTION_REQUESTED"
          ? t("work.stagePanel.start.resume")
          : t("work.stagePanel.start.start", { one: wording.one })}
      </Button>
      {error ? <StartFailure error={error} wording={wording} /> : null}
    </div>
  );
}

function StartFailure({
  error,
  wording,
}: {
  readonly error: unknown;
  readonly wording: StageWording;
}) {
  const t = useT();
  const presentation = describeError(error, "mutation");

  if (isStageTransitionNotAllowed(error)) {
    return (
      <ErrorState
        title={t("work.stagePanel.start.movedTitle", { one: wording.one })}
        message={t("work.stagePanel.start.movedMessage")}
        severity="warning"
        reference={presentation.reference}
      />
    );
  }

  return (
    <ErrorState
      title={presentation.title}
      message={presentation.message}
      severity={presentation.severity}
      reference={presentation.reference}
    />
  );
}
