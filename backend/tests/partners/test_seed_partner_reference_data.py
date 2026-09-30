from io import StringIO

import pytest
from django.core.management import call_command

from apps.catalog.models import ServiceVariant
from apps.partners.models import Skill
from tests.partners.conftest import PartnerSetup

pytestmark = pytest.mark.django_db


def test_seed_partner_reference_data_is_deterministic(
    partner_setup: PartnerSetup,
) -> None:
    Skill.objects.filter(pk=partner_setup.skill.pk).delete()
    output = StringIO()

    call_command("seed_partner_reference_data", stdout=output)
    call_command("seed_partner_reference_data", stdout=output)

    skill = Skill.objects.get(code="electrician")
    assert skill.name == "Electrician"
    assert skill.is_active is True
    assert Skill.objects.count() == 1
    assert "1 active skills" in output.getvalue()


def test_seed_does_not_mint_a_skill_per_job_listing_role(
    partner_setup: PartnerSetup,
) -> None:
    """A10 roles share a subcategory name. Each used to become its own skill chip."""
    first = partner_setup.variant
    ServiceVariant.objects.create(
        service=first.service,
        code="job-role-b",
        name="Second role listing",
        pricing_strategy=ServiceVariant.PricingStrategy.FIXED,
        booking_archetype=ServiceVariant.BookingArchetype.A10_LISTING,
        required_skill_code="it-software-jobs-ai-engineers",
        tax_category_code="listing",
    )
    ServiceVariant.objects.create(
        service=first.service,
        code="job-role-c",
        name="Third role listing",
        pricing_strategy=ServiceVariant.PricingStrategy.FIXED,
        booking_archetype=ServiceVariant.BookingArchetype.A10_LISTING,
        required_skill_code="it-software-jobs-app-developers",
        tax_category_code="listing",
    )

    call_command("seed_partner_reference_data")

    assert not Skill.objects.filter(code__startswith="it-software-jobs-").exists()
    assert Skill.objects.filter(is_active=True).count() == 1
    assert Skill.objects.get(code="electrician").is_active is True


def test_seed_can_deactivate_unreferenced_skills(partner_setup: PartnerSetup) -> None:
    Skill.objects.create(code="legacy-skill", name="Legacy skill")

    call_command("seed_partner_reference_data", deactivate_missing=True)

    assert Skill.objects.get(pk=partner_setup.skill.pk).is_active is True
    assert Skill.objects.get(code="legacy-skill").is_active is False
