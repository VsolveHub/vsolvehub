"""Shared fixtures: drive a Booking Group all the way to a captured, booked Order."""

import itertools
from dataclasses import dataclass
from datetime import timedelta
from http import HTTPStatus

from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from apps.assignments.group_services import accept_unit_offer, reconcile_group_dispatch
from apps.assignments.models import PartnerOffer
from apps.carts.models import BookingGroup, CheckoutSession, FulfilmentUnit
from apps.commerce.models import Booking, Order, PaymentAttempt
from apps.commerce.providers import ProviderPayment
from apps.commerce.services import apply_provider_payment
from apps.identity.models import User
from apps.partners.models import PartnerProfile
from tests.carts.test_fulfilment_planning import _add_item, _address_payload, _partner, _plan

DEFAULT_SLUG = "switch-socket-repair"
_customer_sequence = itertools.count(1)
_partner_sequence = itertools.count(1)


def _unique_customer_context() -> tuple[APIClient, User, str, int]:
    call_command("seed_technician_catalog")
    suffix = next(_customer_sequence)
    customer = User.objects.create_user(phone_number=f"+9198100{suffix:05d}")
    client = APIClient()
    client.force_authenticate(customer)
    cart = client.get("/api/v1/cart/")
    assert cart.status_code == HTTPStatus.OK
    address = client.post("/api/v1/addresses/", _address_payload(), format="json")
    assert address.status_code == HTTPStatus.CREATED
    return client, customer, address.json()["id"], cart.json()["version"]


@dataclass(frozen=True, slots=True)
class BookedGroup:
    client: APIClient
    customer: User
    checkout: CheckoutSession
    group: BookingGroup
    order: Order

    @property
    def unit(self) -> FulfilmentUnit:
        return self.group.units.order_by("position").first()  # type: ignore[return-value]

    @property
    def booking(self) -> Booking:
        return self.unit.booking

    @property
    def partner(self) -> PartnerProfile:
        return self.booking.partner


def create_booked_group(
    *, slugs: tuple[str, ...] = (DEFAULT_SLUG,), key_prefix: str = "fulfilment"
) -> BookedGroup:
    client, customer, address_id, version = _unique_customer_context()
    cart_version = version
    for slug in slugs:
        cart = _add_item(client, slug=slug, cart_version=cart_version)
        cart_version = int(cart["version"])
        _partner(suffix=f"{next(_partner_sequence):04d}", variant_slugs=(slug,))
    plan = _plan(client, address_id=address_id, cart_version=cart_version)["plans"][0]
    quote_response = client.post(
        "/api/v1/plan-quotes/",
        {"plan_id": plan["id"]},
        format="json",
        HTTP_IDEMPOTENCY_KEY=f"{key_prefix}-quote",
    )
    assert quote_response.status_code == HTTPStatus.CREATED, quote_response.json()
    checkout_response = client.post(
        "/api/v1/checkouts/",
        {"quote_id": quote_response.json()["id"]},
        format="json",
        HTTP_IDEMPOTENCY_KEY=f"{key_prefix}-checkout",
    )
    assert checkout_response.status_code == HTTPStatus.CREATED, checkout_response.json()
    checkout = CheckoutSession.objects.get(id=checkout_response.json()["id"])
    group = BookingGroup.objects.get(id=checkout.booking_group_id)
    offers = list(
        PartnerOffer.objects.filter(fulfilment_unit__booking_group=group).select_related("partner")
    )
    for offer in offers:
        accepted = accept_unit_offer(offer_id=offer.id, partner=offer.partner)
        accepted.undo_deadline = timezone.now() - timedelta(seconds=1)
        accepted.save(update_fields=("undo_deadline",))
    reconcile_group_dispatch(group_id=group.id)
    checkout.refresh_from_db()

    response = client.post(
        "/api/v1/payment-attempts/",
        {
            "checkout_id": str(checkout.id),
            "expected_checkout_version": checkout.version,
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY=f"{key_prefix}-payment",
    )
    assert response.status_code == HTTPStatus.ACCEPTED, response.json()
    attempt = PaymentAttempt.objects.get(id=response.json()["id"])

    order = apply_provider_payment(
        provider_code="fake",
        payment=ProviderPayment(
            provider_payment_id=f"fake_payment_{key_prefix}",
            provider_order_id=attempt.provider_order_id,
            amount_paise=attempt.amount_paise,
            currency=attempt.currency,
            status="captured",
        ),
    )
    assert order is not None
    group.refresh_from_db()
    return BookedGroup(
        client=client, customer=customer, checkout=checkout, group=group, order=order
    )
