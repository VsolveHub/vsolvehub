from datetime import timedelta
from http import HTTPStatus

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.assignments.group_services import accept_unit_offer, reconcile_group_dispatch
from apps.assignments.models import PartnerOffer, Reservation
from apps.assignments.serializers import OfferSerializer
from apps.carts.models import BookingGroup, FulfilmentUnit
from apps.foundation.models import OutboxEvent
from apps.identity.models import User
from apps.partners.models import PartnerService
from tests.carts.test_fulfilment_planning import (
    _add_item,
    _customer_context,
    _partner,
    _plan,
)

pytestmark = pytest.mark.django_db(transaction=True)
EXPECTED_SERVICE_LINES = 2
EXPECTED_PARALLEL_UNITS = 2


def _quote(client: APIClient, plan_id: str, *, key: str) -> dict[str, object]:
    response = client.post(
        "/api/v1/plan-quotes/",
        {"plan_id": plan_id},
        format="json",
        HTTP_IDEMPOTENCY_KEY=key,
    )
    assert response.status_code == HTTPStatus.CREATED
    return response.json()


def _checkout(client: APIClient, quote_id: str, *, key: str) -> dict[str, object]:
    response = client.post(
        "/api/v1/checkouts/",
        {"quote_id": quote_id},
        format="json",
        HTTP_IDEMPOTENCY_KEY=key,
    )
    assert response.status_code == HTTPStatus.CREATED, response.json()
    return response.json()


def test_group_dispatch_offer_is_unit_scoped_and_customer_projection_is_safe() -> None:
    client, _customer, address_id, version = _customer_context()
    first = _add_item(client, slug="switch-socket-repair", cart_version=version)
    second = _add_item(client, slug="fan-installation", cart_version=int(first["version"]))
    partner = _partner(
        suffix="41",
        variant_slugs=("switch-socket-repair", "fan-installation"),
    )
    plan = _plan(client, address_id=address_id, cart_version=int(second["version"]))["plans"][0]
    quote = _quote(client, plan["id"], key="group-dispatch-quote")
    checkout = _checkout(client, quote["id"], key="group-dispatch-checkout")
    group_id = checkout["booking_group"]["id"]

    group = BookingGroup.objects.get(id=group_id)
    offer = PartnerOffer.objects.get(fulfilment_unit__booking_group=group)
    assert group.status == BookingGroup.Status.MATCHING
    assert offer.partner == partner
    assert offer.checkout_id is None
    assert offer.fulfilment_unit_id is not None
    assert OutboxEvent.objects.filter(
        aggregate_id=group.id,
        event_type="booking_group.confirmed",
        status=OutboxEvent.Status.PUBLISHED,
    ).exists()

    customer_projection = client.get(f"/api/v1/booking-groups/{group.id}/")
    assert customer_projection.status_code == HTTPStatus.OK
    assert str(partner.id) not in customer_projection.content.decode()
    assert customer_projection.json()["recovery_action"] == "WAIT"
    assert customer_projection.json()["next_transition_at"] is not None
    assert customer_projection.json()["units"][0]["state_deadline"] is not None
    assert len(customer_projection.json()["units"]) == 1
    other_client = APIClient()
    other_client.force_authenticate(User.objects.create_user(phone_number="+919876540099"))
    assert other_client.get(f"/api/v1/booking-groups/{group.id}/").status_code == (
        HTTPStatus.NOT_FOUND
    )

    partner_projection = OfferSerializer(offer).data
    assert partner_projection["fulfilment_unit_id"] == str(offer.fulfilment_unit_id)
    assert len(partner_projection["service_lines"]) == EXPECTED_SERVICE_LINES
    assert partner_projection["approximate_area"]
    assert partner_projection["requirements"]
    assert partner_projection["estimated_gross"]["amount_paise"] == (
        partner_projection["commission"]["amount_paise"]
        + partner_projection["estimated_net"]["amount_paise"]
    )
    assert "booking_group" not in partner_projection


