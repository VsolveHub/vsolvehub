"""Crew: global person identity, per-Partner roster membership.

The original section of that name, whole. A worker is one global `CrewMember` resolved by a keyed
hash of their number, and a `PartnerCrewMembership` for each agency that has them on its roster —
so the double-booking check below can see a person promised to two agencies on one day.

The boundary is the roster and the day. What a shift *costs* is `vendor_records.live_wage_floor`;
who is assigned to an engagement is `apps.requirements.workforce`, which this module reaches into
lazily in `archive_crew_member` for exactly one question.
"""

import uuid
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date, datetime

from django.db import transaction
from django.utils import timezone

from apps.identity.hashing import keyed_hash
from apps.partners.exceptions import CrewConflictError
from apps.partners.models import (
    CrewAvailabilityException,
    CrewMember,
    CrewSkill,
    PartnerCrewMembership,
    PartnerProfile,
    Skill,
)


def crew_identity_hash(*, phone_e164: str) -> str:
    return keyed_hash(f"crew:{phone_e164}")


@dataclass(frozen=True, slots=True)
class CrewRosterChange:
    """What actually happened, because three outcomes look identical from the outside.

    A new person, a returning person un-archived, and a person already on the roster are all a
    `200`-shaped success, and the Partner needs to be told which. "We put Ramesh back on your
    roster" is the one that matters: it answers a name the Partner thought was gone, and a silent
    success there reads as a duplicate that never appeared.
    """

    membership: PartnerCrewMembership
    was_created: bool
    was_reinstated: bool


@transaction.atomic
def add_crew_to_roster(
    *,
    partner: PartnerProfile,
    display_name: str,
    phone_e164: str,
    skills: Sequence[Skill] = (),
    is_supervisor: bool = False,
) -> CrewRosterChange:
    """Add a worker to one roster, resolving them to a single global person."""
    identity = crew_identity_hash(phone_e164=phone_e164)
    crew_member, _ = CrewMember.objects.get_or_create(
        identity_hash=identity,
        defaults={"display_name": display_name, "phone_suffix": phone_e164[-4:]},
    )
    if not crew_member.phone_suffix:
        # Backfill for a person first registered before the suffix existed. Derived from the number
        # the caller just supplied, which resolved to this same identity hash, so it cannot be
        # somebody else's digits.
        crew_member.phone_suffix = phone_e164[-4:]
        crew_member.save(update_fields=("phone_suffix", "updated_at"))

    membership, created = PartnerCrewMembership.objects.get_or_create(
        partner=partner,
        crew_member=crew_member,
        defaults={"is_supervisor": is_supervisor},
    )
    reinstated = False
    if not created and membership.status == PartnerCrewMembership.Status.ARCHIVED:
        membership.status = PartnerCrewMembership.Status.ACTIVE
        membership.archived_at = None
        membership.is_supervisor = is_supervisor
        membership.save(update_fields=("status", "archived_at", "is_supervisor"))
        reinstated = True

    for skill in skills:
        CrewSkill.objects.get_or_create(membership=membership, skill=skill)
    return CrewRosterChange(
        membership=membership,
        was_created=created,
        was_reinstated=reinstated,
    )


def add_crew_member(
    *,
    partner: PartnerProfile,
    display_name: str,
    phone_e164: str,
    skills: Sequence[Skill] = (),
    is_supervisor: bool = False,
) -> PartnerCrewMembership:
    """`add_crew_to_roster` for callers that only need the membership."""
    return add_crew_to_roster(
        partner=partner,
        display_name=display_name,
        phone_e164=phone_e164,
        skills=skills,
        is_supervisor=is_supervisor,
    ).membership


@transaction.atomic
def update_crew_member(
    *,
    membership: PartnerCrewMembership,
    skills: Sequence[Skill] | None = None,
    is_supervisor: bool | None = None,
) -> PartnerCrewMembership:
    """Skills and the supervisor flag, and deliberately not the display name.

    The name belongs to the global `CrewMember`, which several agencies may share. One agency
    renaming a person would rename them on every other roster, so it is published read-only rather
    than published editable and then scoped in a way a later caller can forget.
    """
    if is_supervisor is not None and membership.is_supervisor != is_supervisor:
        membership.is_supervisor = is_supervisor
        membership.save(update_fields=("is_supervisor",))

    if skills is not None:
        wanted = {skill.id: skill for skill in skills}
        CrewSkill.objects.filter(membership=membership).exclude(skill_id__in=list(wanted)).delete()
        for skill in wanted.values():
            CrewSkill.objects.get_or_create(membership=membership, skill=skill)
    return membership


