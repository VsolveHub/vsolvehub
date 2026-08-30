"use client";

import { Button, ChoiceChips, ErrorState, Skeleton, cn } from "@vsolve/ui";
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
import Link from "next/link";
import { useMemo, useState } from "react";

import { Pictogram } from "@/components/pictogram";
import { usePartnerCrew } from "@/features/crew/queries";

import {
  isCrewCopyFailure,
  useAssignCrewToDays,
  useAssignShiftCrew,
  type CrewCopyDay,
  type ShiftCommandScope,
  type ShiftDay,
} from "../queries";
import {
  INELIGIBILITY_WORDING,
  RELEASE_REASON_LABEL,
  describeSelectionProblem,
} from "../model/shift-copy";

/**
 * Name the crew — one tap per person, one send for the whole day.
 *
 * `POST /engagement-stages/{id}/crew/` takes the **whole intended crew** and
 * reconciles the day to it, so the list starts pre-ticked with whoever is on
 * the day and a substitution is a tick, an untick and one send. The picker
 * greys out who the server would refuse (archived, unverified) with the reason
 * on one line; the cross-agency conflict is the server's and is not guessed at.
 *
 * "Copy to all N days" is the same command once per remaining day, in order,
 * stopping at the first refusal and naming the day that refused.
 */

export interface CrewPanelProps {
  readonly day: ShiftDay;
  readonly scope: ShiftCommandScope;
  /** False when the grant no longer carries `crew.assign`. */
  readonly canAssign: boolean;
  /** `crew_terms.headcount`, for the counter before the day publishes its own. */
  readonly bookedFor: number | null;
  /** The days after this one that can still take a crew. */
  readonly remainingDays: readonly CrewCopyDay[];
  /** Called after a successful save, so the screen can move on. */
  readonly onSaved?: () => void;
}

const ROW =
  "flex min-h-14 w-full items-center gap-3 rounded-control border px-3 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring";

