"use client";

import {
  Badge,
  Card,
  Disclosure,
  ErrorState,
  Skeleton,
  SkeletonRegion,
  Timeline,
  TimelineEvent,
  useT,
} from "@vsolve/ui";
import {
  describeError,
  eventsOldestFirst,
  isEngagementNotFound,
  orderedStages,
  type Engagement,
} from "@vsolve/query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { timeAgo } from "@/lib/format";
import { BookingSupport } from "@/features/support/view/booking-support";
import { CompletionRating } from "@/features/ratings/view/completion-rating";

import { usePartnerEngagement, usePartnerEngagementEvents } from "../queries";
import { describeEngagementStatus, type StageWording } from "../model/engagement-copy";
import { AgreementPanel } from "./agreement-panel";
import { AmendmentPanel } from "./amendment-panel";
import { NotBuiltYet } from "./not-built-yet";
import { PayoutPanel } from "./payout-panel";
import { StagePanel } from "./stage-panel";

/**
 * One engagement, everything the vendor does to it.
 *
 * Composes `M2-FE-602` (the agreement), the stage spine, `M2-FE-603` (evidence),
 * `M2-FE-604` (change requests) and `M2-FE-607` (money) into the order a vendor
 * reads them: what is happening now, then what I agreed to, then what I am owed.
 *
 * ## The order is deliberate
 *
 * The current stage is first because it is the only thing on this screen with an
 * action on it. The agreement is second because it is what the action is measured
 * against. The money is last because it is a consequence, not a decision.
 *
 * ## The A3 day is a link, not a section
 *
 * Crew assignment, arrival, daily attendance, overtime, on-site reporting and
 * safety incidents (`M2-FE-502..508`, `M2-FE-513`) landed with contract 1.30.0
 * and none of them are on this payload — they live on the per-stage shift-day
 * read. So each workforce stage links to its own day screen rather than growing
 * a section here that would need one extra request per day of the booking.
 *
 * ## The Wave III tails that remain are named, not omitted and not faked
 *
 * The delay claim and the digital handover (`M2-FE-605`, `M2-FE-606`) still
 * render a `NotBuiltYet` block where their section would sit. Their endpoints
 * landed with Wave C5 at contract 1.31.0 — so what is missing is the screen, not
 * the contract, and both blocks now say that. A vendor looking for them is told
 * they are not written yet rather than concluding they are on the wrong screen.
 */

const TONE = {
  action: "action",
  info: "info",
  neutral: "neutral",
  warning: "warning",
  danger: "danger",
  success: "success",
} as const;

export interface EngagementDetailProps {
  readonly engagementId: string;
  readonly wording: StageWording;
  /** Which archetype's Wave III tails to name. */
  readonly workspace: "workforce" | "project";
  /** When present, render one stage as a focused workspace rather than the whole job. */
  readonly focusStageId?: string;
}

