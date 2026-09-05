"""The arbiter `set_crew_gender`'s refusal message promised and nobody had built.

`CrewMember.gender` is one row per person across every agency, so the partner-facing rule is
first-write-wins and a contradiction is refused with `m2_crew_gender_conflict`. That rule is right.
Its message told the partner to *contact support* — and support had no endpoint, so a worker
recorded wrongly by whichever agency typed first lost gendered work permanently.

What is worth a test here is not the write. It is the three things that stop this becoming a
back door into a field the platform promises never to guess: a reason is required, blank is not a
gender, and the overwritten value is on the audit event.
"""

import pytest

from apps.foundation.models import OutboxEvent
from apps.identity.models import Role, User, UserRole
from apps.partners.capabilities import add_crew_to_roster
from apps.partners.models import CrewMember, PartnerCrewMembership, PartnerProfile
from apps.requirements.exceptions import RequirementTransitionError
from apps.requirements.operations import correct_crew_gender

pytestmark = pytest.mark.django_db


@pytest.fixture
def actor() -> User:
    user = User.objects.create_user(phone_number="+919900000010", full_name="Ops Reviewer")
    role, _ = Role.objects.get_or_create(
        code="operations", defaults={"name": "Operations", "is_system": True}
    )
    UserRole.objects.create(user=user, role=role)
    return user


def _membership(gender: str = "") -> PartnerCrewMembership:
    user = User.objects.create_user(phone_number="+919000000021", full_name="Agency Owner")
    partner = PartnerProfile.objects.create(user=user, display_name="Sharma Manpower")
    return add_crew_to_roster(
        partner=partner,
        display_name="Ramesh Kumar",
        phone_e164="+917030203002",
        gender=gender,
    ).membership


def test_operations_can_overwrite_what_another_agency_recorded(actor: User) -> None:
    membership = _membership(CrewMember.Gender.MAN)

    correct_crew_gender(
        membership_id=membership.id,
        actor=actor,
        gender=CrewMember.Gender.WOMAN,
        reason="Partner confirmed by phone; the first agency entered it wrongly.",
    )

    membership.crew_member.refresh_from_db()
    assert membership.crew_member.gender == CrewMember.Gender.WOMAN


def test_a_correction_records_what_it_overwrote(actor: User) -> None:
    """A dispute will be reopened, and an event that omits the old value cannot answer it."""
    membership = _membership(CrewMember.Gender.MAN)

    correct_crew_gender(
        membership_id=membership.id,
        actor=actor,
        gender=CrewMember.Gender.WOMAN,
        reason="Partner confirmed by phone.",
    )

    event = OutboxEvent.objects.filter(event_type="m2.crew.gender_corrected").latest("id")
    assert event.payload["previous_gender"] == CrewMember.Gender.MAN
    assert event.payload["gender"] == CrewMember.Gender.WOMAN
    assert event.payload["actor_id"] == str(actor.id)
    assert "Partner confirmed" in event.payload["reason"]


def test_a_correction_without_a_reason_is_refused(actor: User) -> None:
    membership = _membership(CrewMember.Gender.MAN)

    with pytest.raises(RequirementTransitionError):
        correct_crew_gender(
            membership_id=membership.id,
            actor=actor,
            gender=CrewMember.Gender.WOMAN,
            reason="  ",
        )

    membership.crew_member.refresh_from_db()
    assert membership.crew_member.gender == CrewMember.Gender.MAN


def test_a_recorded_gender_cannot_be_cleared(actor: User) -> None:
    """Clearing would silently re-open every gendered slot this worker had been filling."""
    membership = _membership(CrewMember.Gender.MAN)

    with pytest.raises(RequirementTransitionError):
        correct_crew_gender(
            membership_id=membership.id, actor=actor, gender="", reason="They asked us to."
        )

    membership.crew_member.refresh_from_db()
    assert membership.crew_member.gender == CrewMember.Gender.MAN


def test_correcting_to_the_value_already_on_file_writes_no_event(actor: User) -> None:
    """Idempotent, and quiet about it: an audit trail of no-ops is an audit trail nobody reads."""
    membership = _membership(CrewMember.Gender.MAN)

    correct_crew_gender(
        membership_id=membership.id,
        actor=actor,
        gender=CrewMember.Gender.MAN,
        reason="Confirming what is already recorded.",
    )

    assert not OutboxEvent.objects.filter(event_type="m2.crew.gender_corrected").exists()
