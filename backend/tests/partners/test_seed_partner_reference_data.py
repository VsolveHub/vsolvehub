from io import StringIO

import pytest
from django.core.management import call_command

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


def test_seed_can_deactivate_unreferenced_skills(partner_setup: PartnerSetup) -> None:
    Skill.objects.create(code="legacy-skill", name="Legacy skill")

    call_command("seed_partner_reference_data", deactivate_missing=True)

    assert Skill.objects.get(pk=partner_setup.skill.pk).is_active is True
    assert Skill.objects.get(code="legacy-skill").is_active is False