def test_parallel_units_commit_autonomously_after_each_undo_deadline() -> None:
    client, _customer, address_id, version = _customer_context()
    first = _add_item(client, slug="switch-socket-repair", cart_version=version)
    second = _add_item(client, slug="tap-repair", cart_version=int(first["version"]))
    _partner(suffix="42", variant_slugs=("switch-socket-repair",))
    _partner(suffix="43", variant_slugs=("tap-repair",))
    plan = _plan(client, address_id=address_id, cart_version=int(second["version"]))["plans"][0]
    assert len(plan["units"]) == EXPECTED_PARALLEL_UNITS
    quote = _quote(client, plan["id"], key="parallel-dispatch-quote")
    checkout = _checkout(client, quote["id"], key="parallel-dispatch-checkout")
    group = BookingGroup.objects.get(id=checkout["booking_group"]["id"])
    offers = list(
        PartnerOffer.objects.filter(fulfilment_unit__booking_group=group).select_related("partner")
    )
    assert len(offers) == EXPECTED_PARALLEL_UNITS

    for offer in offers:
        accepted = accept_unit_offer(offer_id=offer.id, partner=offer.partner)
        accepted.undo_deadline = timezone.now() - timedelta(seconds=1)
        accepted.save(update_fields=("undo_deadline",))
    reconcile_group_dispatch(group_id=group.id)

    group.refresh_from_db()
    assert group.status == BookingGroup.Status.PAYMENT_PENDING
    assert set(group.units.values_list("status", flat=True)) == {
        FulfilmentUnit.Status.PAYMENT_PENDING
    }
    assert (
        PartnerOffer.objects.filter(
            fulfilment_unit__booking_group=group,
            status=PartnerOffer.Status.COMMITTED,
        ).count()
        == EXPECTED_PARALLEL_UNITS
    )
    assert (
        Reservation.objects.filter(
            fulfilment_unit__booking_group=group,
            status=Reservation.Status.TENTATIVE,
        ).count()
        == EXPECTED_PARALLEL_UNITS
    )

    Reservation.objects.filter(fulfilment_unit__booking_group=group).update(
        expires_at=timezone.now() - timedelta(seconds=1)
    )
    reconcile_group_dispatch(group_id=group.id)
    group.refresh_from_db()
    assert group.status == BookingGroup.Status.EXPIRED
    assert not Reservation.objects.filter(
        fulfilment_unit__booking_group=group,
        status__in=(Reservation.Status.TENTATIVE, Reservation.Status.CONFIRMED),
    ).exists()


def test_one_unassignable_unit_compensates_every_partial_group_hold() -> None:
    client, _customer, address_id, version = _customer_context()
    first = _add_item(client, slug="switch-socket-repair", cart_version=version)
    second = _add_item(client, slug="tap-repair", cart_version=int(first["version"]))
    _partner(suffix="44", variant_slugs=("switch-socket-repair",))
    unavailable = _partner(suffix="45", variant_slugs=("tap-repair",))
    plan = _plan(client, address_id=address_id, cart_version=int(second["version"]))["plans"][0]
    quote = _quote(client, plan["id"], key="compensation-quote")
    PartnerService.objects.filter(partner=unavailable).update(is_active=False)

    checkout = _checkout(client, quote["id"], key="compensation-checkout")
    group = BookingGroup.objects.get(id=checkout["booking_group"]["id"])

    assert group.status == BookingGroup.Status.REPLAN_REQUIRED
    assert set(group.units.values_list("status", flat=True)) == {FulfilmentUnit.Status.FAILED}
    assert not PartnerOffer.objects.filter(
        fulfilment_unit__booking_group=group,
        status__in=(PartnerOffer.Status.OFFERED, PartnerOffer.Status.ACCEPTED_PENDING_UNDO),
    ).exists()


def test_customer_cancel_is_versioned_idempotent_and_releases_every_hold() -> None:
    client, _customer, address_id, version = _customer_context()
    cart = _add_item(client, slug="switch-socket-repair", cart_version=version)
    _partner(suffix="46", variant_slugs=("switch-socket-repair",))
    plan = _plan(client, address_id=address_id, cart_version=int(cart["version"]))["plans"][0]
    quote = _quote(client, plan["id"], key="cancel-group-quote")
    checkout = _checkout(client, quote["id"], key="cancel-group-checkout")
    group = BookingGroup.objects.get(id=checkout["booking_group"]["id"])
    offer = PartnerOffer.objects.select_related("partner").get(fulfilment_unit__booking_group=group)
    accept_unit_offer(offer_id=offer.id, partner=offer.partner)
    group.refresh_from_db()

    payload = {"expected_version": group.version}
    first_cancel = client.post(
        f"/api/v1/booking-groups/{group.id}/cancel/",
        payload,
        format="json",
        HTTP_IDEMPOTENCY_KEY="cancel-group-command",
    )
    replay = client.post(
        f"/api/v1/booking-groups/{group.id}/cancel/",
        payload,
        format="json",
        HTTP_IDEMPOTENCY_KEY="cancel-group-command",
    )
    assert first_cancel.status_code == replay.status_code == HTTPStatus.OK
    assert first_cancel.json() == replay.json()
    assert first_cancel.json()["status"] == BookingGroup.Status.CANCELLED
    assert not Reservation.objects.filter(
        fulfilment_unit__booking_group=group,
        status__in=(Reservation.Status.TENTATIVE, Reservation.Status.CONFIRMED),
    ).exists()