@transaction.atomic
def archive_crew_member(*, membership: PartnerCrewMembership) -> PartnerCrewMembership:
    """Take a worker off one roster, unless somebody is expecting them on a shift.

    **Proposal 0013's acceptance criterion 9, finally enforceable.** Until Wave C4 there was no
    table saying who was promised where, so this command archived a name that a Customer was
    expecting on Thursday and the roster and the shift-day disagreed silently. `M2-BE-522` built
    the table; this reads it and refuses with `m2_crew_conflict`, naming the dates.

    The import is late on purpose. `apps.requirements` imports this module — the reverse at module
    scope closes a cycle — and this is the branch that runs once, when somebody edits a roster,
    rather than on every dispatch.
    """
    from apps.requirements.workforce import (  # noqa: PLC0415 — mutual import with this module
        future_assignment_dates,
    )

    booked = future_assignment_dates(membership=membership)
    if booked:
        days = ", ".join(day.isoformat() for day in booked[:5])
        raise CrewConflictError(
            f"{membership.crew_member.display_name} is booked on {days}. Replace them on those "
            "shifts before taking them off the roster.",
        )
    membership.status = PartnerCrewMembership.Status.ARCHIVED
    membership.archived_at = timezone.now()
    membership.save(update_fields=("status", "archived_at"))
    return membership


@dataclass(frozen=True, slots=True)
class CrewRosterEntry:
    membership_id: uuid.UUID
    display_name: str
    #: The last four digits only. The Partner supplied the number and already has it; the roster is
    #: read on a shared site phone, and an unmasked list is a contact export waiting to happen.
    phone_masked: str
    status: str
    is_supervisor: bool
    skill_codes: tuple[str, ...]
    documents_verified_at: datetime | None
    added_at: datetime


def masked_crew_phone(suffix: str) -> str:
    """`•••••• 4821`, or an all-mask string for a person registered before the suffix existed."""
    return f"•••••• {suffix}" if suffix else "••••••"


def crew_roster(partner: PartnerProfile) -> list[CrewRosterEntry]:
    """One Partner's roster, active first.

    Publishes no `crew_member_id`. Identity is global, and handing the global id to one agency would
    let two agencies compare rosters and work out that a worker is on both — which is a fact about a
    person that neither agency is entitled to learn from us.

    The phone is four digits behind a mask, and that is not a redaction of something we hold — it is
    all we hold. `CrewMember` stores an `identity_hash` and a suffix, never the number, so a dump of
    that table is not a contact list. Four digits are what let a Partner tell two people called
    Ramesh apart, which is the only job this field has.
    """
    memberships = (
        PartnerCrewMembership.objects.filter(partner=partner)
        .select_related("crew_member")
        .prefetch_related("skills__skill")
        .order_by("status", "-added_at")
    )
    return [
        CrewRosterEntry(
            membership_id=membership.id,
            display_name=membership.crew_member.display_name,
            phone_masked=masked_crew_phone(membership.crew_member.phone_suffix),
            status=membership.status,
            is_supervisor=membership.is_supervisor,
            skill_codes=tuple(sorted(link.skill.code for link in membership.skills.all())),
            documents_verified_at=membership.documents_verified_at,
            added_at=membership.added_at,
        )
        for membership in memberships
    ]


@transaction.atomic
def set_crew_availability(
    *,
    membership: PartnerCrewMembership,
    on_day: date,
    is_available: bool,
    reason: str = "",
) -> CrewAvailabilityException:
    """Record that one worker is, or is not, available on one day (`M2-BE-107`).

    Upsert rather than append: the Partner is stating today's truth about a date, and two
    contradictory rows for one date would leave `assert_crew_available` to pick one.
    """
    record, _created = CrewAvailabilityException.objects.update_or_create(
        membership=membership,
        date=on_day,
        defaults={"is_available": is_available, "reason": reason},
    )
    return record


def unavailable_crew_membership_ids(
    *,
    memberships: Iterable[PartnerCrewMembership],
    on_day: date,
) -> set[uuid.UUID]:
    """Which of these memberships have declared themselves off on a day."""
    ids = [membership.id for membership in memberships]
    if not ids:
        return set()
    return set(
        CrewAvailabilityException.objects.filter(
            membership_id__in=ids,
            date=on_day,
            is_available=False,
        ).values_list("membership_id", flat=True)
    )


def assert_crew_available(
    *,
    partner: PartnerProfile,
    memberships: Iterable[PartnerCrewMembership],
    on_day: date,
    busy_crew_member_ids: Iterable[uuid.UUID] = (),
) -> None:
    """Reject a same-day double-booking, including one made through another agency.

    `busy_crew_member_ids` is supplied by the engagement module, which owns
    assignments. Identity is global, so a person on two rosters is still one person.

    A declared day off is refused here too (`M2-BE-107`), and it reads as a conflict rather than a
    silent omission for the same reason every other exclusion in M2 is named: the supervisor
    assigning the shift needs to be told which person and why, not handed a shorter list.
    """
    busy = set(busy_crew_member_ids)
    memberships = list(memberships)
    off_today = unavailable_crew_membership_ids(memberships=memberships, on_day=on_day)
    for membership in memberships:
        if membership.partner_id != partner.id:
            raise CrewConflictError("That crew member is not on your roster.")
        if membership.status != PartnerCrewMembership.Status.ACTIVE:
            raise CrewConflictError(f"{membership.crew_member.display_name} is archived.")
        if membership.id in off_today:
            raise CrewConflictError(
                f"{membership.crew_member.display_name} is marked unavailable on "
                f"{on_day.isoformat()}.",
            )
        if membership.crew_member_id in busy:
            raise CrewConflictError(
                f"{membership.crew_member.display_name} is already booked on "
                f"{on_day.isoformat()}, including through another agency.",
            )
