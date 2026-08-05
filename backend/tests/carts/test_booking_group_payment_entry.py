"""Proposal 0011 — the Booking Group must carry its own payment entry point.

`recovery_action: PAYMENT_REQUIRED` is an instruction. Before this, it was an
instruction with no executable command behind it: `POST /payment-attempts/` needs
`checkout_id` and `expected_checkout_version`, the group projection published
neither, and no `GET /checkouts/{id}/` exists to look them up. A Customer could
therefore pay only from inside the tab that confirmed the group — a reload, a
second device or a notification link all led to a dead end, and the reservation
expired while the client sat on a UUID the server was holding all along.

These tests fail on 1.13.0 and pass on 1.14.0.
"""

from datetime import timedelta
from http import HTTPStatus

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.assignments.group_services import accept_unit_offer, reconcile_group_dispatch
from apps.assignments.models import PartnerOffer
from apps.carts.models import BookingGroup
from apps.commerce.models import Booking
from apps.identity.models import User
from tests.assignments.test_group_dispatch import _checkout, _quote
from tests.carts.test_fulfilment_planning import (
    _add_item,
    _customer_context,
    _partner,
    _plan,
)
from tests.fulfilment.conftest import create_booked_group

pytestmark = pytest.mark.django_db(transaction=True)

PAYMENT_ENTRY_FIELDS = ("checkout_id", "checkout_version", "order_id")


def _confirmed_group(*, suffix: str, key_prefix: str) -> tuple[APIClient, dict[str, object]]:
    """Drive one item through cart → plan → quote → checkout and return the checkout."""

    client, _customer, address_id, version = _customer_context()
    cart = _add_item(client, slug="switch-socket-repair", cart_version=version)
    _partner(suffix=suffix, variant_slugs=("switch-socket-repair",))
    plan = _plan(client, address_id=address_id, cart_version=int(cart["version"]))["plans"][0]
    quote = _quote(client, plan["id"], key=f"{key_prefix}-quote")
    return client, _checkout(client, quote["id"], key=f"{key_prefix}-checkout")


def _hold_every_unit(group: BookingGroup) -> None:
    """Accept and commit every offer so the group reaches PAYMENT_PENDING."""

    for offer in PartnerOffer.objects.filter(fulfilment_unit__booking_group=group).select_related(
        "partner"
    ):
        accepted = accept_unit_offer(offer_id=offer.id, partner=offer.partner)
        accepted.undo_deadline = timezone.now() - timedelta(seconds=1)
        accepted.save(update_fields=("undo_deadline",))
    reconcile_group_dispatch(group_id=group.id)


def test_group_projection_carries_the_checkout_that_owns_it() -> None:
    client, checkout = _confirmed_group(suffix="61", key_prefix="entry-detail")
    group_id = checkout["booking_group"]["id"]

    body = client.get(f"/api/v1/booking-groups/{group_id}/").json()

    for field in PAYMENT_ENTRY_FIELDS:
        assert field in body, f"{field} is missing from the group projection"
    assert body["checkout_id"] == checkout["id"]
    assert body["checkout_version"] == checkout["version"]
    # Nothing has been paid, so there is no order to point at yet.
    assert body["order_id"] is None


