"use client";

import { Badge, Card, ErrorState, Skeleton, SkeletonRegion, Timeline, TimelineEvent } from "@vsolve/ui";
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
 * ## The Wave III tails are named, not omitted and not faked
 *
 * Crew assignment, arrival, daily attendance, overtime, no-show reporting and
 * safety incidents (`M2-FE-502..508`) are C4; the delay claim and the digital
 * handover (`M2-FE-605`, `M2-FE-606`) are C5. Each renders a `NotBuiltYet` block
 * where its section would sit. A supervisor looking for today's headcount is told
 * it is not written yet rather than concluding they are on the wrong screen.
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
  /** `/workforce/shifts` or `/projects/stages`. */
  readonly basePath: string;
  /** Which archetype's Wave III tails to name. */
  readonly workspace: "workforce" | "project";
}

export function EngagementDetail({
  engagementId,
  wording,
  basePath,
  workspace,
}: EngagementDetailProps) {
  const query = usePartnerEngagement(engagementId);

  const back = (
    <Link
      href={basePath}
      className="inline-flex min-h-11 w-fit items-center gap-2 rounded-control text-sm font-semibold text-action focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
    >
      <ArrowLeft size={16} aria-hidden />
      All {wording.parentMany}
    </Link>
  );

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <SkeletonRegion loading label={`Loading this ${wording.parent}`}>
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
          title={gone ? `This ${wording.parent} is not yours` : presentation.title}
          message={
            gone
              ? `Vsolve has no ${wording.parent} with this reference on your account.`
              : presentation.message
          }
          severity={presentation.severity}
          actionLabel={gone ? undefined : "Try again"}
          onAction={gone ? undefined : () => void query.refetch()}
          reference={presentation.reference}
        />
      </div>
    );
  }

  const engagement = query.data;
  const status = describeEngagementStatus(engagement, wording);
  const stages = orderedStages(engagement);

  return (
    <div className="flex flex-col gap-4">
      {back}

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-text">
            {wording.parent.charAt(0).toUpperCase() + wording.parent.slice(1)}
          </h1>
          {status ? (
            <Badge tone={TONE[status.tone]} dot>
              {status.label}
            </Badge>
          ) : (
            <Badge tone="neutral">State not recognised</Badge>
          )}
        </div>
        <p className="text-sm leading-6 text-text-secondary">
          {status?.sentence ??
            "Vsolve sent a state this version of the app cannot describe. Nothing is wrong with your record; updating the app usually resolves it."}
        </p>
      </header>

      <section aria-labelledby="engagement-stages" className="flex flex-col gap-3">
        <h2
          id="engagement-stages"
          className="text-xs font-semibold uppercase tracking-wide text-text-muted"
        >
          The {wording.many}
        </h2>
        {stages.map((stage) => (
          <StagePanel
            key={stage.id}
            engagement={engagement}
            stage={stage}
            wording={wording}
          />
        ))}
      </section>

      {workspace === "workforce" ? <WorkforceTails /> : <ProjectTails />}

      <AgreementPanel engagement={engagement} wording={wording} />
      <AmendmentPanel engagement={engagement} wording={wording} />
      <PayoutPanel engagement={engagement} wording={wording} />
      <EngagementHistory engagement={engagement} wording={wording} />
    </div>
  );
}

/** `M2-FE-502..508` — every one of them needs Wave C4. */
function WorkforceTails() {
  return (
    <section aria-labelledby="workforce-tails" className="flex flex-col gap-2">
      <h2
        id="workforce-tails"
        className="text-xs font-semibold uppercase tracking-wide text-text-muted"
      >
        Crew and the day
      </h2>
      <NotBuiltYet
        what="Naming your crew for a shift-day"
        meanwhile="Vsolve does not publish crew assignment yet, so this screen cannot show or change who is on a day. The booking below is unaffected — send whoever you agreed to send, and tell the customer directly if that changes."
        reference="M2-FE-502, M2-FE-503 — waiting on the crew endpoints (Wave C4)."
      />
      <NotBuiltYet
        what="Confirming arrival and today's attendance"
        meanwhile="There is nowhere yet to record that your crew arrived or how many of them did. Attach what happened as evidence on the shift-day above instead — that is on the record and the customer reads it."
        reference="M2-FE-504, M2-FE-505 — waiting on the attendance endpoints (Wave C4)."
      />
      <NotBuiltYet
        what="Overtime, no-shows and safety incidents"
        meanwhile="Overtime is a change request and the form for it is below, but it has no overtime shape yet. A no-show, a partial crew or an unsafe site has no report form at all — call support, and record what happened as evidence on the shift-day so there is a contemporaneous account."
        reference="M2-FE-506, M2-FE-507, M2-FE-508 — waiting on Wave C4."
      />
    </section>
  );
}

/** `M2-FE-605` and `M2-FE-606` — both need Wave C5. */
function ProjectTails() {
  return (
    <section aria-labelledby="project-tails" className="flex flex-col gap-2">
      <h2
        id="project-tails"
        className="text-xs font-semibold uppercase tracking-wide text-text-muted"
      >
        Delays and handover
      </h2>
      <NotBuiltYet
        what="Claiming a delay the customer caused"
        meanwhile="There is no form yet for claiming time back when the site was not ready or access was refused. A change request below can ask for the schedule to move, but it will not be recorded as the customer's delay. Record what happened as evidence on the stage so there is a dated account of it."
        reference="M2-FE-605 — waiting on the delay-claim endpoint (Wave C5)."
      />
      <NotBuiltYet
        what="Handing over digital deliverables"
        meanwhile="Photographs, video and documents attached to a stage go to the customer with your submission, and they accept them by approving that stage. A separate handover with its own acceptance does not exist yet."
        reference="M2-FE-606 — waiting on the handover endpoint (Wave C5)."
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
  const query = usePartnerEngagementEvents(engagement.id);

  if (query.isPending || query.isError) return null;

  const events = eventsOldestFirst(query.data);
  if (events.length === 0) return null;

  return (
    <Card className="flex flex-col gap-3 p-4">
      <h2 className="text-base font-semibold text-text">What has happened</h2>
      <Timeline label={`History of this ${wording.parent}`}>
        {events.map((event) => (
          <TimelineEvent
            key={event.id}
            title={event.reason.trim() === "" ? event.to_status : event.reason}
            timestamp={timeAgo(event.occurred_at)}
            tone={event.to_status === "DISPUTED" ? "warning" : "neutral"}
          >
            {event.actor_is_system
              ? `Recorded automatically by Vsolve, not by a person.`
              : `Recorded when somebody acted on this ${wording.parent}.`}
          </TimelineEvent>
        ))}
      </Timeline>
    </Card>
  );
}
