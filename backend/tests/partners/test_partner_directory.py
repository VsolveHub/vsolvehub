"""The Operations Partner directory.

A directory, not a review queue. The distinction is the point of these tests: the queue answers
"what should I decide next" and hides everything already decided; this answers "who works for
us" and must not.
"""

from http import HTTPStatus

import pytest
from rest_framework.test import APIClient

from apps.identity.models import User
from apps.partners.models import (
    PartnerApplication,
    PartnerBusinessProfile,
    PartnerProfile,
    PartnerService,
    PartnerServiceArea,
    PartnerSkill,
    Skill,
)
from tests.helpers import force_role_client
from tests.partners.conftest import PartnerSetup

pytestmark = pytest.mark.django_db

DIRECTORY_URL = "/api/v1/operations/partners/"


def _partner(
    *,
    phone: str,
    name: str,
    status: str,
    skills: tuple[Skill, ...] = (),
) -> PartnerProfile:
    user = User.objects.create_user(phone_number=phone, full_name=name)
    partner = PartnerProfile.objects.create(user=user, display_name=name, experience_years=4)
    PartnerApplication.objects.create(partner=partner, status=status)
    for skill in skills:
        PartnerSkill.objects.create(partner=partner, skill=skill)
    return partner


def _ops_client(operations_user: User) -> APIClient:
    return force_role_client(user=operations_user, role_code="operations")


def test_a_customer_cannot_read_the_partner_directory(partner_setup: PartnerSetup) -> None:
    del partner_setup
    customer = User.objects.create_user(phone_number="+919000000123")
    client = APIClient()
    client.force_authenticate(customer)

    assert client.get(DIRECTORY_URL).status_code == HTTPStatus.FORBIDDEN


def test_the_directory_lists_partners_the_review_queue_hides(
    partner_setup: PartnerSetup, operations_user: User
) -> None:
    """The whole reason this is a second surface.

    `operations_partner_application_queue` defaults to the three in-review statuses, so an
    approved Partner is invisible there. A management screen built on it could never list the
    people who actually work here.
    """

    _partner(
        phone="+919000000201",
        name="Approved Anita",
        status=PartnerApplication.Status.APPROVED,
        skills=(partner_setup.skill,),
    )
    _partner(
        phone="+919000000202",
        name="Submitted Sunil",
        status=PartnerApplication.Status.SUBMITTED,
    )
    client = _ops_client(operations_user)

    directory = client.get(DIRECTORY_URL).json()["results"]
    queue = client.get("/api/v1/operations/partner-applications/").json()["results"]

    assert [row["display_name"] for row in directory] == ["Approved Anita", "Submitted Sunil"]
    assert [row["display_name"] for row in queue] == ["Submitted Sunil"]


def test_status_filter_accepts_statuses_the_review_queue_refuses(
    partner_setup: PartnerSetup, operations_user: User
) -> None:
    del partner_setup
    _partner(
        phone="+919000000203",
        name="Offboarded Omar",
        status=PartnerApplication.Status.OFFBOARDED,
    )
    _partner(
        phone="+919000000204",
        name="Approved Anita",
        status=PartnerApplication.Status.APPROVED,
    )
    client = _ops_client(operations_user)

    response = client.get(f"{DIRECTORY_URL}?status=OFFBOARDED")

    assert response.status_code == HTTPStatus.OK
    assert [row["display_name"] for row in response.json()["results"]] == ["Offboarded Omar"]
    # The review queue refuses this status outright, which is correct for a worklist.
    assert (
        client.get("/api/v1/operations/partner-applications/?status=OFFBOARDED").status_code
        == HTTPStatus.BAD_REQUEST
    )


def test_repeated_skill_parameters_are_all_applied(
    partner_setup: PartnerSetup, operations_user: User
) -> None:
    """`?skill=a&skill=b` must filter on both.

    A plain serializer read sees only the last value of a repeated query parameter, which would
    silently narrow the filter to `b` and quietly hide half the directory.
    """

    plumbing = Skill.objects.create(code="plumber", name="Plumber")
    carpentry = Skill.objects.create(code="carpenter", name="Carpenter")
    _partner(
        phone="+919000000205",
        name="Electrical Esha",
        status=PartnerApplication.Status.APPROVED,
        skills=(partner_setup.skill,),
    )
    _partner(
        phone="+919000000206",
        name="Plumbing Pooja",
        status=PartnerApplication.Status.APPROVED,
        skills=(plumbing,),
    )
    _partner(
        phone="+919000000207",
        name="Carpenter Karan",
        status=PartnerApplication.Status.APPROVED,
        skills=(carpentry,),
    )
    client = _ops_client(operations_user)

    response = client.get(f"{DIRECTORY_URL}?skill=electrician&skill=plumber")

    assert [row["display_name"] for row in response.json()["results"]] == [
        "Electrical Esha",
        "Plumbing Pooja",
    ]


