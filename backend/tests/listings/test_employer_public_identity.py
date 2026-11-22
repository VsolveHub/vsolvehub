"""How a job card names its employer: a business by name, an individual by a short name only."""

import uuid
from decimal import Decimal

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.identity.models import User
from apps.listings.models import JobRoleTemplate
from apps.listings.selectors import employer_name, employer_public_identity
from apps.listings.services import job_options, post_job
from apps.partners.models import (
    EmployerProfile,
    PartnerApplication,
    PartnerBusinessProfile,
    PartnerProfile,
)
from tests.listings.jobs_helpers import _sales_job

pytestmark = pytest.mark.django_db

Hiring = EmployerProfile.HiringAs


def _partner(
    display_name: str,
    *,
    status: str = PartnerApplication.Status.APPROVED,
) -> PartnerProfile:
    user = User.objects.create_user(phone_number=f"+9198{uuid.uuid4().int % 10**8:08d}")
    partner = PartnerProfile.objects.create(user=user, display_name=display_name)
    PartnerApplication.objects.create(
        partner=partner, status=status, track=PartnerApplication.Track.EMPLOYER
    )
    return PartnerProfile.objects.get(pk=partner.pk)


def _business(display_name: str = "Asha Rao", **business: object) -> PartnerProfile:
    partner = _partner(display_name)
    EmployerProfile.objects.create(
        partner=partner,
        hiring_as=Hiring.BUSINESS,
        poster_role=EmployerProfile.PosterRole.OWNER,
    )
    values: dict[str, object] = {
        "business_type": PartnerBusinessProfile.BusinessType.EMPLOYER,
        "legal_name": "Sri Sai Mobiles Pvt Ltd",
        "business_category": "SHOP",
        "company_size": "SIZE_11_50",
        "area": "Kondapur",
        "city": "Hyderabad",
        "address": "12 Main Road, Kondapur",
        "pin_code": "500084",
        "latitude": Decimal("17.469000"),
        "longitude": Decimal("78.358000"),
    }
    values.update(business)
    PartnerBusinessProfile.objects.create(partner=partner, **values)
    return PartnerProfile.objects.get(pk=partner.pk)


def _individual(display_name: str = "Priya Sharma") -> PartnerProfile:
    partner = _partner(display_name)
    EmployerProfile.objects.create(
        partner=partner,
        hiring_as=Hiring.INDIVIDUAL,
        area="Kondapur",
        city="Hyderabad",
        pin_code="500084",
    )
    return PartnerProfile.objects.get(pk=partner.pk)


# --- the identity -----------------------------------------------------------------------------


def test_a_business_shows_its_trade_name_place_and_labels():
    poster = _business(trade_name="Sai Mobiles")

    identity = employer_public_identity(poster)

    assert identity == {
        "name": "Sai Mobiles",
        "kind": "BUSINESS",
        "locality": "Kondapur, Hyderabad",
        "is_verified": True,
        "logo_url": "",
        "industry_label": "Shop / retail",
        "size_label": "11-50",
    }


def test_a_business_without_a_trade_name_shows_its_legal_name():
    assert employer_public_identity(_business())["name"] == "Sri Sai Mobiles Pvt Ltd"


def test_a_business_never_shows_its_street_address_or_pin_code():
    identity = employer_public_identity(_business())

    assert "Main Road" not in str(identity)
    assert "500084" not in str(identity)


def test_an_individual_shows_a_short_name_and_where_they_are():
    identity = employer_public_identity(_individual("Priya Sharma"))

    assert identity["name"] == "Priya S."
    assert identity["kind"] == "INDIVIDUAL"
    assert identity["locality"] == "Kondapur, Hyderabad"
    assert identity["is_verified"] is True
    assert identity["industry_label"] == ""
    assert identity["size_label"] == ""
    assert "Sharma" not in str(identity)
    assert "500084" not in str(identity)


@pytest.mark.parametrize(
    ("full", "short"),
    [("Priya", "Priya"), ("Priya Kumari Sharma", "Priya S."), ("  priya   rao ", "priya R.")],
)
def test_an_individuals_name_is_first_name_and_last_initial(full, short):
    assert employer_public_identity(_individual(full))["name"] == short