def test_payment_required_always_carries_an_executable_command() -> None:
    """The regression that motivated the proposal.

    If a group can ever say PAYMENT_REQUIRED while withholding the two fields the
    payment command requires, the Customer is told to pay and given no way to.
    """

    client, checkout = _confirmed_group(suffix="62", key_prefix="entry-payable")
    group = BookingGroup.objects.get(id=checkout["booking_group"]["id"])
    _hold_every_unit(group)
    group.refresh_from_db()
    assert group.status == BookingGroup.Status.PAYMENT_PENDING

    body = client.get(f"/api/v1/booking-groups/{group.id}/").json()
    assert body["recovery_action"] == "PAYMENT_REQUIRED"
    assert body["checkout_id"] is not None
    assert body["checkout_version"] is not None

    # The published fields must satisfy the published command, not merely exist.
    accepted = client.post(
        "/api/v1/payment-attempts/",
        {
            "checkout_id": body["checkout_id"],
            "expected_checkout_version": body["checkout_version"],
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY=f"entry-pay-{group.id}",
    )
    assert accepted.status_code == HTTPStatus.ACCEPTED, accepted.json()
    assert accepted.json()["booking_group_id"] == str(group.id)


def test_stale_published_checkout_version_still_fails_closed() -> None:
    """Publishing the version must not weaken the guard it exists to enforce."""

    client, checkout = _confirmed_group(suffix="63", key_prefix="entry-stale")
    group = BookingGroup.objects.get(id=checkout["booking_group"]["id"])
    _hold_every_unit(group)
    body = client.get(f"/api/v1/booking-groups/{group.id}/").json()

    conflict = client.post(
        "/api/v1/payment-attempts/",
        {
            "checkout_id": body["checkout_id"],
            "expected_checkout_version": int(body["checkout_version"]) + 1,
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY=f"entry-stale-{group.id}",
    )
    assert conflict.status_code == HTTPStatus.CONFLICT


def test_list_projection_carries_the_fields_without_a_query_per_row() -> None:
    client, first = _confirmed_group(suffix="64", key_prefix="entry-list-a")
    _hold_every_unit(BookingGroup.objects.get(id=first["booking_group"]["id"]))

    page = client.get("/api/v1/booking-groups/").json()
    assert page["results"], "the customer should see their own group"
    for row in page["results"]:
        for field in PAYMENT_ENTRY_FIELDS:
            assert field in row

    listed = next(row for row in page["results"] if row["id"] == first["booking_group"]["id"])
    assert listed["checkout_id"] == first["id"]


def test_another_customer_still_cannot_read_the_group() -> None:
    _client, checkout = _confirmed_group(suffix="65", key_prefix="entry-scope")
    group_id = checkout["booking_group"]["id"]

    intruder = APIClient()
    intruder.force_authenticate(User.objects.create_user(phone_number="+919876540077"))

    assert intruder.get(f"/api/v1/booking-groups/{group_id}/").status_code == HTTPStatus.NOT_FOUND


def test_a_booked_unit_publishes_the_booking_id_its_visit_is_keyed_by() -> None:
    """Without this the whole 1.16.0 Customer surface is unreachable.

    Every post-payment command — cancel, reschedule, start OTP, confirm, dispute — is keyed by
    `booking_id`, and this is the only projection that lists a Customer's units. A group detail
    that described three visits while publishing no way to open any of them is the identical
    break proposal 0011 fixed for payment.
    """

    booked = create_booked_group(key_prefix="unit-booking-id")

    response = booked.client.get(f"/api/v1/booking-groups/{booked.group.id}/")

    assert response.status_code == HTTPStatus.OK, response.json()
    units = response.json()["units"]
    assert units, "the group published no units"
    for unit in units:
        assert unit["booking_id"], "a booked unit published no booking_id"
    assert {unit["booking_id"] for unit in units} == {
        str(booking.id)
        for booking in Booking.objects.filter(fulfilment_unit__booking_group=booked.group)
    }


def test_an_unbooked_unit_publishes_a_null_booking_id_rather_than_inventing_one() -> None:
    """A unit still being matched has no visit. Null is the honest answer; a fabricated id
    would send a Customer to a 403 on a Booking that does not exist."""

    booked = create_booked_group(key_prefix="unit-booking-null")
    Booking.objects.filter(fulfilment_unit__booking_group=booked.group).delete()

    response = booked.client.get(f"/api/v1/booking-groups/{booked.group.id}/")

    assert response.status_code == HTTPStatus.OK
    for unit in response.json()["units"]:
        assert unit["booking_id"] is None
