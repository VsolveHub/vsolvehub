"""P0-4: an advance visit must go to a free Partner when the top-ranked one is already booked.

Ranking is a stable sort on Partner UUID, so the same Partner heads every pool. The grid and the
planner both exclude a Partner who already holds a live reservation for the slot — which is why a
second Customer is shown the slot at all — but dispatch ranking used to ignore reservations. It
offered the slot to the busy Partner first, `directly_assign` hit the reservation exclusion
constraint, and the `IntegrityError` it swallowed had already poisoned the surrounding
transaction: the whole dispatch rolled back and the group sat in `CONFIRMED` until it expired.
"""

from http import HTTPStatus

import pytest
from rest_framework.test import APIClient

from apps.assignments.models import AssignmentAttempt, Reservation
from apps.assignments.ranking import ExclusionReason, evaluate_unit_candidates
from apps.carts.models import BookingGroup, CheckoutSession
from apps.identity.models import User
from tests.assignments.test_group_dispatch import _checkout, _quote
from tests.carts.test_fulfilment_planning import (
    _add_item,
    _address_payload,
    _customer_context,
    _partner,
    _plan,
)

pytestmark = pytest.mark.django_db(transaction=True)


def _book_same_slot(
    client: APIClient, *, cart_version: int, address_id: str, key: str
) -> BookingGroup:
    cart = _add_item(client, slug="switch-socket-repair", cart_version=cart_version)
    plan = _plan(client, address_id=address_id, cart_version=int(cart["version"]))["plans"][0]
    quote = _quote(client, plan["id"], key=f"{key}-quote")
    checkout = _checkout(client, quote["id"], key=f"{key}-checkout")
    return BookingGroup.objects.get(id=checkout["booking_group"]["id"])


def _second_customer() -> tuple[APIClient, str, int]:
    customer = User.objects.create_user(phone_number="+919876543299")
    client = APIClient()
    client.force_authenticate(customer)
    cart_version = client.get("/api/v1/cart/").json()["version"]
    address = client.post("/api/v1/addresses/", _address_payload(), format="json")
    assert address.status_code == HTTPStatus.CREATED
    return client, address.json()["id"], cart_version


def test_advance_visit_skips_a_partner_already_booked_for_the_slot() -> None:
    client, _customer, address_id, version = _customer_context()
    first_partner = _partner(suffix="61", variant_slugs=("switch-socket-repair",))
    second_partner = _partner(suffix="62", variant_slugs=("switch-socket-repair",))
    top_ranked, other = sorted((first_partner, second_partner), key=lambda partner: partner.id)

    first_group = _book_same_slot(
        client, cart_version=version, address_id=address_id, key="booked-first"
    )
    first_group.refresh_from_db()
    assert first_group.status == BookingGroup.Status.PAYMENT_PENDING
    assert (
        Reservation.objects.get(fulfilment_unit__booking_group=first_group).partner_id
        == top_ranked.id
    )

    second_client, second_address_id, second_version = _second_customer()
    second_group = _book_same_slot(
        second_client,
        cart_version=second_version,
        address_id=second_address_id,
        key="booked-second",
    )

    second_group.refresh_from_db()
    assert second_group.status == BookingGroup.Status.PAYMENT_PENDING
    hold = Reservation.objects.get(
        fulfilment_unit__booking_group=second_group,
        status=Reservation.Status.TENTATIVE,
    )
    assert hold.partner_id == other.id
    assert CheckoutSession.objects.get(booking_group=second_group).status == (
        CheckoutSession.Status.PARTNER_COMMITTED
    )
    # The busy Partner was never attempted for the second visit: ranking named why instead.
    unit = second_group.units.get()
    assert not AssignmentAttempt.objects.filter(fulfilment_unit=unit, candidate=top_ranked).exists()
    excluded = {
        item.partner.id: item.exclusions for item in evaluate_unit_candidates(unit).evaluations
    }
    assert ExclusionReason.ALREADY_BOOKED in excluded[top_ranked.id]


def test_a_units_own_hold_does_not_exclude_its_partner() -> None:
    """Operations reads the same ranking for a held unit; its own Partner is not 'busy'."""

    client, _customer, address_id, version = _customer_context()
    partner = _partner(suffix="63", variant_slugs=("switch-socket-repair",))
    group = _book_same_slot(client, cart_version=version, address_id=address_id, key="own-hold")
    unit = group.units.get()

    evaluation = next(
        item for item in evaluate_unit_candidates(unit).evaluations if item.partner == partner
    )

    assert ExclusionReason.ALREADY_BOOKED not in evaluation.exclusions
