"""Recording a worker's gender, on a row several agencies share.

The rule worth a test is the one that is invisible when it breaks: `CrewMember` is one row per
person across every agency, so a second agency writing a different value would change which jobs
the *first* agency is eligible for, without them touching anything. First write wins; a
contradiction is refused.
"""

import pytest

from apps.partners.capabilities import set_crew_gender
from apps.partners.exceptions import CrewGenderConflictError
from apps.partners.models import CrewMember

pytestmark = pytest.mark.django_db


def _person(gender: str = "") -> CrewMember:
    return CrewMember.objects.create(
        identity_hash=f"hash-{gender or 'blank'}",
        display_name="Ramesh K.",
        phone_suffix="4821",
        gender=gender,
    )


def test_a_blank_row_accepts_what_an_agency_records() -> None:
    person = _person()

    set_crew_gender(crew_member=person, gender=CrewMember.Gender.WOMAN)

    person.refresh_from_db()
    assert person.gender == CrewMember.Gender.WOMAN


def test_recording_the_same_value_twice_is_a_no_op() -> None:
    """Two agencies agreeing is the ordinary case and must not be an error."""
    person = _person(CrewMember.Gender.MAN)

    set_crew_gender(crew_member=person, gender=CrewMember.Gender.MAN)

    person.refresh_from_db()
    assert person.gender == CrewMember.Gender.MAN


def test_a_second_agency_cannot_overwrite_the_first() -> None:
    person = _person(CrewMember.Gender.MAN)

    with pytest.raises(CrewGenderConflictError) as refusal:
        set_crew_gender(crew_member=person, gender=CrewMember.Gender.WOMAN)

    # The message names the person and what is on file, because "conflict" alone leaves a
    # supervisor with nothing to tell support.
    assert "Ramesh K." in refusal.value.message
    assert "man" in refusal.value.message.lower()
    person.refresh_from_db()
    assert person.gender == CrewMember.Gender.MAN


def test_omitting_a_gender_leaves_a_recorded_one_alone() -> None:
    """`update_crew_member` passes `""` when the caller sent no gender at all.

    That has to mean "unchanged" rather than "clear", or every skills edit would silently wipe the
    field and re-open gendered slots the worker had been filling.
    """
    person = _person(CrewMember.Gender.WOMAN)

    set_crew_gender(crew_member=person, gender="")

    person.refresh_from_db()
    assert person.gender == CrewMember.Gender.WOMAN


def test_a_sole_agency_may_correct_what_it_recorded() -> None:
    """The refusal protects other agencies. With none, it protected nobody and trapped a mistake.

    `allow_overwrite` is `update_crew_member` reporting that this Partner is the only one holding
    the worker -- established by counting active memberships, never by asking the client.
    """
    person = _person(CrewMember.Gender.MAN)

    set_crew_gender(crew_member=person, gender=CrewMember.Gender.WOMAN, allow_overwrite=True)

    person.refresh_from_db()
    assert person.gender == CrewMember.Gender.WOMAN


def test_a_sole_agency_still_cannot_clear_a_recorded_gender() -> None:
    """Clearing would re-open every gendered slot the worker had been filling, silently."""
    person = _person(CrewMember.Gender.WOMAN)

    set_crew_gender(crew_member=person, gender="", allow_overwrite=True)

    person.refresh_from_db()
    assert person.gender == CrewMember.Gender.WOMAN