export function EngagementDetail({
  engagementId,
  wording,
  workspace,
  focusStageId,
}: EngagementDetailProps) {
  const t = useT();
  const query = usePartnerEngagement(engagementId);

  // The merged WORK stack is where every engagement is listed now; the old
  // per-workspace lists are 308 redirects to it.
  const back = (
    <Link
      href="/work"
      className="inline-flex min-h-11 w-fit items-center gap-2 rounded-control text-sm font-semibold text-action focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
    >
      <ArrowLeft size={16} aria-hidden />
      {t("work.engagementDetail.allParentMany", { parentMany: wording.parentMany })}
    </Link>
  );

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <SkeletonRegion loading label={t("work.engagementDetail.loading", { parent: wording.parent })}>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </SkeletonRegion>
      </div>
    );
  }

  if (query.isError) {
    const presentation = describeError(query.error, "read");
    const gone = isEngagementNotFound(query.error);
    return (
      <div className="flex flex-col gap-4">
        {back}
        <ErrorState
          title={
            gone
              ? t("work.engagementDetail.notYours.title", { parent: wording.parent })
              : presentation.title
          }
          message={
            gone
              ? t("work.engagementDetail.notYours.message", { parent: wording.parent })
              : presentation.message
          }
          severity={presentation.severity}
          actionLabel={gone ? undefined : t("common.tryAgain")}
          onAction={gone ? undefined : () => void query.refetch()}
          reference={presentation.reference}
        />
      </div>
    );
  }

  const engagement = query.data;
  const status = describeEngagementStatus(engagement, wording, t);
  const stages = orderedStages(engagement);
  const focusedStage =
    focusStageId === undefined ? null : stages.find((stage) => stage.id === focusStageId) ?? null;

  if (focusStageId !== undefined && focusedStage === null) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <ErrorState
          title={t("work.engagementDetail.stageNotPart.title")}
          message={t("work.engagementDetail.stageNotPart.message")}
          severity="warning"
        />
      </div>
    );
  }

  const visibleStages = focusedStage === null ? stages : [focusedStage];

  return (
    <div className="flex flex-col gap-4">
      {back}

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-text">
            {focusedStage !== null
              ? t("work.engagementDetail.stageWorkspace")
              : engagement.service_name?.trim()
                ? engagement.service_name.trim()
                : wording.parent.charAt(0).toUpperCase() + wording.parent.slice(1)}
          </h1>
          {status ? (
            <Badge tone={TONE[status.tone]} dot>
              {status.label}
            </Badge>
          ) : (
            <Badge tone="neutral">{t("work.engagementDetail.statusUnknown")}</Badge>
          )}
        </div>
        {focusedStage === null ? (
          <p className="text-sm leading-6 text-text-secondary">
            {status?.sentence ?? t("work.engagementDetail.unknownStatusMessage")}
          </p>
        ) : (
          <p className="text-sm text-text-secondary">{t("work.engagementDetail.stageWorkspaceHint")}</p>
        )}
      </header>

      <section aria-labelledby="engagement-stages" className="flex flex-col gap-3">
        <h2
          id="engagement-stages"
          className="text-xs font-semibold uppercase tracking-wide text-text-muted"
        >
          {focusedStage === null
            ? t("work.engagementDetail.theMany", { many: wording.many })
            : t("work.engagementDetail.currentStage")}
        </h2>
        {visibleStages.map((stage) => (
          <StagePanel
            key={stage.id}
            engagement={engagement}
            stage={stage}
            wording={wording}
            // A3 only. The crew, the headcount, the arrival and the evening
            // settlement live on the shift-day read and on nothing the
            // engagement payload carries, so the day has its own screen and
            // this is the way in. An A5 milestone's whole surface is already on
            // the card above it.
            dayHref={
              workspace === "workforce" ? `/work/jobs/${engagement.id}/days/${stage.id}` : null
            }
            compact={focusedStage !== null}
            workspace={workspace}
          />
        ))}
      </section>

      {focusedStage === null ? (
        <>
          {workspace === "workforce" ? null : <ProjectTails />}
          <AgreementPanel engagement={engagement} wording={wording} />
          <AmendmentPanel engagement={engagement} wording={wording} />
          <PayoutPanel engagement={engagement} wording={wording} />
          <EngagementHistory engagement={engagement} wording={wording} />
        </>
      ) : (
        <Card className="flex flex-col gap-3 p-4">
          <Disclosure
            summary={t("work.engagementDetail.disclosure.agreementAndPayment")}
            hint={t("work.engagementDetail.disclosure.jobDetails")}
          >
            <div className="flex flex-col gap-3">
              <AgreementPanel engagement={engagement} wording={wording} />
              <PayoutPanel engagement={engagement} wording={wording} />
            </div>
          </Disclosure>
          <Disclosure
            summary={t("work.engagementDetail.disclosure.changeAgreedWork")}
            hint={t("common.optional")}
          >
            <AmendmentPanel engagement={engagement} wording={wording} />
          </Disclosure>
          <Disclosure
            summary={t("work.engagementDetail.disclosure.jobHistory")}
            hint={t("work.engagementDetail.disclosure.timeline")}
          >
            <EngagementHistory engagement={engagement} wording={wording} />
          </Disclosure>
        </Card>
      )}

      <BookingSupport reference={engagement.id} />
      <CompletionRating
        subject="engagement"
        id={engagement.id}
        isComplete={["COMPLETED", "WARRANTY", "CLOSED"].includes(engagement.status)}
      />
    </div>
  );
}

/**
 * `M2-FE-605` and `M2-FE-606` — the two tails this column has not built.
 *
 * Wave C5 published both endpoints at contract 1.31.0, so the references below
 * name the missing **screen** rather than a missing endpoint. The vendor-facing
 * copy is unchanged, because what a vendor can do today is unchanged: nothing in
 * this app posts a delay claim or a handover, and saying so is the whole job of
 * this section.
 */
function ProjectTails() {
  const t = useT();
  return (
    <section aria-labelledby="project-tails" className="flex flex-col gap-2">
      <h2
        id="project-tails"
        className="text-xs font-semibold uppercase tracking-wide text-text-muted"
      >
        {t("work.engagementDetail.projectTails.heading")}
      </h2>
      <NotBuiltYet
        what={t("work.engagementDetail.projectTails.delayClaim.what")}
        meanwhile={t("work.engagementDetail.projectTails.delayClaim.meanwhile")}
        reference={t("work.engagementDetail.projectTails.delayClaim.reference")}
      />
      <NotBuiltYet
        what={t("work.engagementDetail.projectTails.handover.what")}
        meanwhile={t("work.engagementDetail.projectTails.handover.meanwhile")}
        reference={t("work.engagementDetail.projectTails.handover.reference")}
      />
    </section>
  );
}

/**
 * The agreement's own history.
 *
 * `actor_is_system` separates a decision somebody made from one a clock made —
 * "approved by you" and "approved because the review window closed" are different
 * sentences, and a timeline that renders them identically is lying about who
 * decided. Actor identity itself is never published and is never guessed at here.
 */
function EngagementHistory({
  engagement,
  wording,
}: {
  readonly engagement: Engagement;
  readonly wording: StageWording;
}) {
  const t = useT();
  const query = usePartnerEngagementEvents(engagement.id);

  if (query.isPending || query.isError) return null;

  const events = eventsOldestFirst(query.data);
  if (events.length === 0) return null;

  return (
    <Card className="flex flex-col gap-3 p-4">
      <h2 className="text-base font-semibold text-text">{t("work.engagementDetail.history.heading")}</h2>
      <Timeline label={t("work.engagementDetail.history.timelineLabel", { parent: wording.parent })}>
        {events.map((event) => (
          <TimelineEvent
            key={event.id}
            title={event.reason.trim() === "" ? event.to_status : event.reason}
            timestamp={timeAgo(event.occurred_at, t)}
            tone={event.to_status === "DISPUTED" ? "warning" : "neutral"}
          >
            {event.actor_is_system
              ? t("work.engagementDetail.history.byVsolve")
              : t("work.engagementDetail.history.bySomebody", { parent: wording.parent })}
          </TimelineEvent>
        ))}
      </Timeline>
    </Card>
  );
}
