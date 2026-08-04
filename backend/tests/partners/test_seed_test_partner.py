"""The local test Partner fixture has to be a Partner who can actually work.

The command promises "eligible for every published job", and eligibility is not a
status field: `_assert_operational_eligibility` also demands the approved identity
documents a reviewer would have signed off, and going online records a consent
receipt. Setting `status = APPROVED` directly skips both — Django's own approval
transition refuses that combination — so the fixture used to produce a Partner the
domain considers approved and the presence endpoint refuses.

That gap is invisible until someone presses "Go online" and gets a 403.
"""

from decimal import Decimal

import pytest
from django.core.management import call_command
from django.test import override_settings

from apps.identity.models import User
from apps.partners import services
from apps.partners.models import PartnerProfile, PartnerServiceArea

pytestmark = pytest.mark.django_db

PHONE_NUMBER = "+919900000099"


def _seed() -> PartnerProfile:
    call_command("seed_technician_catalog")
    with override_settings(DEBUG=True):
        call_command("seed_test_partner")
    return PartnerProfile.objects.get(user__phone_number=PHONE_NUMBER)


def test_the_seeded_partner_passes_the_eligibility_gate_presence_applies() -> None:
    partner = _seed()

    application = partner.application
    assert application.status == "APPROVED"
    # The two checks `_assert_operational_eligibility` runs beyond the status.
    assert services._base_application_is_complete(application)
    assert services._latest_required_documents_are_approved(application)


def test_the_seeded_partner_can_go_online() -> None:
    """The end the fixture exists for: dispatch can actually reach this Partner."""
    partner = _seed()
    user = User.objects.get(phone_number=PHONE_NUMBER)
    area_link = PartnerServiceArea.objects.filter(partner=partner, is_active=True).first()
    assert area_link is not None

    session = services.go_online(
        user=user,
        service_area_id=area_link.service_area_id,
        latitude=Decimal("17.440000"),
        longitude=Decimal("78.380000"),
        accuracy_m=45,
        consent_version=partner.consents.first().document_version,
    )

    assert session.ended_at is None
    assert session.last_persisted_heartbeat_at is not None


def test_seeding_twice_leaves_one_approved_document_per_required_kind() -> None:
    """Re-running the fixture is routine; it must not stack duplicate documents."""
    _seed()
    with override_settings(DEBUG=True):
        call_command("seed_test_partner")

    partner = PartnerProfile.objects.get(user__phone_number=PHONE_NUMBER)
    kinds = [document.kind for document in partner.application.documents.all()]
    assert sorted(kinds) == sorted(set(kinds))
