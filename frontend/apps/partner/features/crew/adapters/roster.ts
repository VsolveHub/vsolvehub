import {
  readCrewStatus,
  type CrewMemberInput,
  type CrewMemberRecord,
} from "@/features/capability/adapters/wire";

/**
 * The crew roster: who is on it, who may supervise, what a form must get right.
 *
 * Closes the decision half of `M2-FE-107`.
 *
 * ## Entered at first assignment, never at registration
 *
 * `FLOW-07` is explicit and this module is where it is easy to break. Nothing
 * here is reachable from `/apply`, nothing in the express path mentions a
 * roster, and the `CREW_ROSTER` gate blocks exactly one action — `crew.assign` —
 * rather than the workspace. A workforce agency signs up, browses demand,
 * accepts an enquiry and quotes without ever naming a worker; the roster is
 * asked for at the moment a shift needs filling, which is also the moment the
 * Partner knows who is going.
 *
 * ## Archived is not deleted
 *
 * `archive_crew_member` sets a status and a timestamp, and `add_crew_member`
 * un-archives a returning worker rather than creating a second membership.
 * Seasonal labour is the normal case, not an edge one, and a roster that grew a
 * duplicate row every time someone came back would break the double-booking
 * check that global identity exists to provide.
 *
 * So `activeMembers` is what a picker shows, and `archivedMembers` stays
 * readable — a Partner needs to find the person they let go last season to bring
 * them back, and a list they cannot see is a list they re-add by hand.
 */

export function activeMembers(members: readonly CrewMemberRecord[]): CrewMemberRecord[] {
  return members.filter((member) => readCrewStatus(member.status) === "ACTIVE");
}

export function archivedMembers(members: readonly CrewMemberRecord[]): CrewMemberRecord[] {
  return members.filter((member) => readCrewStatus(member.status) === "ARCHIVED");
}

/**
 * Rows whose membership status this build has no words for.
 *
 * `CrewMember.status` is a bare `string`. A third value from a newer deployment
 * belongs in neither list above, and silently vanishing from a roster is the one
 * outcome a Partner must not get — they would send four people to a site
 * believing the fifth was never added. Counted and stated instead.
 */
export function unrecognisedMembers(members: readonly CrewMemberRecord[]): CrewMemberRecord[] {
  return members.filter((member) => readCrewStatus(member.status) === null);
}

export function supervisors(members: readonly CrewMemberRecord[]): CrewMemberRecord[] {
  return activeMembers(members).filter((member) => member.is_supervisor);
}

/**
 * Whether the roster can report attendance at all.
 *
 * A3 attendance is a *supervisor* action — "n of m present today", one tap,
 * `M2-FE-505` — so a roster with no supervisor has nobody who can file it. That
 * is worth saying on the roster screen, before a shift starts, rather than
 * discovering it on site at seven in the morning.
 *
 * It is not a gate. Django decides who may confirm attendance, and a roster
 * whose supervisor was archived this morning is a problem the server reports.
 */
export function canReportAttendance(members: readonly CrewMemberRecord[]): boolean {
  return supervisors(members).length > 0;
}

export type CrewField = "display_name" | "phone_e164" | "skill_codes";

export interface CrewProblem {
  readonly field: CrewField;
  readonly message: string;
}

/**
 * Indian mobile numbers in E.164.
 *
 * `+91` and ten digits starting 6–9, which is the range the Indian numbering
 * plan assigns to mobiles. Landlines are excluded deliberately: this number is
 * how a worker is identified globally and how a site supervisor reaches them, so
 * a desk number that resolves to an office is worse than a rejected form.
 *
 * The check is duplicated in Django and that is correct — this one saves a
 * round-trip on an obvious typo, and Django's is the one that decides.
 */
const INDIAN_MOBILE = /^\+91[6-9]\d{9}$/;

/**
 * Problems worth catching before the request.
 *
 * Short, for the reason `readiness.ts` gives: a client rule stricter than the
 * server's traps people who have done nothing wrong. Everything not listed goes
 * to Django and returns as a field error.
 */
export function crewProblems(input: CrewMemberInput): CrewProblem[] {
  const problems: CrewProblem[] = [];

  if (input.display_name.trim().length < 2) {
    problems.push({
      field: "display_name",
      message: "Add the name your team knows this person by.",
    });
  }

  if (!INDIAN_MOBILE.test(input.phone_e164.trim())) {
    problems.push({
      field: "phone_e164",
      message: "Enter a 10-digit mobile number. We use it to make sure nobody is double-booked.",
    });
  }

  return problems;
}

