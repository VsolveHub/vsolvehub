"use client";

import { Badge, ErrorState, Skeleton, SkeletonRegion } from "@vsolve/ui";
import { describeError, isNotAShiftDay, shiftDayPhase } from "@vsolve/query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { usePartnerEngagement } from "@/features/engagement/queries";
import { WORKFORCE_WORKSPACE } from "@/features/workspace/registry";
import { WorkspaceRoute } from "@/features/workspace/view/workspace-route";
import { shortDate } from "@/lib/format";

import { useShiftDay, type ShiftCommandScope } from "../queries";
import { PHASE_WORDING } from "../model/shift-copy";
import { ArrivalPanel } from "./arrival-panel";
import { AttendancePanel } from "./attendance-panel";
import { CrewPanel } from "./crew-panel";
import { ExtrasComposer } from "./extras-composer";
import { SettlementPanel } from "./settlement-panel";
import { SiteReportPanel } from "./site-report-panel";

/**
 * One shift-day, from the supervisor's side — `M2-FE-502`..`M2-FE-508` and
 * `M2-FE-513`.
 *
 * ## Why this is its own route rather than a section of the booking
 *
 * The shift-day read is per stage, and a booking can be a week long. Mounting
 * every day's read on the booking screen would be seven requests to render six
 * days nobody is standing on. More importantly it would be the wrong screen: a
 * supervisor at six in the evening is dealing with *today* — who came, what it
 * comes to, whether it was settled — and the booking is the place they go to
 * read the agreement.
 *
 * So the booking lists its days and links to them, and this is the day.
 *
 * ## The order the panels are in
 *
 * The order a day actually happens: who is going, they arrived, this is how many
 * came, here is what it comes to, and — last, because they are the exceptions —
 * the extras and the things that went wrong. A supervisor scrolling this screen
 * at the end of a shift reaches the settlement figure without passing a form.
 *
 * ## Two reads, and the second one is allowed to fail
 *
 * The shift-day is the primary read and every panel above the fold depends on
 * it. The booking is read alongside it for two things only: the requirement id
 * the day-one no-show is keyed by, and the back link's wording. If it fails the
 * day still renders — a supervisor who cannot record today's headcount because
 * an unrelated read timed out is the failure this split exists to prevent.
 */

const TONE = {
  action: "action",
  info: "info",
  neutral: "neutral",
  warning: "warning",
  success: "success",
} as const;

/** Every action a control on this screen is drawn against. */
const SHIFT_DAY_ACTIONS = [
  "crew.assign",
  "attendance.confirm",
  "amendment.propose",
  "incident.report",
] as const;

export interface ShiftDayScreenProps {
  readonly engagementId: string;
  readonly stageId: string;
}

export function ShiftDayScreen({ engagementId, stageId }: ShiftDayScreenProps) {
  return (
    <WorkspaceRoute workspaceKey={WORKFORCE_WORKSPACE} actions={[...SHIFT_DAY_ACTIONS]}>
      {(workspace) => (
        <ShiftDayPanels
          engagementId={engagementId}
          stageId={stageId}
          actions={workspace.grant.actions}
        />
      )}
    </WorkspaceRoute>
  );
}

function ShiftDayPanels({
  engagementId,
  stageId,
  actions,
}: {
  readonly engagementId: string;
  readonly stageId: string;
  readonly actions: readonly string[];
}) {
  const day = useShiftDay(engagementId, stageId);
  const booking = usePartnerEngagement(engagementId);

  const bookingHref = `/workforce/shifts/${engagementId}`;
  const back = (
    <Link
      href={bookingHref}
      className="inline-flex min-h-11 w-fit items-center gap-2 rounded-control text-sm font-semibold text-action focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
    >
      <ArrowLeft size={16} aria-hidden />
      Back to the booking
    </Link>
  );

  if (day.isPending) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <SkeletonRegion loading label="Loading this shift-day">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </SkeletonRegion>
      </div>
    );
  }

  if (day.isError) {
    const presentation = describeError(day.error, "read");
    // A project milestone has no crew, no attendance and no daily settlement.
    // That is a wrong-screen answer, not a failure, and a retry cannot fix it.
    const wrongKind = isNotAShiftDay(day.error);
    return (
      <div className="flex flex-col gap-4">
        {back}
        <ErrorState
          title={wrongKind ? "This is not a shift-day" : presentation.title}
          message={
            wrongKind
              ? "This is a project stage, not a day of shift work. It has no crew list, no headcount and no evening settlement — open it from your Projects workspace instead."
              : presentation.message
          }
          severity={wrongKind ? "warning" : presentation.severity}
          actionLabel={wrongKind ? undefined : "Try again"}
          onAction={wrongKind ? undefined : () => void day.refetch()}
          reference={presentation.reference}
        />
      </div>
    );
  }

  const shift = day.data;
  const scope: ShiftCommandScope = { engagementId, stageId };
  const phase = PHASE_WORDING[shiftDayPhase(shift)];
  const allows = (action: (typeof SHIFT_DAY_ACTIONS)[number]) => actions.includes(action);

  return (
    <div className="flex flex-col gap-4">
      {back}

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-text">
            {shift.day_label.trim() === "" ? `Day ${shift.position}` : shift.day_label}
          </h1>
          <Badge tone={TONE[phase.tone]} dot>
            {phase.label}
          </Badge>
        </div>
        {shift.scheduled_on === null ? null : (
          <p className="text-sm text-text-secondary">{shortDate(shift.scheduled_on)}</p>
        )}
        <p className="text-sm leading-6 text-text-secondary">{phase.sentence}</p>
      </header>

      <CrewPanel day={shift} scope={scope} canAssign={allows("crew.assign")} />
      <ArrivalPanel day={shift} scope={scope} canConfirm={allows("attendance.confirm")} />
      <AttendancePanel day={shift} scope={scope} canConfirm={allows("attendance.confirm")} />
      <SettlementPanel day={shift} scope={scope} canConfirm={allows("attendance.confirm")} />
      <ExtrasComposer day={shift} scope={scope} canPropose={allows("amendment.propose")} />
      <SiteReportPanel
        day={shift}
        engagementId={engagementId}
        requirementId={booking.data?.requirement ?? ""}
        bookingHref={bookingHref}
        canReport={allows("incident.report")}
      />
    </div>
  );
}
