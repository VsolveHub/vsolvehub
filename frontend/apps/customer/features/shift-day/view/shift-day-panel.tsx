"use client";

import { describeError, isNotAShiftDay } from "@vsolve/query";
import { Badge, ErrorState, Skeleton } from "@vsolve/ui";

import { toShiftDayView, type ShiftCrewMemberView, type ShiftDayView } from "../adapters";
import { useShiftDay } from "../queries";
import { AttendanceDecision, AttendanceOutcome } from "./attendance-decision";
import { CashDemandReport } from "./cash-demand-report";
import { DaySettlementPanel } from "./day-settlement";

/**
 * One A3 shift-day, on the Customer's side — `M2-FE-510`, `514`, `515`.
 *
 * Mounted on the stage review, because on a workforce booking **the stage is the
 * day**: one shift-day per stage is the mapping `07-state-machines-and-permissions.md`
 * §5 sets, and giving the day its own route would give a Customer two addresses
 * for one evening.
 *
 * ## The order on screen is the order of the evening
 *
 * Who came → is that right? → what it comes to and did you pay them → and the
 * one thing that should never have happened. A Customer opening this at seven in
 * the evening reads it top to bottom and is finished.
 *
 * ## It renders nothing at all on a project milestone
 *
 * The read answers `409 m2_stage_transition_not_allowed` on an A5 stage — a
 * milestone has no crew, no attendance and no daily settlement. That is a panel
 * that should not have mounted rather than an error a Customer needs to see, so
 * the refusal renders as absence. The caller also passes `enabled`, from the
 * engagement's own `commercial_mode`, so in practice the request is never sent.
 * Both, because one is a correctness gate and the other is not sending a request
 * we know will be refused.
 */

export interface ShiftDayPanelProps {
  engagementId: string;
  stageId: string;
  /**
   * Whether this stage is a workforce shift-day at all.
   *
   * Read from the engagement's published `commercial_mode`, never derived from
   * the stage. `false` while the engagement is still loading, so nothing is sent
   * on a guess.
   */
  enabled: boolean;
  /** Where a genuine extra is priced and agreed. Named by `M2-FE-515`. */
  amendmentHref: string;
}

