"""Accepting an offer is final (owner decision, 5 November 2026; contract 1.96.0).

"Take this job" used to start a two-minute undo window, and "Commit now" only ended it early.
The Partner paid a second tap and the Customer waited out a grace period nobody used. Now the
accept commits in the same command; a Partner who cannot make it hands the job back from the
job screen instead.
"""

from http import HTTPStatus

import pytest
from django.core.management import call_command
from freezegun import freeze_time

from apps.assignments.group_services import (
    accept_unit_offer,
    commit_unit_offer,
    decline_or_undo_unit_offer,
    reconcile_group_dispatch,
)
from apps.assignments.models import PartnerOffer, Reservation
from apps.carts.models import BookingGroup
from tests.assignments.same_day_offers import FROZEN_NOW, online_partner, same_day_offer
from tests.assignments.test_group_dispatch import _partner_client

pytestmark = pytest.mark.django_db(transaction=True)


@freeze_time(FROZEN_NOW)
def test_accepting_an_offer_commits_it_and_opens_payment_at_once() -> None:
    call_command("seed_technician_catalog")
    partner = online_partner(suffix="361", variant_slugs=("switch-socket-repair",))
    offer = same_day_offer(phone="+919876500361", key="final-accept")
    group = offer.fulfilment_unit.booking_group

    accepted = accept_unit_offer(offer_id=offer.id, partner=partner)

    assert accepted.status == PartnerOffer.Status.COMMITTED
    group.refresh_from_db()
    assert group.status == BookingGroup.Status.PAYMENT_PENDING


@freeze_time(FROZEN_NOW)
def test_a_commit_after_accepting_answers_with_the_committed_offer() -> None:
    """An older app still sends "Commit now"; that is a no-op, not a refusal."""
    call_command("seed_technician_catalog")
    partner = online_partner(suffix="362", variant_slugs=("switch-socket-repair",))
    offer = same_day_offer(phone="+919876500362", key="final-commit")
    accept_unit_offer(offer_id=offer.id, partner=partner)

    assert commit_unit_offer(offer_id=offer.id, partner=partner).status == (
        PartnerOffer.Status.COMMITTED
    )
    assert commit_unit_offer(offer_id=offer.id).status == PartnerOffer.Status.COMMITTED


@freeze_time(FROZEN_NOW)
def test_an_accepted_offer_can_no_longer_be_undone() -> None:
    call_command("seed_technician_catalog")
    partner = online_partner(suffix="363", variant_slugs=("switch-socket-repair",))
    offer = same_day_offer(phone="+919876500363", key="final-undo")
    group = offer.fulfilment_unit.booking_group
    accept_unit_offer(offer_id=offer.id, partner=partner)

    with pytest.raises(ValueError, match="cannot be changed"):
        decline_or_undo_unit_offer(offer_id=offer.id, partner=partner, undo=True)

    reconcile_group_dispatch(group_id=group.id)
    offer.refresh_from_db()
    assert offer.status == PartnerOffer.Status.COMMITTED


@freeze_time(FROZEN_NOW)
def test_the_api_answers_accept_with_a_committed_offer_and_refuses_undo() -> None:
    call_command("seed_technician_catalog")
    partner = online_partner(suffix="364", variant_slugs=("switch-socket-repair",))
    offer = same_day_offer(phone="+919876500364", key="final-api")
    client = _partner_client(partner)

    accepted = client.post(
        f"/api/v1/partner/offers/{offer.id}/accept/", HTTP_IDEMPOTENCY_KEY="final-api-accept"
    )
    undone = client.post(
        f"/api/v1/partner/offers/{offer.id}/undo/", HTTP_IDEMPOTENCY_KEY="final-api-undo"
    )

    assert accepted.status_code == HTTPStatus.OK, accepted.json()
    assert accepted.json()["status"] == PartnerOffer.Status.COMMITTED
    assert undone.status_code == HTTPStatus.BAD_REQUEST
    assert undone.json()["error"]["code"] == "offer_invalid"
    reservation = Reservation.objects.get(fulfilment_unit=offer.fulfilment_unit)
    assert reservation.status == Reservation.Status.TENTATIVE
