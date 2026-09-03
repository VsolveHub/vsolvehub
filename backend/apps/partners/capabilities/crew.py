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
from apps.partners.exceptions import CrewConflictError, CrewGenderConflictError
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
    gender: str = "",
) -> CrewRosterChange:
    """Add a worker to one roster, resolving them to a single global person."""
    identity = crew_identity_hash(phone_e164=phone_e164)
    crew_member, _ = CrewMember.objects.get_or_create(
        identity_hash=identity,
        defaults={
            "display_name": display_name,
            "phone_suffix": phone_e164[-4:],
            "gender": gender,
        },
    )
    # Not in `defaults`: a person another agency registered first already exists, and this is the
    # branch where a Partner is telling us something we did not know about them.
    set_crew_gender(crew_member=crew_member, gender=gender)
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


def set_crew_gender(
    *, crew_member: CrewMember, gender: str, allow_overwrite: bool = False
) -> CrewMember:
    """Record what a worker is, across every agency that has them.

    **The rule protects other agencies, and only bites when there are any.** `CrewMember` is one
    row per person, so this field is shared: a second agency writing a different value would change
    which jobs the *first* agency is eligible for without them touching anything. That is worth
    refusing. What is not worth refusing is an agency correcting a value for a worker **nobody else
    has** -- there, the row is theirs alone, the refusal protects no one, and it leaves a worker
    mis-recorded with no way back.

    So `allow_overwrite` is the caller saying "this agency is the only one holding this person",
    which `update_crew_member` establishes by counting active memberships. Without it the rule is
    unchanged: blank accepts, the same value is a no-op, and a contradiction is refused
    (`m2_crew_gender_conflict`) because one of the two agencies is wrong and only a person can say
    which. `operations.correct_crew_gender` is that person.

    Blank is still not a value. Clearing a recorded gender is not offered even to a sole agency: it
    would silently re-open every gendered slot the worker had been filling, and there is no honest
    screen for "I would like to un-know this". `UNDISCLOSED` is what a worker who declined is.
    """
    if not gender:
        return crew_member
    if crew_member.gender == gender:
        return crew_member
    if crew_member.gender and not allow_overwrite:
        raise CrewGenderConflictError(
            crew_member.display_name,
            CrewMember.Gender(crew_member.gender).label,
        )
    crew_member.gender = gender
    crew_member.save(update_fields=("gender", "updated_at"))
    return crew_member


def is_sole_agency_for(membership: PartnerCrewMembership) -> bool:
    """Whether this Partner is the only one with this worker on an active roster.

    Archived memberships do not count. An agency that took somebody off its roster has stopped
    being dispatched for them, so its copy of their gender decides nothing and cannot be broken by
    a correction here.

    **This answer is never published.** It changes what a write is allowed to do, and it is not put
    on the roster payload: "somebody else has this worker" is precisely the fact `crew_roster`
    suppresses `crew_member_id` to keep two agencies from learning about each other. The screen
    therefore offers the field to everyone and lets the server refuse the one case that matters --
    which discloses no more than today's refusal message already does, and only at the moment two
    agencies actually disagree.
    """
    return (
        PartnerCrewMembership.objects.filter(
            crew_member_id=membership.crew_member_id,
            status=PartnerCrewMembership.Status.ACTIVE,
        )
        .exclude(pk=membership.pk)
        .count()
        == 0
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
    gender: str = "",
    display_name: str | None = None,
) -> PartnerCrewMembership:
    """Skills, the supervisor flag, gender, and the name **this** agency uses.

    ## The name is a label, and it is now per-roster

    `CrewMember.display_name` is shared by every agency that resolved to the same number, so this
    used to be read-only with the reason stated. That was half right and the other half was a
    trap: a Partner who typed "Ramesh Kumr" had no way back. The escape hatch the screen offered
    -- archive and re-add -- could not work either, because `add_crew_to_roster` resolves by
    `identity_hash` and `get_or_create` ignores `defaults` on a hit, so the same wrong name came
    straight back.

    The fix is not to unlock the shared field. It is to notice that a name on a roster answers
    "what does *your* team call them", which is a per-membership question, while the global row
    keeps whatever the first agency registered. Writing here therefore cannot touch another
    agency's screen, and blank still means "track the global record".

    ## Gender is shared, and editable by whoever is the only one holding this worker

    A name is something an agency typed; gender is a fact about the person, on the global row on
    purpose, because a Customer's men/women split is checked against it at accept and again at
    assignment. It cannot become per-membership without letting two agencies staff the same wedding
    from two different answers.

    But "shared" is not the same as "frozen". The refusal exists to stop one agency flipping
    another's roster, so it is applied **only when there is another agency** --
    `is_sole_agency_for` decides, by counting active memberships. A Partner correcting a worker
    nobody else has is correcting their own record and is simply allowed to; a Partner
    contradicting a second agency is refused, and `operations.correct_crew_gender` is the arbiter,
    with a reason.

    The screen does not ask which case it is in. It offers the field to everybody and surfaces the
    refusal if it comes -- because publishing "somebody else has this worker" is exactly the fact
    `crew_roster` withholds `crew_member_id` to protect.
    """
    if is_supervisor is not None and membership.is_supervisor != is_supervisor:
        membership.is_supervisor = is_supervisor
        membership.save(update_fields=("is_supervisor",))

    if display_name is not None:
        # Trimmed, and blank is meaningful rather than rejected: clearing the override is how a
        # Partner says "just use whatever the record says", which is the state every row starts in.
        cleaned = display_name.strip()[:120]
        if cleaned != membership.display_name:
            membership.display_name = cleaned
            membership.save(update_fields=("display_name",))

    set_crew_gender(
        crew_member=membership.crew_member,
        gender=gender,
        allow_overwrite=is_sole_agency_for(membership),
    )

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
            f"{membership.roster_name} is booked on {days}. Replace them on those "
            "shifts before taking them off the roster.",
        )
    membership.status = PartnerCrewMembership.Status.ARCHIVED
    membership.archived_at = timezone.now()
    membership.save(update_fields=("status", "archived_at"))
    return membership


