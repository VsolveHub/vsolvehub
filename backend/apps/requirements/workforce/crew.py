"""Which named people are coming to one shift-day, and who else has already promised them.

The assignment table and nothing else: `assign_crew` reconciles a day to the crew a supervisor
means to have on site, and `future_assignment_dates` is the read `capabilities.archive_crew_member`
makes back across the boundary. The rules about a roster — ownership, archives, declared days off —
stay in `apps.partners`; what lives here is the table those rules are checked against, and the one
rule that can only be asked of it: the same person promised through two agencies on one date.

The boundary: nothing here records what happened on the day. The moment the crew turns up, it is
`attendance`'s.
"""

import uuid
from collections.abc import Mapping, Sequence
from datetime import date

from django.db import transaction
from django.utils import timezone

from apps.foundation.services import enqueue_outbox_event
from apps.identity.models import User
from apps.partners.capabilities import assert_crew_available, assert_crew_roster_present
from apps.partners.exceptions import CrewConflictError
from apps.partners.models import CrewMember, PartnerCrewMembership
from apps.requirements import crew_mix, stages
from apps.requirements.exceptions import (
    RequirementNotFoundError,
    StageTransitionError,
)
from apps.requirements.models import (
    Engagement,
    EngagementStage,
    StageCrewAssignment,
)

from .base import _assert_workforce_stage, _locked_stage, ensure_attendance, shift_date_of

# ---------------------------------------------------------------------------
# Crew assignment, per stage (`M2-BE-522`)
# ---------------------------------------------------------------------------


def assigned_crew(stage: EngagementStage) -> list[StageCrewAssignment]:
    return list(
        StageCrewAssignment.objects.filter(
            stage=stage,
            status=StageCrewAssignment.Status.ASSIGNED,
        )
        .select_related("crew_member", "membership__crew_member")
        .order_by("-is_supervisor", "assigned_at")
    )


def _busy_crew_member_ids(*, shift_date: date, stage: EngagementStage) -> set[uuid.UUID]:
    """Everyone already promised to somebody on this date, through any agency.

    The global half of `m2_crew_conflict`. `partners.assert_crew_available` takes this set and owns
    the rest of the rules — roster ownership, archived memberships and declared days off — which is
    where they already lived before this wave; this module owns the assignment table, so it owns
    the query over it.
    """
    return set(
        StageCrewAssignment.objects.filter(
            shift_date=shift_date,
            status=StageCrewAssignment.Status.ASSIGNED,
        )
        .exclude(stage_id=stage.id)
        .values_list("crew_member_id", flat=True)
    )