/**
 * Whether this person is already on the roster, by masked phone.
 *
 * Masked, because the full number is never published back (0013 §E1) — so the
 * comparison is on the last four digits the server did send, and a match is
 * treated as *probable* rather than certain. It softens the button to "this
 * looks like someone you already have" instead of refusing, since two workers
 * can share a suffix and refusing the second one would be a bug the Partner
 * cannot argue with.
 *
 * The real duplicate check is Django's: identity is a keyed hash of the full
 * number, and `add_crew_member` resolves to one person regardless of what this
 * says.
 */
export function probableDuplicate(
  members: readonly CrewMemberRecord[],
  phoneE164: string,
): CrewMemberRecord | null {
  const digits = phoneE164.replace(/\D/g, "");
  if (digits.length < 4) return null;
  const suffix = digits.slice(-4);

  return (
    members.find((member) => member.phone_masked.replace(/\D/g, "").endsWith(suffix)) ?? null
  );
}

/**
 * How the roster is ordered on screen.
 *
 * Supervisors first, then everyone else by name. Not by date added: a Partner
 * scanning for a person searches by name, and "most recently added" puts the
 * people they know best at the bottom by the second season.
 */
export function sortForDisplay(members: readonly CrewMemberRecord[]): CrewMemberRecord[] {
  return [...members].sort((left, right) => {
    if (left.is_supervisor !== right.is_supervisor) return left.is_supervisor ? -1 : 1;
    return left.display_name.localeCompare(right.display_name, "en-IN");
  });
}

/* ---------------------------------------------------------------------------
   View model
   --------------------------------------------------------------------------- */

export interface CrewRow {
  readonly membershipId: string;
  readonly name: string;
  readonly phoneMasked: string;
  readonly isSupervisor: boolean;
  readonly skillCodes: readonly string[];
  /** Operations checked their documents. Never inferred from being on the roster. */
  readonly documentsVerified: boolean;
  readonly isArchived: boolean;
  /**
   * `MAN` / `WOMAN` / `OTHER` / `UNDISCLOSED`, or `""` when nobody has recorded it.
   *
   * Blank is the state that costs the Partner work rather than a cosmetic gap: a Customer who
   * books three women is matched against recorded genders at accept and at assignment, so a
   * roster of blanks passes dispatch and then fails at the gate. The roster screen says so.
   */
  readonly gender: CrewMemberRecord["gender"];
}

export interface RosterView {
  readonly active: readonly CrewRow[];
  readonly archived: readonly CrewRow[];
  /** Rows whose status this build cannot describe. Stated, never dropped. */
  readonly unrecognised: readonly CrewRow[];
  readonly supervisorCount: number;
  /** No supervisor means nobody can file "n of m present" when a shift runs. */
  readonly canReportAttendance: boolean;
  readonly isEmpty: boolean;
  /**
   * Active crew with no gender on file.
   *
   * Surfaced as a count because it is the one roster fact with a consequence a Partner cannot see
   * coming: these people fill a headcount and no gendered slot, so a job asking for women is
   * refused at accept however many of them are on the list.
   */
  readonly genderUnrecordedCount: number;
}

function toRow(member: CrewMemberRecord): CrewRow {
  return {
    membershipId: member.membership_id,
    name: member.display_name,
    phoneMasked: member.phone_masked,
    isSupervisor: member.is_supervisor,
    skillCodes: member.skill_codes,
    documentsVerified: member.documents_verified_at !== null,
    isArchived: readCrewStatus(member.status) === "ARCHIVED",
    gender: member.gender,
  };
}

export function describeRoster(members: readonly CrewMemberRecord[]): RosterView {
  return {
    active: sortForDisplay(activeMembers(members)).map(toRow),
    archived: sortForDisplay(archivedMembers(members)).map(toRow),
    unrecognised: sortForDisplay(unrecognisedMembers(members)).map(toRow),
    supervisorCount: supervisors(members).length,
    canReportAttendance: canReportAttendance(members),
    isEmpty: members.length === 0,
    genderUnrecordedCount: activeMembers(members).filter((member) => member.gender === "")
      .length,
  };
}
