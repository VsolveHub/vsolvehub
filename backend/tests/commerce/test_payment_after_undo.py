"""P0-5: a Customer must be able to pay after the first Partner undoes and a second accepts.

An undo releases the first Partner's reservation but leaves the row behind — reservations are
history, never deleted. Payment start and capture both counted *every* reservation on the group,
so one released row plus the second Partner's live hold read as "two holds for one unit" and
payment was refused with "Every Fulfilment Unit must have a live Partner hold".
"""

import pytest
from django.core.management import call_command
from freezegun import freeze_time
from rest_framework.test import APIClient

from apps.assignments.group_services import (
    accept_unit_offer,
    commit_unit_offer,
    decline_or_undo_unit_offer,
)
from apps.assignments.models import PartnerOffer, Reservation
from apps.carts.models import BookingGroup, CheckoutSession
from apps.commerce.models import Booking, Order
from tests.assignments.same_day_offers import FROZEN_NOW, online_partner, same_day_offer
from tests.commerce.test_payment_capture import _capture, _create_attempt

pytestmark = pytest.mark.django_db(transaction=True)


@freeze_time(FROZEN_NOW)
def test_customer_can_pay_after_an_undo_and_a_second_acceptance() -> None:
    call_command("seed_technician_catalog")
    first = online_partner(suffix="71", variant_slugs=("switch-socket-repair",))
    second = online_partner(suffix="72", variant_slugs=("switch-socket-repair",))
    offer = same_day_offer(phone="+919876543271", key="pay-after-undo")
    group = offer.fulfilment_unit.booking_group
    undoing_partner = offer.partner
    replacement = second if undoing_partner == first else first

    accept_unit_offer(offer_id=offer.id, partner=undoing_partner)
    successor = decline_or_undo_unit_offer(offer_id=offer.id, partner=undoing_partner, undo=True)
    assert successor is not None
    assert successor.partner == replacement
    accept_unit_offer(offer_id=successor.id, partner=replacement)
    commit_unit_offer(offer_id=successor.id, partner=replacement)

    group.refresh_from_db()
    assert group.status == BookingGroup.Status.PAYMENT_PENDING
    # The undone hold is still there, released — the shape that used to block payment.
    assert (
        Reservation.objects.filter(
            fulfilment_unit__booking_group=group, status=Reservation.Status.RELEASED
        ).count()
        == 1
    )
    checkout = CheckoutSession.objects.get(booking_group=group)
    client = APIClient()
    client.force_authenticate(group.customer)

    attempt = _create_attempt(client, checkout, key="pay-after-undo-payment")
    order = _capture(attempt, payment_id="fake_payment_after_undo")

    assert Order.objects.filter(booking_group=group).count() == 1
    booking = Booking.objects.get(order=order)
    assert booking.partner == replacement
    assert booking.reservation.status == Reservation.Status.CONFIRMED
    assert PartnerOffer.objects.get(id=successor.id).status == PartnerOffer.Status.COMMITTED
    group.refresh_from_db()
    assert group.status == BookingGroup.Status.BOOKED
