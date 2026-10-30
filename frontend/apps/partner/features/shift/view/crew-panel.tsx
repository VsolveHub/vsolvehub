"use client";

import { Button, ChoiceChips, ErrorState, Skeleton, cn, useT } from "@vsolve/ui";
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
import type { CrewMemberRecord } from "@/features/capability/adapters/wire";
import { crewGenderLabel } from "@/features/crew/view/crew-gender";

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
  const t = useT();
  const roster = usePartnerCrew();
  const assign = useAssignShiftCrew(scope);
  const copy = useAssignCrewToDays(scope.engagementId);

  const onTheDay = useMemo(() => assignedMembershipIds(day), [day]);
  const [selected, setSelected] = useState<readonly string[] | null>(null);
  const [reason, setReason] = useState<CrewReleaseReason>("substituted");
  /* Which role each ticked worker is named into. Null until touched, so a refetch that
     rearranges the day is reflected rather than overwritten by a stale local guess. */
  const [roleDraft, setRoleDraft] = useState<Readonly<Record<string, string>> | null>(null);

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

  /* Roles exist only on a job that asked for a men/women split, which is a minority of them.
     Everywhere else this whole block is absent rather than rendered empty. */
  const roleOptions = day.role_fulfilment;
  const roles = roleDraft ?? assignedRoles(day);
  /* Recomputed against the crew being arranged, not the crew last saved.

     `day.role_fulfilment` is the server's answer about what is *stored*, and the whole value of
     showing it here is that a supervisor sees the gap before committing -- so while the selection
     is a draft the server has never seen, the server's numbers describe a different crew. The
     **wanted** side stays the server's, because that is a fact about the booking; only the
     **named** side is local, because only this screen knows what is ticked. */
  const shortRoles = previewFulfilment(roleOptions, roles, ticked, split.eligible, t).filter(
    (row) => !row.is_met,
  );

  return (
    <section className="flex flex-col gap-4" aria-labelledby="crew-heading">
      <header className="flex items-center justify-between gap-2">
        <h2 id="crew-heading" className="flex items-center gap-2 text-base font-semibold text-text">
          <Pictogram name="crew" size="sm" />
          {t("work.crewPanel.heading")}
        </h2>
        <span className="text-sm font-semibold tabular-nums text-text-secondary">{counter}</span>
      </header>

      {closed ? (
        <p className="text-sm text-text-secondary">{t("work.crewPanel.closed")}</p>
      ) : !canAssign ? (
        <p className="text-sm text-text-secondary">{t("work.crewPanel.cannotAssign")}</p>
      ) : day.scheduled_on === null ? (
        <p className="text-sm text-text-secondary">{t("work.crewPanel.noDate")}</p>
      ) : null}

      {roster.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : roster.isError ? (
        <RosterFailure error={roster.error} onRetry={() => void roster.refetch()} />
      ) : split.eligible.length === 0 && split.blocked.length === 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-text-secondary">{t("work.crewPanel.rosterEmpty")}</p>
          <Link href="/me/crew" className="inline-flex min-h-11 w-fit items-center text-sm font-semibold text-action">
            {t("work.crewPanel.addCrew")}
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
                      {member.is_supervisor ? ` · ${t("work.crewPanel.supervisor")}` : ""}
                      {/* The gate this screen submits into counts men and women, and a name is
                          not a reliable signal of either -- which is the whole reason the field
                          exists. Without it here a supervisor picks blind and meets the refusal
                          by chance rather than by mistake. Shown only when recorded: a blank is
                          chased on the roster screen, which has the count and the control, and
                          nagging about it on a job that asks for no mix is noise. */}
                      {member.gender === "" ? "" : ` · ${crewGenderLabel(member.gender, t)}`}
                    </span>
                  </span>
                </button>

                {/* Only for a ticked worker on a job that asks for roles. The gate this screen
                    submits into counts totals, so this changes no refusal -- what it buys is the
                    record, and the warning below that reads from it. */}
                {on && roleOptions.length > 0 ? (
                  <label className="mt-1 flex items-center gap-2 pl-10 text-xs text-text-secondary">
                    {t("work.crewPanel.workingAs")}
                    <select
                      value={roles[member.membership_id] ?? ""}
                      disabled={locked}
                      onChange={(event) =>
                        setRoleDraft({
                          ...roles,
                          [member.membership_id]: event.target.value,
                        })
                      }
                      className="min-h-9 rounded-control border border-line bg-surface px-2 text-xs text-text disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
                    >
                      <option value="">{t("work.crewPanel.roleNotSet")}</option>
                      {roleOptions.map((row) => (
                        <option key={row.role_code} value={row.role_code}>
                          {row.role_label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
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
                <span className="text-xs text-text-muted">
                  {t(INELIGIBILITY_WORDING[why])}
                  {member.gender === "" ? "" : ` · ${crewGenderLabel(member.gender, t)}`}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {locked ? null : (
        <>
          {removing.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t("work.crewPanel.whyOff")}</p>
              <ChoiceChips
                label={t("work.crewPanel.whyOffLabel")}
                name="release-reason"
                options={CREW_RELEASE_REASONS.map((code) => ({ value: code, label: t(RELEASE_REASON_LABEL[code]) }))}
                value={reason}
                onChange={(value) => setReason(value as CrewReleaseReason)}
              />
            </div>
          ) : null}

          {problem === null ? null : (
            <p className="text-sm text-danger-text">{describeSelectionProblem(problem, headcount, t)}</p>
          )}

          <div className="flex flex-col gap-2">
            {/* Only once somebody is ticked. With nothing named every role is trivially short,
                and a warning that is red on arrival is one a supervisor learns to scroll past. */}
            <RoleGapNotice rows={ticked.length === 0 ? [] : shortRoles} />

            <Button
              type="button"
              block
              onClick={() =>
                assign.mutate(
                  { membershipIds: ticked, roles, ...reasonInput },
                  {
                    onSuccess: () => {
                      setSelected(null);
                      onSaved?.();
                    },
                  },
                )
              }
              loading={assign.isPending}
              loadingLabel={t("common.saving")}
              disabled={problem !== null || unchanged || busy}
            >
              {t("work.crewPanel.saveCrew", { counter })}
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
                        : [{ stageId: scope.stageId, label: day.day_label || t("work.crewPanel.dayPosition", { position: day.position }) }, ...remainingDays],
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
                loadingLabel={t("work.crewPanel.copying")}
                disabled={problem !== null || busy}
              >
                {t("work.crewPanel.copyToAll", { count: remainingDays.length + (unchanged ? 0 : 1) })}
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
  const t = useT();
  const presentation = describeError(error, "read");
  return (
    <ErrorState
      title={presentation.title}
      message={presentation.message}
      severity={presentation.severity}
      actionLabel={t("common.tryAgain")}
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
  const t = useT();
  const presentation = describeError(error, "mutation");

  if (isCrewRosterRequired(error)) {
    return (
      <div className="flex flex-col gap-2">
        <ErrorState
          title={t("work.crewPanel.rosterRequired.title")}
          message={t("work.crewPanel.rosterRequired.message")}
          severity="warning"
          reference={presentation.reference}
        />
        <Link href="/me/crew" className="inline-flex min-h-11 w-fit items-center text-sm font-semibold text-action">
          {t("work.crewPanel.rosterRequired.action")}
        </Link>
      </div>
    );
  }

  if (isCrewConflict(error)) {
    return (
      <ErrorState
        title={t("work.crewPanel.conflictTitle")}
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
  const t = useT();
  if (!isCrewCopyFailure(error)) return <AssignFailure error={error} />;
  const presentation = describeError(error.cause, "mutation");
  const done = error.completed.map((day) => day.label).join(", ");
  return (
    <ErrorState
      title={t("work.crewPanel.copyRefused", { day: error.failedDay.label })}
      message={
        done === ""
          ? presentation.message
          : `${presentation.message} ${t("work.crewPanel.copySaved", { days: done })}`
      }
      severity="warning"
      reference={presentation.reference}
    />
  );
}


/** Which role each worker on the day is already named into, keyed by membership id. */
function assignedRoles(day: ShiftDay): Readonly<Record<string, string>> {
  const roles: Record<string, string> = {};
  for (const member of day.crew) {
    if (member.membership_id !== null && member.role_code !== "") {
      roles[member.membership_id] = member.role_code;
    }
  }
  return roles;
}

/**
 * Roles the named crew does not cover.
 *
 * **A warning, and deliberately not a block.** The server refuses on totals -- five men and two
 * women, roles collapsed -- which is a floor rather than the promise the offer screen makes: that
 * gate passes with both women on setup while the customer asked for them on the serving line.
 * This is what says so.
 *
 * It does not disable the save. Swapping somebody between roles on the morning of an event is
 * ordinary, the supervisor is standing somewhere we cannot see, and the attendance shortfall path
 * already settles a day that did not go to plan. A supervisor who reads this and saves anyway has
 * made a decision; one who is blocked has an argument with a screen.
 *
 * The wording comes from the server (`gap`), so this screen and any other cannot describe the same
 * shortfall differently.
 */
function RoleGapNotice({ rows }: { readonly rows: readonly ShiftDay["role_fulfilment"][number][] }) {
  const t = useT();
  if (rows.length === 0) return null;

  return (
    <div className="rounded-card border border-warning-line bg-warning-surface px-3.5 py-3">
      <p className="text-sm font-bold text-warning-text">{t("work.crewPanel.roleGap.title")}</p>
      <ul className="mt-1.5 flex list-none flex-col gap-1 p-0">
        {rows.map((row) => (
          <li key={row.role_code} className="text-sm leading-5 text-warning-text">
            <span className="font-semibold">{row.role_label}</span>{" "}
            {t("work.crewPanel.roleGap.row", {
              wantedMen: people(row.wanted_men, "man", t),
              wantedWomen: people(row.wanted_women, "woman", t),
              namedMen: row.named_men,
              namedWomen: row.named_women,
              gap: row.gap,
            })}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-xs leading-5 text-warning-text">
        {t("work.crewPanel.roleGap.footer")}
      </p>
    </div>
  );
}


/** "1 man", "2 men", "0 women". Plurals the customer's own numbers earn. */
function people(count: number, noun: "man" | "woman", t: ReturnType<typeof useT>): string {
  return noun === "man"
    ? t("work.crewPanel.menCount", { count })
    : t("work.crewPanel.womenCount", { count });
}


/**
 * The server's per-role expectation, counted against the crew currently ticked.
 *
 * Deliberately not a second implementation of the rule: `wanted_men` / `wanted_women` and the
 * labels come straight from the server's `role_fulfilment`, and this only recounts the half the
 * server cannot know — who is ticked right now, and which role they have been dropped into. The
 * moment the draft is saved the server's own numbers say the same thing.
 */
function previewFulfilment(
  rows: readonly ShiftDay["role_fulfilment"][number][],
  roles: Readonly<Record<string, string>>,
  ticked: readonly string[],
  roster: readonly CrewMemberRecord[],
  t: ReturnType<typeof useT>,
): readonly ShiftDay["role_fulfilment"][number][] {
  const genderOf = new Map(roster.map((member) => [member.membership_id, member.gender]));

  return rows.map((row) => {
    let namedMen = 0;
    let namedWomen = 0;
    for (const membershipId of ticked) {
      if (roles[membershipId] !== row.role_code) continue;
      const gender = genderOf.get(membershipId);
      if (gender === "MAN") namedMen += 1;
      else if (gender === "WOMAN") namedWomen += 1;
    }
    const shortMen = Math.max(0, row.wanted_men - namedMen);
    const shortWomen = Math.max(0, row.wanted_women - namedWomen);
    const gap = [
      shortMen > 0 ? people(shortMen, "man", t) : null,
      shortWomen > 0 ? people(shortWomen, "woman", t) : null,
    ].filter((part): part is string => part !== null);

    return {
      ...row,
      named_men: namedMen,
      named_women: namedWomen,
      is_met: gap.length === 0,
      gap:
        gap.length === 0
          ? ""
          : gap.length === 2
            ? t("work.crewPanel.gapShortBoth", { first: gap[0]!, second: gap[1]! })
            : t("work.crewPanel.gapShort", { people: gap[0]! }),
    };
  });
}
