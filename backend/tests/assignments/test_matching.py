from datetime import timedelta
from http import HTTPStatus

import pytest
from django.core.management import call_command
from django.utils import timezone

from apps.assignments.models import PartnerOffer, Reservation
from apps.assignments.services import (
    accept_offer,
    advance_search,
    commit_offer,
    decline_or_undo_offer,
    start_partner_search,
)
from apps.carts.models import CheckoutSession
from apps.identity.models import User
from apps.partners.models import (
    PartnerApplication,
    PartnerAvailabilityRule,
    PartnerProfile,
    PartnerService,
    PartnerServiceArea,
)
from tests.carts.test_checkout import _customer_quote

pytestmark = pytest.mark.django_db


def _eligible_partner(*, checkout: CheckoutSession) -> PartnerProfile:
    user = User.objects.create_user(phone_number="+919876543211", full_name="Eligible Partner")
    partner = PartnerProfile.objects.create(user=user, display_name="Eligible Partner")
    PartnerApplication.objects.create(partner=partner, status=PartnerApplication.Status.APPROVED)
    PartnerService.objects.create(partner=partner, variant=checkout.quote.cart_item.variant)
    PartnerServiceArea.objects.create(partner=partner, service_area=checkout.quote.service_area)
    local_start = checkout.quote.requested_start.astimezone(timezone.get_current_timezone())
    PartnerAvailabilityRule.objects.create(
        partner=partner,
        service_area=checkout.quote.service_area,
        weekday=local_start.weekday(),
        starts_at=(local_start - timedelta(hours=1)).time(),
        ends_at=(local_start + timedelta(hours=2)).time(),
    )
    return partner


def _checkout() -> CheckoutSession:
    customer = User.objects.create_user(phone_number="+919876543210")
    client, quote_id = _customer_quote(customer=customer)
    response = client.post(
        "/api/v1/checkouts/",
        {"quote_id": quote_id},
        format="json",
        HTTP_IDEMPOTENCY_KEY="assignment-checkout",
    )
    assert response.status_code == HTTPStatus.CREATED
    return CheckoutSession.objects.get(id=response.json()["id"])


def test_offer_accept_undo_releases_reservation_and_retries_candidate() -> None:
    call_command("seed_technician_catalog")
    checkout = _checkout()
    partner = _eligible_partner(checkout=checkout)

    offer = start_partner_search(checkout=checkout)
    assert offer is not None
    accepted = accept_offer(offer_id=offer.id, partner=partner)
    assert accepted.status == PartnerOffer.Status.ACCEPTED_PENDING_UNDO
    assert accepted.reservation is not None
    next_offer = decline_or_undo_offer(offer_id=offer.id, partner=partner, undo=True)

    accepted.reservation.refresh_from_db()
    assert accepted.reservation.status == Reservation.Status.RELEASED
    assert next_offer is None


def test_commit_opens_payment_window_and_keeps_tentative_reservation() -> None:
    call_command("seed_technician_catalog")
    checkout = _checkout()
    partner = _eligible_partner(checkout=checkout)
    offer = start_partner_search(checkout=checkout)
    assert offer is not None
    accepted = accept_offer(offer_id=offer.id, partner=partner)
    committed = commit_offer(offer_id=accepted.id)

    checkout.refresh_from_db()
    reservation = committed.reservation
    assert reservation is not None
    reservation.refresh_from_db()
    assert committed.status == PartnerOffer.Status.COMMITTED
    assert checkout.status == CheckoutSession.Status.PARTNER_COMMITTED
    assert reservation.status == Reservation.Status.TENTATIVE
    assert checkout.expires_at == reservation.expires_at


def test_expired_offer_advances_to_honest_no_partner_result() -> None:
    call_command("seed_technician_catalog")
    checkout = _checkout()
    _eligible_partner(checkout=checkout)
    offer = start_partner_search(checkout=checkout)
    assert offer is not None
    offer.expires_at = timezone.now() - timedelta(seconds=1)
    offer.save(update_fields=("expires_at",))

    result = advance_search(checkout_id=checkout.id)

    offer.refresh_from_db()
    checkout.refresh_from_db()
    assert result is None
    assert offer.status == PartnerOffer.Status.EXPIRED
    assert checkout.status == CheckoutSession.Status.EXPIRED


def test_expired_payment_hold_releases_tentative_reservation() -> None:
    call_command("seed_technician_catalog")
    checkout = _checkout()
    partner = _eligible_partner(checkout=checkout)
    offer = start_partner_search(checkout=checkout)
    assert offer is not None
    committed = commit_offer(offer_id=accept_offer(offer_id=offer.id, partner=partner).id)
    reservation = committed.reservation
    assert reservation is not None
    reservation.expires_at = timezone.now() - timedelta(seconds=1)
    reservation.save(update_fields=("expires_at",))

    assert advance_search(checkout_id=checkout.id) is None

    reservation.refresh_from_db()
    checkout.refresh_from_db()
    assert reservation.status == Reservation.Status.RELEASED
    assert checkout.status == CheckoutSession.Status.EXPIRED