@transaction.atomic
def assign_crew(
    *,
    stage_id: uuid.UUID,
    actor: User,
    membership_ids: Sequence[uuid.UUID],
    roles: Mapping[uuid.UUID, str] | None = None,
    reason_code: str = "",
) -> list[StageCrewAssignment]:
    """Name the workers coming to one shift-day. Partner command (`assign_crew` in §6).

    **The whole intended crew, every time.** The command takes the set the supervisor means to have
    on site and reconciles the day to it: names that are gone are released with a reason, names
    that are new are assigned. That makes a substitution one call rather than a delete-then-add
    a client can half-perform, and it makes the command idempotent — re-sending the same set is a
    no-op, which is what a retried tap needs.

    Four refusals, in this order, and each one is a different failure:

    1. **The roster gate** (`m2_crew_roster_required`) — a progressive gate at the *first
       assignment*, not at registration, which is `capabilities.assert_crew_roster_present`'s whole
       design.
    2. **Verified people only.** An unverified membership is a name somebody typed. `M2-BE-522`
       asks for verified identity, `crew_dispatch.verified_roster_size` already sizes the offer
       against verified members, and the plan's rule that "named crew cannot be replaced by
       unverified workers" is meaningless if the first assignment may be unverified.
    3. **Ownership, archives and declared days off** — `assert_crew_available`, unchanged.
    4. **The global conflict** (`m2_crew_conflict`) — the same person promised through two
       agencies on one date. Raised here with the person and the date in the message, and held by
       `requirements_crew_member_one_shift_a_day` when two supervisors tap at the same instant.
    5. **The mix** (`m2_crew_mix_unmet`) — the Customer booked so many men and so many women, and
       these names do not add up to it. Exact here, unlike the dispatch filter that let this lead
       be invited on an unrecorded roster: by now real people are being named for a real day, and
       a worker with no gender on file is a question to answer rather than a benefit of the doubt.

       This is the last gate before somebody travels. It is deliberately a refusal and not a
       warning -- a lead who discovers on site that he cannot staff what was sold is the failure
       this whole feature exists to prevent.

    `roles` records which role each worker was named into. It is **not** a fifth-and-a-half
    refusal: the mix gate above compares totals, and a role that does not line up produces a
    warning on the screen (`crew_mix.role_fulfilment`) rather than a block. Swapping somebody
    between roles on the morning of an event is ordinary, and the attendance shortfall path
    already settles a day that did not go to plan. What the column buys is a record -- a shift
    settled without it cannot be reconstructed afterwards, which is why it is written now and
    enforced later, if ever.

    The crew may not exceed the headcount the Customer booked. More workers than were agreed is a
    scope amendment at the published rate (`M2-BE-538`), not a longer list on an assignment screen.
    """
    stage = _locked_stage(stage_id)
    engagement = _assert_workforce_stage(stage)
    if stage.status in (EngagementStage.Status.APPROVED, EngagementStage.Status.RELEASED):
        raise StageTransitionError("This shift-day is settled; its crew can no longer change.")
    shift_date = shift_date_of(stage)
    partner = engagement.partner
    assert_crew_roster_present(partner)

    attendance = ensure_attendance(stage=stage)
    wanted_ids = list(dict.fromkeys(membership_ids))
    if not wanted_ids:
        raise StageTransitionError("Name at least one worker for this shift-day.")
    if len(wanted_ids) > attendance.expected_count:
        raise StageTransitionError(
            f"This day was booked for {attendance.expected_count} workers. Extra workers need a "
            "change request at the published rate.",
        )

    memberships = list(
        PartnerCrewMembership.objects.select_related("crew_member").filter(id__in=wanted_ids)
    )
    if len(memberships) != len(wanted_ids):
        raise RequirementNotFoundError()
    for membership in memberships:
        if membership.documents_verified_at is None:
            raise CrewConflictError(
                f"{membership.roster_name} is not verified yet, so they cannot be put on a shift.",
            )
    assert_crew_available(
        partner=partner,
        memberships=memberships,
        on_day=shift_date,
        busy_crew_member_ids=_busy_crew_member_ids(shift_date=shift_date, stage=stage),
    )
    _assert_mix_met(engagement=engagement, memberships=memberships)
    wanted_roles = _validated_roles(engagement=engagement, roles=roles or {})

    current = {
        assignment.membership_id: assignment
        for assignment in StageCrewAssignment.objects.select_for_update()
        .filter(stage=stage, status=StageCrewAssignment.Status.ASSIGNED)
        .select_related("crew_member", "membership__crew_member")
    }
    now = timezone.now()
    for membership_id, assignment in current.items():
        if membership_id in set(wanted_ids):
            continue
        assignment.status = StageCrewAssignment.Status.RELEASED
        assignment.released_at = now
        assignment.released_reason_code = reason_code or "substituted"
        assignment.save(
            update_fields=("status", "released_at", "released_reason_code", "updated_at")
        )
        stages.record_event(
            engagement=engagement,
            stage=stage,
            from_status=stage.status,
            to_status=stage.status,
            actor=actor,
            reason_code="crew_released",
            reason=f"{assignment.membership.roster_name} off {shift_date.isoformat()}",
        )

    for membership in memberships:
        if membership.id in current:
            # Already on the day. The command is the whole crew every time, so a re-send is how a
            # supervisor moves somebody between roles -- releasing and re-adding them would file a
            # substitution in the Customer's notifications for a change they did not make.
            existing = current[membership.id]
            role = wanted_roles.get(membership.id, "")
            if role and existing.role_code != role:
                existing.role_code = role
                existing.save(update_fields=("role_code", "updated_at"))
            continue
        StageCrewAssignment.objects.create(
            stage=stage,
            partner=partner,
            membership=membership,
            crew_member=membership.crew_member,
            shift_date=shift_date,
            role_code=wanted_roles.get(membership.id, ""),
            is_supervisor=membership.is_supervisor,
            assigned_by=actor,
        )
        stages.record_event(
            engagement=engagement,
            stage=stage,
            from_status=stage.status,
            to_status=stage.status,
            actor=actor,
            reason_code="crew_assigned",
            reason=f"{membership.roster_name} on {shift_date.isoformat()}",
        )

    enqueue_outbox_event(
        aggregate_type="engagement",
        aggregate_id=engagement.id,
        event_type="m2.shift.crew_assigned",
        idempotency_key=f"shift-crew:{stage.id}:{now.isoformat()}",
        payload={
            "engagement_id": str(engagement.id),
            "stage_id": str(stage.id),
            "shift_date": shift_date.isoformat(),
            "crew_size": len(memberships),
        },
    )
    return assigned_crew(stage)


