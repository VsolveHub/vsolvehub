"""BE-4: the offer list must not show a Partner work the accept endpoint would refuse.

`accept_unit_offer` checks `expires_at` itself, independently of the stored status.
The sweep (`reconcile_group_dispatch`) is what actually moves a lapsed offer to
`EXPIRED`, and it runs periodically — so between the deadline and the sweep the row
is still stored as `OFFERED`. A list built on the status column alone renders that
row as live, and a Partner who taps it is told the offer is gone.

These tests pin the read side agreeing with the write side, and pin that the filter
did not become an over-filter that hides live work.
"""

from datetime import timedelta
from http import HTTPStatus

import pytest
from django.core.management import call_command
from freezegun import freeze_time

from apps.assignments.models import PartnerOffer
from tests.assignments.same_day_offers import FROZEN_NOW, online_partner, same_day_offer
from tests.assignments.test_group_dispatch import _partner_client

pytestmark = pytest.mark.django_db(transaction=True)

CUSTOMER = "+919876543210"


@freeze_time(FROZEN_NOW)
def test_lapsed_offer_is_hidden_before_the_sweep_reaches_it() -> None:
    call_command("seed_technician_catalog")
    partner = online_partner(suffix="61", variant_slugs=("switch-socket-repair",))
    offer = same_day_offer(phone=CUSTOMER, key="list-expiry-lapsed")
    client = _partner_client(partner)
    # Deliberately not via the sweep: this is the window the sweep has not run in.
    PartnerOffer.objects.filter(id=offer.id).update(expires_at=FROZEN_NOW - timedelta(seconds=1))

    response = client.get("/api/v1/partner/offers/")

    assert response.status_code == HTTPStatus.OK
    assert response.json()["results"] == []
    # The row is untouched — hiding it is a read-side concern, and the sweep is
    # still the only thing that expires the offer and frees its reservation.
    assert PartnerOffer.objects.get(id=offer.id).status == PartnerOffer.Status.OFFERED


@freeze_time(FROZEN_NOW)
def test_live_offer_still_appears() -> None:
    """Regression guard: the new exclusion must not swallow acceptable work."""

    call_command("seed_technician_catalog")
    partner = online_partner(suffix="62", variant_slugs=("switch-socket-repair",))
    offer = same_day_offer(phone=CUSTOMER, key="list-expiry-live")
    client = _partner_client(partner)
    PartnerOffer.objects.filter(id=offer.id).update(expires_at=FROZEN_NOW + timedelta(minutes=5))

    response = client.get("/api/v1/partner/offers/")

    assert response.status_code == HTTPStatus.OK
    assert [row["id"] for row in response.json()["results"]] == [str(offer.id)]


@freeze_time(FROZEN_NOW)
def test_accepted_offer_past_its_offer_deadline_still_appears() -> None:
    """The filter is scoped to `OFFERED` on purpose.

    An `ACCEPTED_PENDING_UNDO` offer is past the 45-second offer clock by definition
    — its live deadline is `undo_deadline`, not `expires_at`. Excluding on
    `expires_at` regardless of status would erase a Partner's own accepted job from
    their inbox during the undo window.
    """

    call_command("seed_technician_catalog")
    partner = online_partner(suffix="63", variant_slugs=("switch-socket-repair",))
    offer = same_day_offer(phone=CUSTOMER, key="list-expiry-accepted")
    client = _partner_client(partner)
    PartnerOffer.objects.filter(id=offer.id).update(
        status=PartnerOffer.Status.ACCEPTED_PENDING_UNDO,
        expires_at=FROZEN_NOW - timedelta(seconds=1),
        undo_deadline=FROZEN_NOW + timedelta(minutes=2),
    )

    response = client.get("/api/v1/partner/offers/")

    assert response.status_code == HTTPStatus.OK
    assert [row["id"] for row in response.json()["results"]] == [str(offer.id)]
