"use client";

import { Badge, Button, Card, ErrorState, Field, Select, Skeleton } from "@vsolve/ui";
import {
  CREW_RELEASE_REASONS,
  assignableCrew,
  assignedMembershipIds,
  bookedHeadcount,
  crewIsUnchanged,
  crewSelectionProblem,
  describeError,
  isCrewConflict,
  isCrewRosterRequired,
  isShiftDayClosed,
  type CrewReleaseReason,
} from "@vsolve/query";
import { HardHat, UserPlus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { usePartnerCrew } from "@/features/crew/queries";
import { shortDate } from "@/lib/format";

import { useAssignShiftCrew, type ShiftCommandScope, type ShiftDay } from "../queries";
import {
  INELIGIBILITY_WORDING,
  RELEASE_REASON_LABEL,
  describeSelectionProblem,
} from "../model/shift-copy";

/**
 * Who is going to this shift-day — `M2-FE-502`, and `M2-FE-503`'s substitution.
 *
 * ## One call, not two
 *
 * `POST /engagement-stages/{id}/crew/` takes the **whole intended crew** and
 * reconciles the day to it. So a replacement is a tick and an untick and one
 * send, rather than a remove followed by an add — which is a pair a client can
 * half perform, and half a substitution is a shift-day whose crew list is a lie
 * about who is standing on somebody's site.
 *
 * That is also why the picker starts pre-ticked with whoever is already on the
 * day. A supervisor who ticks one new person and sends would otherwise take
 * everybody else off, and the server would do exactly as it was told.
 *
 * ## The conflict check is the server's, and it is not previewed
 *
 * `m2_crew_conflict` covers the same **person** being promised on that date
 * through *any* agency — held as a database index precisely so two supervisors
 * tapping at the same instant cannot both win. Nothing here guesses at it: this
 * client cannot see another agency's bookings, and a picker that greyed somebody
 * out on a hunch would be telling a supervisor a worker is busy when they are
 * free, or free when they are busy. The refusal is rendered with the server's own
 * sentence, which names the person and the date.
 *
 * ## What the picker *can* see
 *
 * Verification. `assign_crew` refuses any membership Vsolve has not verified,
 * and the refusal arrives as `m2_crew_conflict` with the worker's name — which,
 * on a screen about double bookings, reads as a double booking. So unverified
 * people are shown, disabled, with the real reason beside them rather than
 * offered and refused.
 *
 * ## Rotation is legitimate
 *
 * Multi-day work rotates faces. A roster hung off the engagement would either
 * forbid that or record a lie about who was there, which is why the assignment
 * is per shift-day and why this panel appears on every day rather than once per
 * booking.
 */

export interface CrewPanelProps {
  readonly day: ShiftDay;
  readonly scope: ShiftCommandScope;
  /** False when the grant no longer carries `crew.assign`. */
  readonly canAssign: boolean;
}

export function CrewPanel({ day, scope, canAssign }: CrewPanelProps) {
  const roster = usePartnerCrew();
  const assign = useAssignShiftCrew(scope);

  const onTheDay = useMemo(() => assignedMembershipIds(day), [day]);
  const [selected, setSelected] = useState<readonly string[] | null>(null);
  const [reason, setReason] = useState<CrewReleaseReason>("substituted");

  // Null until the supervisor touches the form, so a refetch that changes the
  // day's crew is reflected rather than being overwritten by a stale local copy.
  const ticked = selected ?? onTheDay;

  const split = assignableCrew(roster.data?.members ?? []);
  const headcount = bookedHeadcount(day);
  const closed = isShiftDayClosed(day);
  const problem = crewSelectionProblem({
    selected: ticked,
    assignable: split.eligible.length,
    headcount,
  });
  const unchanged = crewIsUnchanged(day, ticked);
  const removing = onTheDay.filter((id) => !ticked.includes(id));

  return (
    <Card className="flex flex-col gap-4 p-4">
      <header className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-base font-semibold text-text">
          <HardHat size={18} aria-hidden />
          Who is going
        </h2>
        <p className="text-sm leading-6 text-text-secondary">
          {day.scheduled_on === null
            ? "This day has no date on it yet, so nobody can be put on it. It usually means the booking is still being scheduled."
            : `The crew for ${shortDate(day.scheduled_on)}. You can send different people on different days — Vsolve records who was there each day, not one list for the whole booking.`}
        </p>
        {headcount === null ? null : (
          <p className="text-xs text-text-muted">
            Booked for {headcount} {headcount === 1 ? "worker" : "workers"}.
          </p>
        )}
      </header>

      <CurrentCrew day={day} />

      {closed ? (
        <p className="text-sm leading-6 text-text-secondary">
          This day is settled, so its crew can no longer change.
        </p>
      ) : !canAssign ? (
        <p className="text-sm leading-6 text-text-secondary">
          Your account is not approved to name crew at the moment. The list above is what is on the
          record; contact support if it needs to change.
        </p>
      ) : (
        <RosterPicker
          isPending={roster.isPending}
          isError={roster.isError}
          error={roster.error}
          onRetry={() => void roster.refetch()}
          eligible={split.eligible}
          blocked={split.blocked}
          ticked={ticked}
          disabled={day.scheduled_on === null || assign.isPending}
          onToggle={(membershipId) =>
            setSelected(
              ticked.includes(membershipId)
                ? ticked.filter((id) => id !== membershipId)
                : [...ticked, membershipId],
            )
          }
        />
      )}

      {closed || !canAssign ? null : (
        <>
          {removing.length > 0 ? (
            <Field
              label="Why are they coming off this day?"
              description="Recorded against the person you are taking off, so there is a reason on the record rather than a name that silently disappeared."
            >
              <Select
                value={reason}
                onChange={(event) => setReason(event.target.value as CrewReleaseReason)}
              >
                {CREW_RELEASE_REASONS.map((code) => (
                  <option key={code} value={code}>
                    {RELEASE_REASON_LABEL[code]}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {problem === null ? null : (
            <p className="text-sm leading-6 text-danger-text">
              {describeSelectionProblem(problem, headcount)}
            </p>
          )}

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              onClick={() =>
                assign.mutate(
                  {
                    membershipIds: ticked,
                    ...(removing.length > 0 ? { reasonCode: reason } : {}),
                  },
                  { onSuccess: () => setSelected(null) },
                )
              }
              loading={assign.isPending}
              loadingLabel="Sending"
              disabled={
                problem !== null || unchanged || day.scheduled_on === null || assign.isPending
              }
              icon={<UserPlus size={16} aria-hidden />}
            >
              {onTheDay.length === 0 ? "Send this crew" : "Update this day's crew"}
            </Button>
            {unchanged && problem === null ? (
              <p className="text-xs leading-5 text-text-muted">
                This is already who is on the day. Tick or untick somebody to change it.
              </p>
            ) : null}
            <p className="text-xs leading-5 text-text-muted">
              The customer sees this list on their own screen. A like-for-like swap needs no
              approval from them. Sending{" "}
              <strong className="font-semibold">more people than were booked</strong> is a change
              request at the published rate — ask for it under &ldquo;Overtime and extras&rdquo;
              below.
            </p>
          </div>

          {assign.isError ? <AssignFailure error={assign.error} /> : null}
        </>
      )}
    </Card>
  );
}

/** Who the server currently says is on this day. Never the local tick state. */
function CurrentCrew({ day }: { readonly day: ShiftDay }) {
  if (day.crew.length === 0) {
    return (
      <p className="text-sm leading-6 text-text-secondary">
        Nobody is named for this day yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {day.crew.map((member) => (
        <li
          key={member.membership_id ?? member.display_name}
          className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line px-3 py-2"
        >
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold text-text">{member.display_name}</span>
            <span className="text-xs text-text-muted">{member.phone_masked}</span>
          </span>
          <span className="flex items-center gap-2">
            {member.is_supervisor ? <Badge tone="info">Supervisor</Badge> : null}
            {member.is_verified ? (
              <Badge tone="success">Verified</Badge>
            ) : (
              <Badge tone="warning">Not verified</Badge>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

interface RosterRow {
  readonly membership_id: string;
  readonly display_name: string;
  readonly phone_masked: string;
  readonly is_supervisor: boolean;
}

function RosterPicker({
  isPending,
  isError,
  error,
  onRetry,
  eligible,
  blocked,
  ticked,
  disabled,
  onToggle,
}: {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly error: unknown;
  readonly onRetry: () => void;
  readonly eligible: readonly RosterRow[];
  readonly blocked: readonly {
    readonly member: RosterRow;
    readonly why: keyof typeof INELIGIBILITY_WORDING;
  }[];
  readonly ticked: readonly string[];
  readonly disabled: boolean;
  readonly onToggle: (membershipId: string) => void;
}) {
  if (isPending) {
    return <Skeleton className="h-32 w-full" />;
  }

  if (isError) {
    const presentation = describeError(error, "read");
    return (
      <ErrorState
        title={presentation.title}
        message={presentation.message}
        severity={presentation.severity}
        actionLabel="Try again"
        onAction={onRetry}
        reference={presentation.reference}
      />
    );
  }

  if (eligible.length === 0 && blocked.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm leading-6 text-text-secondary">
          Your roster is empty. Vsolve needs the people on it before anybody can be put on a shift.
        </p>
        <Link
          href="/me/crew"
          className="inline-flex min-h-11 w-fit items-center text-sm font-semibold text-action focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
        >
          Add your crew
        </Link>
      </div>
    );
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
        Your roster
      </legend>

      {eligible.map((member) => (
        <label
          key={member.membership_id}
          className="flex min-h-11 items-center gap-3 rounded-control border border-line px-3 py-2"
        >
          <input
            type="checkbox"
            className="size-5"
            checked={ticked.includes(member.membership_id)}
            disabled={disabled}
            onChange={() => onToggle(member.membership_id)}
          />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold text-text">{member.display_name}</span>
            <span className="text-xs text-text-muted">
              {member.phone_masked}
              {member.is_supervisor ? " · Supervisor" : ""}
            </span>
          </span>
        </label>
      ))}

      {blocked.length === 0 ? null : (
        <div className="mt-1 flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Cannot go on a shift yet
          </p>
          {blocked.map(({ member, why }) => (
            <div
              key={member.membership_id}
              className="rounded-control border border-line bg-surface-sunken px-3 py-2"
            >
              <p className="text-sm font-semibold text-text-secondary">{member.display_name}</p>
              <p className="text-xs leading-5 text-text-muted">{INELIGIBILITY_WORDING[why]}</p>
            </div>
          ))}
        </div>
      )}
    </fieldset>
  );
}

/**
 * The three refusals, told apart.
 *
 * `m2_crew_roster_required` is the only one with a route out of it, so it gets
 * one: a generic banner strands a supervisor on a screen whose remedy is one tap
 * away on another. `m2_crew_conflict` renders the **server's** sentence, which
 * names the person and, for the cross-agency case, the date — three different
 * failures wear that one code and nothing here can tell them apart.
 */
function AssignFailure({ error }: { readonly error: unknown }) {
  const presentation = describeError(error, "mutation");

  if (isCrewRosterRequired(error)) {
    return (
      <div className="flex flex-col gap-2">
        <ErrorState
          title="Add somebody to your roster first"
          message="Vsolve asks for your crew the first time you put anybody on a shift, not when you sign up. Add them once and this stays out of your way."
          severity="warning"
          reference={presentation.reference}
        />
        <Link
          href="/me/crew"
          className="inline-flex min-h-11 w-fit items-center text-sm font-semibold text-action focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
        >
          Go to your crew
        </Link>
      </div>
    );
  }

  if (isCrewConflict(error)) {
    return (
      <ErrorState
        title="Somebody on that list cannot work this day"
        message={presentation.message}
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