def test_an_employer_from_before_this_work_shows_its_legal_name():
    partner = _partner("Ravi Kumar")
    PartnerBusinessProfile.objects.create(
        partner=partner,
        business_type=PartnerBusinessProfile.BusinessType.EMPLOYER,
        legal_name="Ravi Electricals",
        city="Warangal",
    )

    identity = employer_public_identity(PartnerProfile.objects.get(pk=partner.pk))

    assert identity["name"] == "Ravi Electricals"
    assert identity["kind"] == "BUSINESS"
    assert identity["locality"] == "Warangal"


def test_someone_with_neither_shows_their_display_name():
    identity = employer_public_identity(_partner("Ravi Kumar"))

    assert identity["name"] == "Ravi Kumar"
    assert identity["kind"] == ""
    assert identity["locality"] == ""


def test_only_an_approved_employer_is_verified():
    poster = _partner("Ravi Kumar", status=PartnerApplication.Status.SUSPENDED)

    assert employer_public_identity(poster)["is_verified"] is False


def test_employer_name_is_the_public_name():
    assert employer_name(_individual("Priya Sharma")) == "Priya S."
    assert employer_name(_business(trade_name="Sai Mobiles")) == "Sai Mobiles"


# --- what candidates are told -----------------------------------------------------------------


def test_a_job_by_an_individual_never_carries_their_full_name(jobs_variant):  # noqa: ARG001
    poster = _individual("Priya Sharma")
    template = JobRoleTemplate.objects.get(category="Home & Personal", name="House Help / Maid")

    job = post_job(
        poster=poster,
        actor=poster.user,
        data=_sales_job(
            role_template_id=template.id,
            title="House Help / Maid",
            job_type="FULL_TIME",
            required_skills=["Cleaning"],
            preferred_skills=[],
            responsibilities=["Clean the house"],
            benefits=[],
            salary_min_paise=1000000,
            salary_max_paise=1500000,
        ),
    )

    assert job.job_category == "Home & Personal"
    assert "Priya S. is hiring" in job.description
    assert "Sharma" not in job.description


# --- the household templates ------------------------------------------------------------------


def test_the_household_templates_are_offered_to_every_employer(jobs_variant):  # noqa: ARG001
    category = next(
        category
        for category in job_options()["categories"]
        if category["name"] == "Home & Personal"
    )

    assert [role["name"] for role in category["roles"]] == [
        "House Help / Maid",
        "Home Cook",
        "Personal / Family Driver",
        "Elderly Caretaker",
        "Babysitter / Nanny",
        "Patient Attendant (at home)",
        "Home Tutor",
        "Gardener",
        "Watchman (home)",
    ]
    maid = category["roles"][0]
    assert maid["skills"] == ["Cleaning", "Washing utensils", "Laundry"]
    assert (maid["salary_min_rupees"], maid["salary_max_rupees"]) == (8000, 15000)


def test_the_options_endpoint_returns_the_household_category(client):
    response = client.get("/api/v1/jobs/options")

    assert response.status_code == 200
    assert "Home & Personal" in {category["name"] for category in response.data["categories"]}


# --- the public list --------------------------------------------------------------------------


def _live_job(poster: PartnerProfile) -> None:
    post_job(poster=poster, actor=poster.user, data=_sales_job())


def test_the_public_list_carries_the_employer_object(client, jobs_variant):  # noqa: ARG001
    business = _business(trade_name="Sai Mobiles")
    individual = _individual("Priya Sharma")
    _live_job(business)
    _live_job(individual)

    rows = {row["employer"]["kind"]: row for row in client.get("/api/v1/listings").data}

    assert rows["BUSINESS"]["poster_name"] == "Sai Mobiles"
    assert rows["BUSINESS"]["employer"]["is_verified"] is True
    assert rows["INDIVIDUAL"]["poster_name"] == "Priya S."
    assert rows["INDIVIDUAL"]["employer"]["name"] == "Priya S."
    assert "Sharma" not in str(rows["INDIVIDUAL"])


def test_more_employers_cost_no_more_queries(client, jobs_variant):  # noqa: ARG001
    _live_job(_business(trade_name="Sai Mobiles"))
    with CaptureQueriesContext(connection) as one:
        client.get("/api/v1/listings")

    for _ in range(3):
        _live_job(_individual())
        _live_job(_business())
    with CaptureQueriesContext(connection) as many:
        client.get("/api/v1/listings")

    assert len(many) <= len(one)