@dataclass(frozen=True, slots=True)
class CrewDocumentState:
    """Where one kind of identity document stands for one worker, as the Partner may see it.

    The reviewer's name is **not** here and neither is the object key. A Partner is entitled to
    know whether their worker is cleared and, on a rejection, why; who inside Operations pressed
    the button is not theirs, and a signed link to the stored file is issued to reviewers only.
    """

    kind: str
    status: str
    #: Set only on a rejection. Approvals need no reason and inventing one would be noise on a
    #: screen whose whole job is to show the Partner what still needs doing.
    reason: str
    updated_at: datetime


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
    #: `MAN` / `WOMAN` / `OTHER` / `UNDISCLOSED`, or blank when nobody has asked. Blank is the
    #: state that costs a Partner work: a Customer booking three women cannot be shown a roster
    #: this worker might be on, so the screen that renders this says so rather than leaving a gap.
    gender: str
    #: One entry per document kind that has ever reached a reviewer. Empty means nothing has been
    #: uploaded — which, until this shipped, was every membership in every environment, and is why
    #: the roster screen has to distinguish "waiting on Operations" from "waiting on you".
    documents: tuple[CrewDocumentState, ...] = ()


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
        .prefetch_related("skills__skill", "documents")
        .order_by("status", "-added_at")
    )
    return [
        CrewRosterEntry(
            membership_id=membership.id,
            display_name=membership.roster_name,
            phone_masked=masked_crew_phone(membership.crew_member.phone_suffix),
            status=membership.status,
            is_supervisor=membership.is_supervisor,
            skill_codes=tuple(sorted(link.skill.code for link in membership.skills.all())),
            documents_verified_at=membership.documents_verified_at,
            added_at=membership.added_at,
            gender=membership.crew_member.gender,
            documents=_document_states(membership),
        )
        for membership in memberships
    ]


def _document_states(membership: PartnerCrewMembership) -> tuple[CrewDocumentState, ...]:
    """The latest live version of each document kind, from an already-prefetched relation.

    Filtered and sorted in Python rather than by a second query per row: `crew_roster` is read on
    a roster screen that may hold thirty workers, and a queryset here would be thirty round trips
    to publish a badge.
    """
    from apps.partners.models import CrewDocument  # noqa: PLC0415 — avoids a models import cycle

    live = {
        CrewDocument.Status.PENDING,
        CrewDocument.Status.APPROVED,
        CrewDocument.Status.REJECTED,
    }
    latest: dict[str, CrewDocument] = {}
    for document in sorted(
        (item for item in membership.documents.all() if item.status in live),
        key=lambda item: item.version,
        reverse=True,
    ):
        latest.setdefault(document.kind, document)
    return tuple(
        CrewDocumentState(
            kind=document.kind,
            status=document.status,
            reason=(
                document.review_reason if document.status == CrewDocument.Status.REJECTED else ""
            ),
            updated_at=document.updated_at,
        )
        for _kind, document in sorted(latest.items())
    )


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
            raise CrewConflictError(f"{membership.roster_name} is archived.")
        if membership.id in off_today:
            raise CrewConflictError(
                f"{membership.roster_name} is marked unavailable on {on_day.isoformat()}.",
            )
        if membership.crew_member_id in busy:
            raise CrewConflictError(
                f"{membership.roster_name} is already booked on "
                f"{on_day.isoformat()}, including through another agency.",
            )
