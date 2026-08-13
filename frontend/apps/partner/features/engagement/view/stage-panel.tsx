"use client";

import { Badge, Button, Card, ErrorState, formatMoney } from "@vsolve/ui";
import {
  autoApprovalDeadline,
  correctionRequested,
  describeError,
  isStageTransitionNotAllowed,
  reviewClock,
  stageIsWaitingOnFunding,
  vendorStageCommands,
  workMayStart,
  type Engagement,
  type EngagementStage,
} from "@vsolve/query";
import { Play } from "lucide-react";

import { shortDate, timeAgo } from "@/lib/format";

import { useStartStage } from "../queries";
import {
  MATERIAL_ADVANCE_NOTE,
  describeStageStatus,
  isMaterialAdvance,
  stageTitle,
  type StageWording,
} from "../model/engagement-copy";
import { EvidenceComposer } from "./evidence-composer";

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
}

export function StagePanel({ engagement, stage, wording }: StagePanelProps) {
  const status = describeStageStatus(stage, wording);
  const commands = vendorStageCommands(engagement, stage);
  const correction = correctionRequested(stage);
  const material = isMaterialAdvance(stage);
  const start = useStartStage(engagement.id);

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-col gap-3 p-4">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="truncate text-base font-semibold text-text">
              {stageTitle(stage, wording)}
            </h2>
            <span className="flex flex-wrap items-center gap-2">
              {status ? (
                <Badge tone={TONE[status.tone]} dot>
                  {status.label}
                </Badge>
              ) : (
                <Badge tone="neutral">State not recognised</Badge>
              )}
              {/* `EngagementStage.kind`, published at 1.26.0. Without it a
                  material advance renders as an ordinary milestone and a vendor
                  reads the customer as approving cement as work. */}
              {material ? <Badge tone="neutral">Materials advance</Badge> : null}
            </span>
          </div>
          <span className="text-sm font-semibold tabular-nums text-text">
            {formatMoney(stage.amount_paise)}
          </span>
        </header>

        <p className="text-sm leading-6 text-text-secondary">
          {status?.sentence ??
            `Vsolve sent a state this version of the app cannot describe. Nothing here is wrong with your ${wording.parent} — updating the app usually resolves it.`}
        </p>

        {material ? (
          <p className="text-sm leading-6 text-text-secondary">{MATERIAL_ADVANCE_NOTE}</p>
        ) : null}

        {stage.scheduled_on === null ? null : (
          <p className="text-xs text-text-muted">Scheduled for {shortDate(stage.scheduled_on)}</p>
        )}

        {correction === null ? null : (
          <Card className="border-warning-line bg-warning-surface p-3">
            <h3 className="mb-1 text-sm font-semibold text-warning-text">
              What the customer asked for
            </h3>
            <p className="whitespace-pre-wrap text-sm leading-6 text-warning-text">
              {correction.trim() === ""
                ? "They sent it back without writing a reason."
                : correction}
            </p>
            <p className="mt-2 text-xs leading-5 text-warning-text">
              This is a correction, not a change to what you agreed. The price, the scope and this{" "}
              {wording.one}&rsquo;s own amount are unchanged, and no money has moved. If they want
              something different from what was agreed, that is a change request you propose and
              they accept.
            </p>
          </Card>
        )}

        <ReviewClockLine stage={stage} wording={wording} />

        <StartControl
          engagement={engagement}
          stage={stage}
          wording={wording}
          canStart={commands.includes("start")}
          isPending={start.isPending}
          error={start.isError ? start.error : null}
          onStart={() => start.mutate({ stageId: stage.id })}
        />
      </Card>

      {commands.includes("attach_evidence") || stage.evidence.length > 0 ? (
        <EvidenceComposer
          engagement={engagement}
          stage={stage}
          wording={wording}
          canAttach={commands.includes("attach_evidence")}
          canSubmit={commands.includes("submit")}
        />
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
  switch (reviewClock(stage)) {
    case "auto_approves": {
      const deadline = autoApprovalDeadline(stage);
      return deadline === null ? null : (
        <p className="text-xs leading-5 text-text-muted">
          If the customer does not answer by {shortDate(deadline)}, this {wording.one} is approved
          automatically.
        </p>
      );
    }
    case "no_deadline":
      return (
        <p className="text-xs leading-5 text-text-muted">
          There is no review deadline set on this {wording.one}, so it does not approve on a clock
          — it waits for the customer.
        </p>
      );
    case "stopped":
      return (
        <p className="text-xs leading-5 text-text-muted">
          The review clock is stopped while this is disputed. It cannot approve by itself.
        </p>
      );
    default:
      return stage.evidence_submitted_at === null ? null : (
        <p className="text-xs leading-5 text-text-muted">
          Last sent {timeAgo(stage.evidence_submitted_at)}.
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
  const startable = stage.status === "PENDING" || stage.status === "CORRECTION_REQUESTED";

  if (!startable) return null;

  if (stageIsWaitingOnFunding(engagement, stage)) {
    return (
      <p className="text-sm leading-6 text-text-secondary">
        {stage.funding_state === "PENDING"
          ? `The customer's payment for this ${wording.one} is with the bank. Do not travel or start until it clears — Vsolve will open it here.`
          : `The customer has not paid for this ${wording.one} yet. Do not start it. Vsolve collects one ${wording.one} at a time and opens it here once the money is in.`}
      </p>
    );
  }

  if (!workMayStart(engagement)) {
    return (
      <p className="text-sm leading-6 text-text-secondary">
        Work has not been cleared to start on this {wording.parent} yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        onClick={onStart}
        loading={isPending}
        loadingLabel="Starting"
        disabled={!canStart}
        icon={<Play size={16} aria-hidden />}
      >
        {stage.status === "CORRECTION_REQUESTED"
          ? "Back to work on this"
          : `Start this ${wording.one}`}
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
  const presentation = describeError(error, "mutation");

  if (isStageTransitionNotAllowed(error)) {
    return (
      <ErrorState
        title={`This ${wording.one} moved`}
        message="Somebody acted on it since this screen loaded, so it is no longer waiting to be started. Reload to see where it got to — pressing again would send the same command against the state that just refused it."
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