export function CrewPanel({ day, scope, canAssign, bookedFor, remainingDays, onSaved }: CrewPanelProps) {
  const roster = usePartnerCrew();
  const assign = useAssignShiftCrew(scope);
  const copy = useAssignCrewToDays(scope.engagementId);

  const onTheDay = useMemo(() => assignedMembershipIds(day), [day]);
  const [selected, setSelected] = useState<readonly string[] | null>(null);
  const [reason, setReason] = useState<CrewReleaseReason>("substituted");

  // Null until touched, so a refetch that changes the day's crew is reflected.
  const ticked = selected ?? onTheDay;

  const split = assignableCrew(roster.data?.members ?? []);
  const headcount = bookedHeadcount(day) ?? bookedFor;
  const closed = isShiftDayClosed(day);
  const problem = crewSelectionProblem({
    selected: ticked,
    assignable: split.eligible.length,
    headcount,
  });
  const unchanged = crewIsUnchanged(day, ticked);
  const removing = onTheDay.filter((id) => !ticked.includes(id));
  const busy = assign.isPending || copy.isPending;
  const locked = closed || !canAssign || day.scheduled_on === null || busy;

  const counter = headcount === null ? `${ticked.length}` : `${ticked.length} / ${headcount}`;
  const reasonInput = removing.length > 0 ? { reasonCode: reason } : {};

  return (
    <section className="flex flex-col gap-4" aria-labelledby="crew-heading">
      <header className="flex items-center justify-between gap-2">
        <h2 id="crew-heading" className="flex items-center gap-2 text-base font-semibold text-text">
          <Pictogram name="crew" size="sm" />
          Who is going
        </h2>
        <span className="text-sm font-semibold tabular-nums text-text-secondary">{counter}</span>
      </header>

      {closed ? (
        <p className="text-sm text-text-secondary">This day is settled; the crew is fixed.</p>
      ) : !canAssign ? (
        <p className="text-sm text-text-secondary">Your account cannot name crew right now.</p>
      ) : day.scheduled_on === null ? (
        <p className="text-sm text-text-secondary">This day has no date yet.</p>
      ) : null}

      {roster.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : roster.isError ? (
        <RosterFailure error={roster.error} onRetry={() => void roster.refetch()} />
      ) : split.eligible.length === 0 && split.blocked.length === 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-text-secondary">Your roster is empty.</p>
          <Link href="/me/crew" className="inline-flex min-h-11 w-fit items-center text-sm font-semibold text-action">
            Add your crew
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {split.eligible.map((member) => {
            const on = ticked.includes(member.membership_id);
            return (
              <li key={member.membership_id}>
                <button
                  type="button"
                  aria-pressed={on}
                  disabled={locked}
                  onClick={() =>
                    setSelected(
                      on
                        ? ticked.filter((id) => id !== member.membership_id)
                        : [...ticked, member.membership_id],
                    )
                  }
                  className={cn(
                    ROW,
                    on ? "border-selected bg-selected-surface" : "border-line bg-surface hover:bg-surface-hover",
                    locked && "cursor-not-allowed opacity-60",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-full",
                      on ? "bg-action text-action-text" : "border border-line-strong text-transparent",
                    )}
                  >
                    <Pictogram name="yes" size="sm" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold text-text">{member.display_name}</span>
                    <span className="text-xs text-text-muted">
                      {member.phone_masked}
                      {member.is_supervisor ? " · Supervisor" : ""}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {split.blocked.map(({ member, why }) => (
            <li key={member.membership_id} className={cn(ROW, "border-line bg-surface-sunken opacity-70")}>
              <span className="grid size-7 shrink-0 place-items-center rounded-full border border-line text-transparent">
                <Pictogram name="no" size="sm" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold text-text-secondary">{member.display_name}</span>
                <span className="text-xs text-text-muted">{INELIGIBILITY_WORDING[why]}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {locked ? null : (
        <>
          {removing.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Why are they off?</p>
              <ChoiceChips
                label="Why are they coming off this day?"
                name="release-reason"
                options={CREW_RELEASE_REASONS.map((code) => ({ value: code, label: RELEASE_REASON_LABEL[code] }))}
                value={reason}
                onChange={(value) => setReason(value as CrewReleaseReason)}
              />
            </div>
          ) : null}

          {problem === null ? null : (
            <p className="text-sm text-danger-text">{describeSelectionProblem(problem, headcount)}</p>
          )}

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              block
              onClick={() =>
                assign.mutate(
                  { membershipIds: ticked, ...reasonInput },
                  {
                    onSuccess: () => {
                      setSelected(null);
                      onSaved?.();
                    },
                  },
                )
              }
              loading={assign.isPending}
              loadingLabel="Saving"
              disabled={problem !== null || unchanged || busy}
            >
              Save crew ({counter})
            </Button>

            {remainingDays.length === 0 ? null : (
              <Button
                type="button"
                variant="secondary"
                block
                onClick={() =>
                  copy.mutate(
                    {
                      days: unchanged
                        ? remainingDays
                        : [{ stageId: scope.stageId, label: day.day_label || `Day ${day.position}` }, ...remainingDays],
                      membershipIds: ticked,
                      ...reasonInput,
                    },
                    {
                      onSuccess: () => {
                        setSelected(null);
                        onSaved?.();
                      },
                    },
                  )
                }
                loading={copy.isPending}
                loadingLabel="Copying"
                disabled={problem !== null || busy}
              >
                Copy to all {remainingDays.length + (unchanged ? 0 : 1)} days
              </Button>
            )}
          </div>
        </>
      )}

      {assign.isError ? <AssignFailure error={assign.error} /> : null}
      {copy.isError ? <CopyFailure error={copy.error} /> : null}
    </section>
  );
}

function RosterFailure({ error, onRetry }: { readonly error: unknown; readonly onRetry: () => void }) {
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

/**
 * `m2_crew_roster_required` has a route out of it; `m2_crew_conflict` renders
 * the server's own sentence, which names the person and the date.
 */
function AssignFailure({ error }: { readonly error: unknown }) {
  const presentation = describeError(error, "mutation");

  if (isCrewRosterRequired(error)) {
    return (
      <div className="flex flex-col gap-2">
        <ErrorState
          title="Add somebody to your roster first"
          message="Vsolve asks for your crew the first time you name anybody."
          severity="warning"
          reference={presentation.reference}
        />
        <Link href="/me/crew" className="inline-flex min-h-11 w-fit items-center text-sm font-semibold text-action">
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

function CopyFailure({ error }: { readonly error: unknown }) {
  if (!isCrewCopyFailure(error)) return <AssignFailure error={error} />;
  const presentation = describeError(error.cause, "mutation");
  const done = error.completed.map((day) => day.label).join(", ");
  return (
    <ErrorState
      title={`${error.failedDay.label} refused`}
      message={done === "" ? presentation.message : `${presentation.message} Saved: ${done}.`}
      severity="warning"
      reference={presentation.reference}
    />
  );
}
