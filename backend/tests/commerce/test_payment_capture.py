import pytest
from django.core.management import call_command

from apps.assignments.services import accept_offer, commit_offer, start_partner_search
from apps.commerce.models import Booking, Order, PaymentAttempt, TaxDocument
from apps.commerce.services import create_payment_attempt, record_verified_webhook
from tests.assignments.test_matching import _checkout, _eligible_partner

pytestmark = pytest.mark.django_db


def test_captured_webhook_converts_once_to_order_booking_and_invoice() -> None:
    call_command("seed_technician_catalog")
    checkout = _checkout()
    partner = _eligible_partner(checkout=checkout)
    offer = start_partner_search(checkout=checkout)
    assert offer is not None
    commit_offer(offer_id=accept_offer(offer_id=offer.id, partner=partner).id)
    attempt = create_payment_attempt(checkout_id=checkout.id)

    payload: dict[str, object] = {
        "provider_order_id": attempt.provider_order_id,
        "provider_payment_id": "fake_payment_1",
    }
    first = record_verified_webhook(
        provider="fake", event_id="event-1", event_type="payment.captured", payload=payload
    )
    replay = record_verified_webhook(
        provider="fake", event_id="event-1", event_type="payment.captured", payload=payload
    )

    assert first is not None
    assert replay is None
    assert Order.objects.count() == 1
    assert Booking.objects.count() == 1
    assert TaxDocument.objects.count() == 1
    assert PaymentAttempt.objects.get(id=attempt.id).status == PaymentAttempt.Status.CAPTURED