def future_assignment_dates(*, membership: PartnerCrewMembership) -> list[date]:
    """Shift-days this worker is still promised to, from today forward.

    Read by `capabilities.archive_crew_member`, which until this wave could take a name off a
    roster while the person was booked on Thursday — proposal 0013's acceptance criterion 9, left
    open in `M2-BE-111` because the table it needed did not exist yet.
    """
    return list(
        StageCrewAssignment.objects.filter(
            membership=membership,
            status=StageCrewAssignment.Status.ASSIGNED,
            shift_date__gte=timezone.localdate(),
        )
        .order_by("shift_date")
        .values_list("shift_date", flat=True)
    )


def _assert_mix_met(
    *, engagement: Engagement, memberships: Sequence[PartnerCrewMembership]
) -> None:
    """The named crew must be the crew the Customer bought.

    Counted from the people in front of us rather than from the roster, because the roster is what
    a lead *could* field and this is what they *are* fielding. A worker whose gender is not on file
    counts toward neither side, and the message says so by name -- "record who they are" is a thing
    the supervisor can act on, where "mix unmet" is not.
    """
    requirement = engagement.requirement
    men_wanted, women_wanted = crew_mix.requested_mix(requirement)
    if not men_wanted and not women_wanted:
        return

    named = crew_mix.RosterMix(
        men=sum(1 for m in memberships if m.crew_member.gender == CrewMember.Gender.MAN),
        women=sum(1 for m in memberships if m.crew_member.gender == CrewMember.Gender.WOMAN),
        unknown=0,
    )
    unrecorded = [m.roster_name for m in memberships if not m.crew_member.gender]
    shortfall = crew_mix.shortfall_against(
        named, men=men_wanted, women=women_wanted, count_unknown=False
    )
    if not shortfall:
        return

    if unrecorded:
        raise CrewConflictError(
            "This day was booked for "
            f"{crew_mix.MixShortfall(men=men_wanted, women=women_wanted).describe()}"
            f", and Vsolve has no record of whether {_names(unrecorded)} "
            f"{'is' if len(unrecorded) == 1 else 'are'} a man or a woman. "
            "Add that to your crew list and try again.",
        )
    raise CrewConflictError(
        f"This day was booked for {men_wanted} men and {women_wanted} women. "
        f"The crew you have named needs {shortfall.describe()}.",
    )


def _names(names: Sequence[str]) -> str:
    if len(names) == 1:
        return names[0]
    return f"{', '.join(names[:-1])} and {names[-1]}"


def _validated_roles(
    *, engagement: Engagement, roles: Mapping[uuid.UUID, str]
) -> dict[uuid.UUID, str]:
    """Keep only role codes this requirement actually published.

    A code the catalogue does not carry is dropped rather than refused. It is a hint about how the
    crew is arranged, not a commitment: refusing the whole assignment because a client sent a stale
    role would stop a supervisor naming a crew over something that changes nothing about who turns
    up.
    """
    allowed = crew_mix.role_codes(engagement.requirement)
    return {membership_id: code for membership_id, code in roles.items() if code in allowed}
