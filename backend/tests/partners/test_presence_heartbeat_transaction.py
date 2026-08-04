"""The heartbeat has to hold a transaction, because it takes a row lock.

`_application_for_update` uses `select_for_update()`, which Django refuses in
autocommit mode. `go_online` and `go_offline` both open a transaction around it;
`heartbeat_presence` did not, so every heartbeat a real browser sent answered
500 — and the Partner who had just gone online went `stale` ninety seconds later
without ever being told why.

## Why the rest of the suite never noticed

`pytest.mark.django_db` runs each test inside a transaction, so `select_for_update`
is always legal there and the bug is invisible. `transaction=True` drops that
wrapper and runs the service the way a request does, which is the only way this
regression can be caught.
"""

from decimal import Decimal

import pytest
from django.core.management import call_command
from django.test import override_settings

from apps.identity.models import User
from apps.partners import services
from apps.partners.models import PartnerProfile, PartnerServiceArea

PHONE_NUMBER = "+919900000099"


@pytest.fixture
def seeded_partner(django_db_setup, django_db_blocker):  # type: ignore[no-untyped-def]
    """Seeds outside the per-test transaction, matching how the data really exists."""
    with django_db_blocker.unblock():
        call_command("seed_technician_catalog")
        with override_settings(DEBUG=True):
            call_command("seed_test_partner")
        yield PartnerProfile.objects.get(user__phone_number=PHONE_NUMBER)


@pytest.mark.django_db(transaction=True)
def test_heartbeat_runs_without_an_ambient_transaction(seeded_partner: PartnerProfile) -> None:
    user = User.objects.get(phone_number=PHONE_NUMBER)
    area_link = PartnerServiceArea.objects.filter(partner=seeded_partner, is_active=True).first()
    assert area_link is not None

    session = services.go_online(
        user=user,
        service_area_id=area_link.service_area_id,
        latitude=Decimal("17.440000"),
        longitude=Decimal("78.380000"),
        accuracy_m=45,
        consent_version=seeded_partner.consents.first().document_version,
    )

    # The liveness probe a reloaded page sends: session id only, no location.
    beaten = services.heartbeat_presence(user=user, session_id=session.id)

    assert beaten.id == session.id
    assert beaten.ended_at is None
