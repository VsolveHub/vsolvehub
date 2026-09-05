"""The name on a roster, and why it is per-agency.

`CrewMember.display_name` is shared by every agency that resolved to the same number, so it was
published read-only — correct as far as it went, and it left a typo permanently unfixable. The
advice the screen gave instead cannot work, and the first test here is that fact: re-adding
resolves by `identity_hash` and `get_or_create` ignores `defaults` on a hit, so archiving and
adding "the correct person" returns the same wrong name.

`PartnerCrewMembership.display_name` is the fix. Blank tracks the global record; set, it is what
this agency calls them, and it reaches every screen that names a worker.
"""

import pytest

from apps.identity.models import User
from apps.partners.capabilities import (
    add_crew_to_roster,
    archive_crew_member,
    crew_roster,
    update_crew_member,
)
from apps.partners.exceptions import CrewGenderConflictError
from apps.partners.models import CrewMember, PartnerProfile

pytestmark = pytest.mark.django_db

PHONE = "+917030203002"


def _partner(phone: str, name: str) -> PartnerProfile:
    user = User.objects.create_user(phone_number=phone, full_name=name)
    return PartnerProfile.objects.create(user=user, display_name=name)


def test_re_adding_the_same_number_does_not_correct_the_name() -> None:
    """The behaviour the old screen's advice depended on, and did not have."""
    partner = _partner("+919000000001", "Sharma Manpower")
    first = add_crew_to_roster(
        partner=partner, display_name="Ramesh Kumr", phone_e164=PHONE
    ).membership

    again = add_crew_to_roster(
        partner=partner, display_name="Ramesh Kumar", phone_e164=PHONE
    ).membership

    assert again.id == first.id
    again.crew_member.refresh_from_db()
    assert again.crew_member.display_name == "Ramesh Kumr"


def test_the_roster_label_is_what_the_roster_publishes() -> None:
    partner = _partner("+919000000002", "Sharma Manpower")
    membership = add_crew_to_roster(
        partner=partner, display_name="Ramesh Kumr", phone_e164=PHONE
    ).membership

    update_crew_member(membership=membership, display_name="Ramesh Kumar")

    assert [entry.display_name for entry in crew_roster(partner)] == ["Ramesh Kumar"]


def test_one_agency_renaming_a_worker_does_not_touch_another_agency() -> None:
    """The whole reason the global field stays read-only."""
    sharma = _partner("+919000000003", "Sharma Manpower")
    gupta = _partner("+919000000004", "Gupta Events")
    theirs = add_crew_to_roster(
        partner=sharma, display_name="Ramesh Kumr", phone_e164=PHONE
    ).membership
    add_crew_to_roster(partner=gupta, display_name="Ramesh Kumr", phone_e164=PHONE)

    update_crew_member(membership=theirs, display_name="Ramesh Kumar")

    assert [entry.display_name for entry in crew_roster(sharma)] == ["Ramesh Kumar"]
    assert [entry.display_name for entry in crew_roster(gupta)] == ["Ramesh Kumr"]


def test_clearing_the_label_falls_back_to_the_shared_record() -> None:
    partner = _partner("+919000000005", "Sharma Manpower")
    membership = add_crew_to_roster(
        partner=partner, display_name="Ramesh Kumr", phone_e164=PHONE
    ).membership
    update_crew_member(membership=membership, display_name="Something Else")

    update_crew_member(membership=membership, display_name="")

    assert [entry.display_name for entry in crew_roster(partner)] == ["Ramesh Kumr"]


def test_omitting_the_name_leaves_an_existing_label_alone() -> None:
    """A PATCH that only changes the supervisor flag must not silently clear the name."""
    partner = _partner("+919000000006", "Sharma Manpower")
    membership = add_crew_to_roster(
        partner=partner, display_name="Ramesh Kumr", phone_e164=PHONE
    ).membership
    update_crew_member(membership=membership, display_name="Ramesh Kumar")

    update_crew_member(membership=membership, is_supervisor=True)

    assert [entry.display_name for entry in crew_roster(partner)] == ["Ramesh Kumar"]


def test_the_only_agency_holding_a_worker_may_correct_their_gender() -> None:
    """The ordinary case, and the one the first-write-wins lock used to refuse for no benefit."""
    partner = _partner("+919000000007", "Sharma Manpower")
    membership = add_crew_to_roster(
        partner=partner,
        display_name="Ramesh Kumar",
        phone_e164=PHONE,
        gender=CrewMember.Gender.MAN,
    ).membership

    update_crew_member(membership=membership, gender=CrewMember.Gender.WOMAN)

    membership.crew_member.refresh_from_db()
    assert membership.crew_member.gender == CrewMember.Gender.WOMAN


def test_a_second_agency_is_still_refused() -> None:
    """As soon as somebody else is dispatched against this value, one agency cannot flip it."""
    sharma = _partner("+919000000008", "Sharma Manpower")
    gupta = _partner("+919000000009", "Gupta Events")
    theirs = add_crew_to_roster(
        partner=sharma,
        display_name="Ramesh Kumar",
        phone_e164=PHONE,
        gender=CrewMember.Gender.MAN,
    ).membership
    add_crew_to_roster(partner=gupta, display_name="Ramesh Kumar", phone_e164=PHONE)

    with pytest.raises(CrewGenderConflictError):
        update_crew_member(membership=theirs, gender=CrewMember.Gender.WOMAN)

    theirs.crew_member.refresh_from_db()
    assert theirs.crew_member.gender == CrewMember.Gender.MAN


def test_an_agency_that_archived_the_worker_no_longer_blocks_a_correction() -> None:
    """An archived membership is dispatched for nothing, so its copy decides nothing."""
    sharma = _partner("+919000000010", "Sharma Manpower")
    gupta = _partner("+919000000011", "Gupta Events")
    theirs = add_crew_to_roster(
        partner=sharma,
        display_name="Ramesh Kumar",
        phone_e164=PHONE,
        gender=CrewMember.Gender.MAN,
    ).membership
    gone = add_crew_to_roster(
        partner=gupta, display_name="Ramesh Kumar", phone_e164=PHONE
    ).membership
    archive_crew_member(membership=gone)

    update_crew_member(membership=theirs, gender=CrewMember.Gender.WOMAN)

    theirs.crew_member.refresh_from_db()
    assert theirs.crew_member.gender == CrewMember.Gender.WOMAN
