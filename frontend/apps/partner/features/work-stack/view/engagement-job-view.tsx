"use client";

import { isMaterialAdvance, orderedStages } from "@vsolve/query";
import { cn, formatMoney } from "@vsolve/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { Pictogram, type PictogramName } from "@/components/pictogram";
import { CompletionRating } from "@/features/ratings/view/completion-rating";
import {
  PROJECT_WORDING,
  WORKFORCE_WORDING,
  describeEngagementStatus,
  describeStageStatus,
  stageTitle,
  type StageWording,
  type StatusTone,
} from "@/features/engagement/model/engagement-copy";
import type { Engagement, EngagementStage } from "@/features/engagement/queries";
import { shortDate } from "@/lib/format";

/**
 * The M2 engagement job screen — the design canvas artboard
 * "7 · How far along" (`Progress.dc.html`).
 *
 * One agreement, its ordered stages, and how far each one has got. Reached from
 * `DoingCard` in the merged WORK stack (`work-item.ts`'s `ENGAGEMENT_HREF`) and
 * from the two old detail routes `next.config.ts` now redirects here —
 * `/workforce/shifts/:id` and `/projects/stages/:id`.
 *
 * ## Which vocabulary, and how it is decided
 *
 * `commercial_mode`, the server's own value, exactly as `engagement-screens.tsx`
 * mounted the two workspaces: `LEAD_ONLY` is the A3 workforce booking and
 * `MANAGED_PAYMENT_REQUIRED` is the A5 project. Those are the only two members
 * of `EngagementCommercialModeEnum` (`schema.d.ts:6644`). A stage is a
 * **shift-day** on one and a **stage** on the other, `M2-FE-111` forbids
 * flattening either into a generic "work item", and this screen keeps them apart
 * through `StageWording` rather than by hardcoding either noun. Every one of
 * those words is read out rather than drawn: the screen itself is pictures and
 * numbers.
 *
 * ## Every stage but a material advance is a link
 *
 * A3 stages go to `/work/jobs/[id]/days/[stageId]` (`ShiftDayScreen`, gated on
 * `WORKFORCE_WORKSPACE`). A5 stages go to `/work/jobs/[id]/stages/[stageId]`
 * (`ProjectEngagementScreen`, gated on `PROJECT_WORKSPACE`) — the whole
 * engagement's stage list, agreement, amendments and payouts, the same set of
 * panels `EngagementDetail` has always composed. A material advance is never a
 * link on either archetype — it is money for cement, not a day of work, and
 * there is no day screen behind it.
 *
 * ## The headline figure is `staged_total_paise`
 *
 * Not `commission_paise`, which is Vsolve's cut — documented server-side as zero
 * for `LEAD_ONLY`, so on the whole A3 direct-pay path it is not even a number,
 * let alone the vendor's. Not `total_paise` either: it never moves, so on an
 * engagement with an accepted amendment it is a figure nobody is owed.
 * `staged_total_paise` is "now owed", the same field `EngagementCard` and the
 * WORK stack card that linked here both read. It is the agreement's value rather
 * than a payout — whether the platform's cut sits inside it or on top of it is
 * `commission_treatment` — so it is announced that way.
 */
export function EngagementJobView({ engagement }: { readonly engagement: Engagement }) {
  const router = useRouter();

  const workforce = engagement.commercial_mode === "LEAD_ONLY";
  const wording: StageWording = workforce ? WORKFORCE_WORDING : PROJECT_WORDING;
  const status = describeEngagementStatus(engagement, wording);
  const stages = orderedStages(engagement);

  return (
    <>
    <main className="flex min-h-[calc(100dvh-9rem)] flex-col bg-canvas">
      {/* The screen is a number and a column of pictures; the landmark still
          needs a name. */}
      <h1 className="sr-only">
        Your {wording.parent}
        {status ? ` — ${status.label}` : ""}
      </h1>

      <div className="flex items-center gap-3.5 bg-[linear-gradient(160deg,var(--color-navy-700)_0%,var(--color-navy-900)_100%)] px-4 pt-4 pb-5">
        <button
          type="button"
          onClick={() => router.back()}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-surface/13 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-inverse"
        >
          <Pictogram name="back" size="md" className="text-surface" />
          <span className="sr-only">Back</span>
        </button>

        {/*
          "Agreed at", not "you receive". `staged_total_paise` is the agreement's
          value and whether the platform's cut sits inside it or on top of it is
          `commission_treatment` — an unenumerated field the model layer records
          rather than decides. The label has to be exactly this careful, which is
          why it is worth showing rather than hiding.
        */}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-navy-200">
            This {wording.parent} is agreed at
          </span>
          <span className="min-w-0 truncate text-[2.125rem] font-extrabold leading-none tracking-[-0.02em] text-surface">
            {formatMoney(engagement.staged_total_paise)}
          </span>
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 px-4 pt-4 pb-5">
        {stages.length === 0 ? (
          <EmptyStages wording={wording} />
        ) : (
          stages.map((stage) => (
            <StageRow
              key={stage.id}
              stage={stage}
              wording={wording}
              href={
                isMaterialAdvance(stage)
                  ? null
                  : workforce
                    ? `/work/jobs/${engagement.id}/days/${stage.id}`
                    : `/work/jobs/${engagement.id}/stages/${stage.id}`
              }
            />
          ))
        )}
      </div>
    </main>
    <div className="bg-canvas px-4 pb-5">
      <CompletionRating
        subject="engagement"
        id={engagement.id}
        isComplete={["COMPLETED", "WARRANTY", "CLOSED"].includes(engagement.status)}
      />
    </div>
    </>
  );
}