export function ShiftDayPanel({
  engagementId,
  stageId,
  enabled,
  amendmentHref,
}: ShiftDayPanelProps) {
  const dayQuery = useShiftDay(engagementId, stageId, enabled);

  if (!enabled) return null;

  if (dayQuery.isPending) {
    return (
      <div className="mt-8" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading today&apos;s crew and attendance</span>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (dayQuery.data === undefined) {
    // A milestone, not a shift-day. Render nothing rather than an error about a
    // panel this Customer never asked for.
    if (isNotAShiftDay(dayQuery.error)) return null;

    const presentation = describeError(dayQuery.error, "read");
    return (
      <div className="mt-8">
        <ErrorState
          title={presentation.title}
          message={presentation.message}
          severity={presentation.severity}
          actionLabel="Try again"
          onAction={() => void dayQuery.refetch()}
          reference={presentation.reference}
          inline
        />
      </div>
    );
  }

  const day = toShiftDayView(dayQuery.data);
  const refresh = () => void dayQuery.refetch();

  return (
    <div className="mt-8 border-t border-line pt-6">
      <ShiftCrewList day={day} />

      <AttendanceState day={day} />
      <AttendanceOutcome day={day} />
      <AttendanceDecision day={day} onDone={refresh} />

      <DaySettlementPanel day={day} onDone={refresh} />

      <CashDemandReport
        engagementId={engagementId}
        stageId={stageId}
        amendmentHref={amendmentHref}
        className="mt-8 border-t border-line pt-6"
      />
    </div>
  );
}

/* --------------------------------------------------------------------------
   Who is coming
   -------------------------------------------------------------------------- */

/**
 * The crew, at the disclosure a Customer is entitled to.
 *
 * A name, four masked digits and whether Vsolve has checked their documents.
 * There is no id of any kind on this projection and none is wanted: crew
 * identity is global — one person is one row however many agencies carry them —
 * so the global id goes to nobody and the roster id to the Partner alone.
 *
 * An empty crew is a real state, not a failure. Multi-day work rotates faces
 * legitimately, so a later day genuinely has nobody named on it until the
 * supervisor assigns them.
 */
function ShiftCrewList({ day }: { day: ShiftDayView }) {
  return (
    <section aria-labelledby="crew-heading">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="crew-heading" className="text-lg font-semibold text-text">
          Who is coming
        </h2>
        {day.expectedCount !== null ? (
          <Badge tone="neutral">
            {day.expectedCount} booked
          </Badge>
        ) : null}
      </div>

      {!day.hasCrew ? (
        <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
          Nobody is named on this day yet. The supervisor names the crew before
          they arrive, and it can be different people on different days — that is
          normal on a multi-day booking.
        </p>
      ) : (
        <ul className="mt-3 flex list-none flex-col gap-2 p-0">
          {day.crew.map((member) => (
            <CrewRow key={member.rowKey} member={member} />
          ))}
        </ul>
      )}
    </section>
  );
}

function CrewRow({ member }: { member: ShiftCrewMemberView }) {
  return (
    <li className="flex items-start justify-between gap-3 rounded-card border border-line p-3">
      <div className="min-w-0">
        <p className="font-medium text-text">{member.displayName}</p>
        {member.phoneMasked !== null ? (
          <p className="mt-0.5 text-sm text-text-secondary">{member.phoneMasked}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {member.isSupervisor ? <Badge tone="info">Supervisor</Badge> : null}
        {/* Verified is stated and unverified is left blank rather than badged
            "unverified": the field says whether we have checked this person's
            documents, and a red flag against somebody's name for a check we have
            not run is a claim about them we cannot stand behind. */}
        {member.isVerified ? <Badge tone="success">Documents checked</Badge> : null}
      </div>
    </li>
  );
}

/* --------------------------------------------------------------------------
   Where the day has got to
   -------------------------------------------------------------------------- */

/**
 * The states in which there is nothing for the Customer to decide.
 *
 * Said out loud rather than left as an empty space: a Customer looking for the
 * "confirm the day" button at six in the evening needs to know whether it is
 * missing because nothing has happened or because it is somebody else's move.
 */
function AttendanceState({ day }: { day: ShiftDayView }) {
  switch (day.attendance) {
    case "not_started":
      return (
        <p className="mt-4 max-w-prose text-sm leading-6 text-text-secondary">
          Nothing has been recorded for this day yet. Once the crew arrives, the
          supervisor records how many of them came and you confirm it here in one
          tap.
        </p>
      );

    case "awaiting_arrival":
      return (
        <p className="mt-4 max-w-prose text-sm leading-6 text-text-secondary">
          The crew is named for this day and nobody has confirmed they arrived
          yet. Either of you can record that on site — there is no code to read
          out and no app for the workers to install.
        </p>
      );

    case "awaiting_supervisor":
      return (
        <div className="mt-4 rounded-card border border-line bg-surface-sunken p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="font-semibold text-text">They are here</h3>
            <Badge tone="info">Working</Badge>
          </div>
          <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
            {day.arrivalConfirmedAt === null
              ? "Arrival is confirmed."
              : `Arrival was confirmed at ${day.arrivalConfirmedAt}.`}{" "}
            At the end of the day the supervisor records how many of the crew were
            here, and then it is your turn.
          </p>
        </div>
      );

    case "undescribable":
      return (
        <p className="mt-4 max-w-prose text-sm leading-6 text-text-secondary">
          This app cannot describe where today has got to, so it is not going to
          guess or offer you anything to press. Contact support before you settle
          up.
        </p>
      );

    default:
      // `awaiting_you` is `AttendanceDecision`'s; the two answered states are
      // `AttendanceOutcome`'s. Both render immediately below this.
      return <ShiftClockNotes day={day} />;
  }
}

/**
 * The two facts about the shift's clock a Customer might otherwise misread.
 *
 * **A missing check-out is not a problem** and must not be drawn as one: the day
 * settles at the agreed shift length, the amount never depended on the end time,
 * and only overtime does — which needs the Customer's own approval either way. A
 * supervisor whose crew left at six and who closed the day at nine has done
 * nothing wrong.
 */
function ShiftClockNotes({ day }: { day: ShiftDayView }) {
  if (!day.checkoutMissing && day.shiftEndedAt === null) return null;

  return (
    <div className="mt-4 rounded-card border border-line bg-surface-sunken p-4">
      {day.shiftEndedAt !== null ? (
        <p className="text-sm leading-6 text-text-secondary">
          The supervisor closed the day at {day.shiftEndedAt}.
        </p>
      ) : null}
      {day.checkoutMissing ? (
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          No finish time was recorded. That does not change what today costs — the
          day settles at the shift length you agreed, and only overtime you
          approve is ever charged on top.
        </p>
      ) : null}
    </div>
  );
}
