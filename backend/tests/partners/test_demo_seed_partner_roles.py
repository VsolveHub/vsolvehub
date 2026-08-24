"""Every seeded Partner identity must also be able to enter the Partner app."""

import pytest
from django.core.management import call_command
from django.test import override_settings

from apps.foundation.management.commands.seed_console_demo_data import Command as ConsoleDemoCommand
from apps.identity.models import UserRole
from apps.partners.models import PartnerProfile

pytestmark = pytest.mark.django_db


def _has_partner_role(partner: PartnerProfile) -> bool:
    return UserRole.objects.filter(
        user=partner.user,
        role__code="partner",
        revoked_at__isnull=True,
    ).exists()


def test_console_demo_partner_has_an_active_partner_login_grant() -> None:
    call_command("seed_technician_catalog")

    partner = ConsoleDemoCommand()._demo_partner(slug="fan-installation", slot=(1, 8))

    assert partner.application.status == "APPROVED"
    assert _has_partner_role(partner)


def test_m1_density_profiles_have_active_partner_login_grants() -> None:
    call_command("seed_technician_catalog")

    with override_settings(DEBUG=True):
        call_command("seed_m1_density_fixtures")

    partners = PartnerProfile.objects.filter(display_name__startswith="M1 Fixture ")
    assert partners.exists()
    assert all(_has_partner_role(partner) for partner in partners)


def test_console_review_applicants_have_active_partner_login_grants() -> None:
    call_command("seed_technician_catalog")
    command = ConsoleDemoCommand()
    ops_primary, _ops_secondary = command._operators()

    command._seed_review_queue(ops_primary=ops_primary)

    applicants = PartnerProfile.objects.filter(display_name__startswith="Applicant ")
    assert set(applicants.values_list("display_name", flat=True)) == {
        "Applicant Awaiting Review",
        "Applicant Under Review",
        "Applicant Needing Changes",
    }
    assert all(_has_partner_role(partner) for partner in applicants)
