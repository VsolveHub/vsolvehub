"use client";

import { Badge, Button, Disclosure, ErrorState, Skeleton, SkeletonRegion } from "@vsolve/ui";
import { describeError, isNotAShiftDay, isShiftDayClosed, shiftDayPhase } from "@vsolve/query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Pictogram } from "@/components/pictogram";
import { usePartnerEngagement } from "@/features/engagement/queries";
import { WORKFORCE_WORKSPACE } from "@/features/workspace/registry";
import { WorkspaceRoute } from "@/features/workspace/view/workspace-route";

import { useShiftDay, type CrewCopyDay, type ShiftCommandScope } from "../queries";
import { PHASE_LABEL, customerFirstName } from "../model/shift-copy";
import { CrewPanel } from "./crew-panel";
import { EveningClose, WHO_CAME_ID } from "./evening-close";
import { MorningPhase } from "./morning-phase";
import { ProblemSheet } from "./problem-sheet";
import { SettlementPhase } from "./settlement-phase";

/**
 * One shift-day, from the supervisor's side, in the order a day happens.
 *
 * Four phases, one on screen at a time: name the crew; the morning (where to
 * go, who is going, "We've reached"); the evening close (who came, extra hours,
 * today's amount, one send); and settlement (what the customer said, collect,
 * "Got paid"). A single "Problem" button opens the sheet for everything that
 * goes wrong.
 *
 * The shift-day is the primary read; the engagement is read beside it for the
 * address, the customer's name and phone, the booked headcount, the day count
 * and the requirement id the day-one no-show is keyed by. If that read fails
 * the day still renders with neutral wording.
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

/** "Mon 2 Sep" */
export function dayHeading(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" })
    .format(new Date(iso))
    .replace(",", "");
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
  const [problemOpen, setProblemOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [forceCrew, setForceCrew] = useState(false);

  const back = (
    <Link
      href={`/work/jobs/${engagementId}`}
      className="inline-flex min-h-11 w-fit items-center gap-2 rounded-control text-sm font-semibold text-action focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
    >
      <ArrowLeft size={16} aria-hidden />
      Job
    </Link>
  );

  if (day.isPending) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <SkeletonRegion loading label="Loading this day">
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
    const wrongKind = isNotAShiftDay(day.error);
    return (
      <div className="flex flex-col gap-4">
        {back}
        <ErrorState
          title={wrongKind ? "This is not a shift-day" : presentation.title}
          message={wrongKind ? "Open this stage from Projects instead." : presentation.message}
          severity={wrongKind ? "warning" : presentation.severity}
          actionLabel={wrongKind ? undefined : "Try again"}
          onAction={wrongKind ? undefined : () => void day.refetch()}
          reference={presentation.reference}
        />
      </div>
    );
  }

  const shift = day.data;
  const engagement = booking.data ?? null;
  const scope: ShiftCommandScope = { engagementId, stageId };
  const phase = shiftDayPhase(shift);
  const chip = PHASE_LABEL[phase];
  const allows = (action: (typeof SHIFT_DAY_ACTIONS)[number]) => actions.includes(action);
  const firstName = customerFirstName(engagement?.customer_contact?.name);

  const shiftStages = (engagement?.stages ?? []).filter((stage) => stage.shift_summary !== null);
  const totalDays = engagement?.crew_terms?.days ?? (shiftStages.length > 0 ? shiftStages.length : null);
  const remainingDays: CrewCopyDay[] = shiftStages
    .filter(
      (stage) =>
        stage.position > shift.position &&
        stage.status !== "APPROVED" &&
        stage.status !== "RELEASED" &&
        stage.scheduled_on !== null,
    )
    .map((stage) => ({
      stageId: stage.id,
      label: stage.label.trim() === "" ? `Day ${stage.position}` : stage.label,
    }));

  const crewPanel = (
    <CrewPanel
      day={shift}
      scope={scope}
      canAssign={allows("crew.assign")}
      bookedFor={engagement?.crew_terms?.headcount ?? null}
      remainingDays={remainingDays}
      onSaved={() => setForceCrew(false)}
    />
  );

  const showCrew = phase === "needs_crew" || forceCrew;
  const showEvening = !showCrew && (phase === "on_site" || closing);

  return (
    <div className="flex flex-col gap-5">
      {back}

      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-text">
            {shift.scheduled_on === null
              ? shift.day_label.trim() === "" ? `Day ${shift.position}` : shift.day_label
              : dayHeading(shift.scheduled_on)}
            {" · "}
            Day {shift.position}
            {totalDays === null ? "" : ` of ${totalDays}`}
          </h1>
          <Badge tone={TONE[chip.tone]} dot>
            {chip.label}
          </Badge>
        </div>
      </header>

      {showCrew ? (
        crewPanel
      ) : showEvening ? (
        <EveningClose
          day={shift}
          scope={scope}
          canConfirm={allows("attendance.confirm")}
          canPropose={allows("amendment.propose")}
          customerFirstName={firstName}
          onBusy={setClosing}
        />
      ) : phase === "crew_named" ? (
        <MorningPhase
          day={shift}
          scope={scope}
          canConfirm={allows("attendance.confirm")}
          engagement={engagement}
        />
      ) : (
        <SettlementPhase
          day={shift}
          scope={scope}
          canConfirm={allows("attendance.confirm")}
          canPropose={allows("amendment.propose")}
          customerFirstName={firstName}
          engagementId={engagementId}
        />
      )}

      {!showCrew && !isShiftDayClosed(shift) && allows("crew.assign") && phase !== "settled" ? (
        <Disclosure summary="Change crew" hint={`${shift.crew.length} named`}>
          <div className="py-2">{crewPanel}</div>
        </Disclosure>
      ) : null}

      <Button
        type="button"
        variant="outline"
        block
        onClick={() => setProblemOpen(true)}
        icon={<Pictogram name="held" size="sm" className="text-warning-text" />}
      >
        Problem
      </Button>

      <ProblemSheet
        engagementId={engagementId}
        requirementId={engagement?.requirement ?? ""}
        stageId={stageId}
        open={problemOpen}
        onOpenChange={setProblemOpen}
        onFewerPeople={
          phase === "on_site"
            ? () => {
                setForceCrew(false);
                requestAnimationFrame(() => document.getElementById(WHO_CAME_ID)?.scrollIntoView({ behavior: "smooth" }));
              }
            : undefined
        }
      />
    </div>
  );
}