/* --------------------------------------------------------------------------
   One stage
   -------------------------------------------------------------------------- */

/**
 * A picture, a date and a number — the only way this app states a fact.
 *
 * The row's whole accessible name is assembled here rather than left to the
 * three bare values a screen reader would otherwise read out in a row: the
 * stage's own title (`stageTitle` degrades a blank label to "Shift-day 3" or
 * "Materials 2" in the right vocabulary), what state it is in, and what it is
 * worth.
 */
function StageRow({
  stage,
  wording,
  href,
}: {
  readonly stage: EngagementStage;
  readonly wording: StageWording;
  readonly href: string | null;
}) {
  const status = describeStageStatus(stage, wording);
  const scheduled = stage.scheduled_on;

  const label = [
    stageTitle(stage, wording),
    status?.label,
    scheduled ? shortDate(scheduled) : null,
    formatMoney(stage.amount_paise),
  ]
    .filter((part): part is string => part !== null && part !== undefined)
    .join(", ");

  const body = (
    <>
      <span
        className={cn(
          "grid h-13 w-13 shrink-0 place-items-center rounded-2xl border",
          status ? STAGE_TONE[status.tone] : STAGE_TONE.neutral,
        )}
      >
        <Pictogram
          name={isMaterialAdvance(stage) ? "price" : STAGE_PICTOGRAM[stage.status]} size="lg"
        />
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {/* The stage's own name, which used to be `sr-only` — so a sighted
            vendor read an amount and a date with nothing saying which stage
            they belonged to or where it had got to. `status.label` rides with
            it for the same reason. */}
        <span className="truncate text-[0.9375rem] font-semibold leading-snug text-text">
          {stageTitle(stage, wording)}
        </span>
        <span className="text-xl font-extrabold leading-none tracking-[-0.02em] tabular-nums text-text">
          {formatMoney(stage.amount_paise)}
        </span>
        <span className="flex min-w-0 items-center gap-3">
          {status ? (
            <span className="truncate text-xs font-bold uppercase tracking-[0.04em] text-text-muted">
              {status.label}
            </span>
          ) : null}
          {scheduled ? (
            <span className="flex items-center gap-1.5 text-sm font-bold text-action-secondary">
              <Pictogram name="date" size="sm" className="shrink-0" />
              <span className="truncate">{shortDate(scheduled)}</span>
            </span>
          ) : null}
        </span>
      </span>

      {href ? <Pictogram name="go" size="md" className="shrink-0 text-action-secondary" /> : null}
    </>
  );

  const shell =
    "flex min-h-18 items-center gap-3 rounded-card border border-line bg-surface p-3.5";

  // Nothing to open, so nothing to focus: a project stage is a statement of
  // where the work got to, not a door. The `sr-only` name inside `body` carries
  // it — an `aria-label` on a plain `div` is ignored by most screen readers.
  if (href === null) return <div className={shell}>{body}</div>;

  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        shell,
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
      )}
    >
      {body}
    </Link>
  );
}

/**
 * An agreement with no stages on it yet.
 *
 * Real: `PENDING_START` is a published engagement status and an A5 project is
 * staged when its estimate is accepted, so there is a genuine window in which
 * this payload carries an empty `stages[]`. A drawn medallion rather than an
 * invented row.
 */
function EmptyStages({ wording }: { readonly wording: StageWording }): ReactNode {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-16">
      <div className="grid h-42 w-42 place-items-center rounded-full bg-surface-sunken">
        <Pictogram name="papers" className="h-21 w-21 text-[var(--color-warm-400)]" />
      </div>
      <p className="mt-5 text-base font-semibold text-text-secondary">
        No {wording.many} on this {wording.parent} yet
      </p>
    </div>
  );
}

/**
 * One glyph per stage status, as a total record so that a status added to
 * `EngagementStageStatusEnum` (`schema.d.ts:6748`) is a typecheck failure rather
 * than a blank tile.
 *
 * `CORRECTION_REQUESTED` and `DISPUTED` are deliberately different glyphs. A
 * correction asks for the agreed work to be done properly and moves no money; a
 * dispute stops one allocation and nothing else — `describeStageStatus`'s own
 * docblock says a vendor who confuses the two has been told the wrong thing by
 * their own app, and drawing both as the same picture would be exactly that.
 */
const STAGE_PICTOGRAM: Record<EngagementStage["status"], PictogramName> = {
  PENDING: "time",
  IN_PROGRESS: "doing",
  AWAITING_REVIEW: "held",
  APPROVED: "done",
  CORRECTION_REQUESTED: "later",
  DISPUTED: "stopped",
  RELEASED: "money",
  CANCELLED: "no",
};

/** `describeStageStatus`'s six tones, in this redesign's closed token set. */
const STAGE_TONE: Record<StatusTone, string> = {
  action: "border-action-line bg-action-surface text-warning-text",
  info: "border-selected-line bg-selected-surface text-action-secondary",
  neutral: "border-line bg-surface-sunken text-text-muted",
  warning: "border-warning-line bg-warning-surface text-warning-text",
  danger: "border-danger-line bg-danger-surface text-danger-text",
  success: "border-success-line bg-success-surface text-success-text",
};