def test_a_partner_holding_several_filtered_skills_is_listed_once(
    partner_setup: PartnerSetup, operations_user: User
) -> None:
    """Without `distinct`, the skill join lists the same person once per matching skill."""

    plumbing = Skill.objects.create(code="plumber", name="Plumber")
    _partner(
        phone="+919000000208",
        name="Multiskilled Meera",
        status=PartnerApplication.Status.APPROVED,
        skills=(partner_setup.skill, plumbing),
    )
    client = _ops_client(operations_user)

    results = client.get(f"{DIRECTORY_URL}?skill=electrician&skill=plumber").json()["results"]

    assert len(results) == 1
    assert results[0]["display_name"] == "Multiskilled Meera"


def test_a_row_carries_the_counts_and_chips_the_screen_renders(
    partner_setup: PartnerSetup, operations_user: User
) -> None:
    partner = _partner(
        phone="+919000000209",
        name="Approved Anita",
        status=PartnerApplication.Status.APPROVED,
        skills=(partner_setup.skill,),
    )
    PartnerService.objects.create(partner=partner, variant=partner_setup.variant)
    PartnerServiceArea.objects.create(partner=partner, service_area=partner_setup.service_area)
    client = _ops_client(operations_user)

    row = client.get(DIRECTORY_URL).json()["results"][0]

    assert row["application_status"] == PartnerApplication.Status.APPROVED
    assert row["skills"] == [{"code": "electrician", "name": "Electrician"}]
    assert row["service_count"] == 1
    assert row["service_area_count"] == 1


def test_the_detail_names_the_partner_but_never_a_document_url(
    partner_setup: PartnerSetup, operations_user: User
) -> None:
    """Documents are listed by kind and verdict only.

    Revealing one goes through the audited access endpoint, which mints a short-lived link and
    records who looked. A management screen publishing a URL would route around that entirely.
    """

    partner = _partner(
        phone="+919000000210",
        name="Approved Anita",
        status=PartnerApplication.Status.APPROVED,
        skills=(partner_setup.skill,),
    )
    client = _ops_client(operations_user)

    body = client.get(f"{DIRECTORY_URL}{partner.id}/").json()

    assert body["display_name"] == "Approved Anita"
    assert body["application_status"] == PartnerApplication.Status.APPROVED
    assert body["skills"] == [{"code": "electrician", "name": "Electrician"}]
    serialised = str(body)
    assert "storage.test" not in serialised
    assert "object_key" not in serialised
    assert "document_url" not in serialised


def test_a_reviewer_cannot_open_their_own_partner_record(operations_user: User) -> None:
    """The same self-review guard the application detail carries, for the same reason."""

    partner = PartnerProfile.objects.create(user=operations_user, display_name="Self")
    PartnerApplication.objects.create(partner=partner, status=PartnerApplication.Status.APPROVED)
    client = _ops_client(operations_user)

    response = client.get(f"{DIRECTORY_URL}{partner.id}/")

    assert response.status_code == HTTPStatus.FORBIDDEN


def test_an_unknown_partner_is_a_404_not_an_empty_record(operations_user: User) -> None:
    client = _ops_client(operations_user)

    response = client.get(f"{DIRECTORY_URL}00000000-0000-0000-0000-000000000000/")

    assert response.status_code == HTTPStatus.NOT_FOUND


def test_the_detail_carries_the_business_profile_for_tax_verification(
    partner_setup: PartnerSetup, operations_user: User
) -> None:
    """Operations reads the GSTIN it is about to verify; `null` when there is none."""
    without = _partner(
        phone="+919000000230",
        name="Solo Suresh",
        status=PartnerApplication.Status.APPROVED,
        skills=(partner_setup.skill,),
    )
    with_profile = _partner(
        phone="+919000000231",
        name="Agency Asha",
        status=PartnerApplication.Status.APPROVED,
        skills=(partner_setup.skill,),
    )
    PartnerBusinessProfile.objects.create(
        partner=with_profile,
        business_type=PartnerBusinessProfile.BusinessType.WORKFORCE_AGENCY,
        legal_name="Asha Staffing Pvt Ltd",
        gst_registered=True,
        gstin="36ABCDE1234F1Z5",
    )
    client = _ops_client(operations_user)

    assert client.get(f"{DIRECTORY_URL}{without.id}/").json()["business_profile"] is None
    profile = client.get(f"{DIRECTORY_URL}{with_profile.id}/").json()["business_profile"]
    assert profile["legal_name"] == "Asha Staffing Pvt Ltd"
    assert profile["gstin"] == "36ABCDE1234F1Z5"
    assert profile["gstin_verified_at"] is None
