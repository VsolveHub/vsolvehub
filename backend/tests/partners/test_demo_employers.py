"""The demo seeds give every demo employer complete, honest employer details.

A business is owned by its poster, has no GSTIN and a Shop & Establishment proof (a made-up GSTIN
could belong to a real business); an individual is shown by a short name and area. Each is complete
by the same rule the apps use, and re-running the seeds changes nothing.
"""

from __future__ import annotations

import pytest
from django.core.management import call_command

from apps.listings.models import Listing
from apps.listings.selectors import employer_public_identity
from apps.partners.models import EmployerProfile, PartnerBusinessProfile, PartnerProfile
from apps.partners.selectors import employer_missing_fields

pytestmark = pytest.mark.django_db

APEX_PHONE = "+919900000088"
SRI_LAKSHMI_PHONE = "+919900000099"
PRIYA_PHONE = "+919900000022"


@pytest.fixture
def seeded(settings: pytest.FixtureRequest) -> None:
    settings.DEBUG = True  # type: ignore[attr-defined]
    call_command("seed_listing_catalog", verbosity=0)
    call_command("seed_jobs_demo", verbosity=0)


def _partner(phone: str) -> PartnerProfile:
    return PartnerProfile.objects.get(user__phone_number=phone)


@pytest.mark.usefixtures("seeded")
@pytest.mark.parametrize("phone", [APEX_PHONE, SRI_LAKSHMI_PHONE, PRIYA_PHONE])
def test_every_demo_employer_is_complete(phone: str) -> None:
    assert employer_missing_fields(_partner(phone)) == []


@pytest.mark.usefixtures("seeded")
@pytest.mark.parametrize("phone", [APEX_PHONE, SRI_LAKSHMI_PHONE])
def test_a_demo_business_is_owned_by_its_poster_with_no_invented_gstin(phone: str) -> None:
    partner = _partner(phone)
    business = partner.business_profile

    assert partner.employer_profile.hiring_as == EmployerProfile.HiringAs.BUSINESS
    assert partner.employer_profile.poster_role == EmployerProfile.PosterRole.OWNER
    assert business.gst_registered is False
    assert business.gstin == ""
    assert business.business_proof_type == PartnerBusinessProfile.BusinessProofType.SHOP_ESTABLISHMENT


@pytest.mark.usefixtures("seeded")
def test_the_individual_has_one_live_house_help_job_shown_by_short_name() -> None:
    partner = _partner(PRIYA_PHONE)

    jobs = Listing.objects.filter(poster=partner)
    assert [job.title for job in jobs] == ["House Help / Maid"]
    assert jobs[0].status == Listing.Status.PUBLISHED

    identity = employer_public_identity(partner)
    assert identity["name"] == "Priya S."
    assert identity["kind"] == "INDIVIDUAL"
    assert identity["locality"] == "Kondapur, Hyderabad"
    assert identity["is_verified"] is True


@pytest.mark.usefixtures("seeded")
def test_a_business_job_card_names_the_business_and_its_kind() -> None:
    identity = employer_public_identity(_partner(SRI_LAKSHMI_PHONE))

    assert identity["name"] == "Sri Lakshmi Jewellers"
    assert identity["kind"] == "BUSINESS"
    assert identity["industry_label"] == "Shop / retail"


def test_running_the_seeds_twice_changes_nothing(seeded: None) -> None:
    before = (
        EmployerProfile.objects.count(),
        PartnerBusinessProfile.objects.count(),
        Listing.objects.count(),
    )

    call_command("seed_jobs_demo", verbosity=0)

    assert before == (
        EmployerProfile.objects.count(),
        PartnerBusinessProfile.objects.count(),
        Listing.objects.count(),
    )
