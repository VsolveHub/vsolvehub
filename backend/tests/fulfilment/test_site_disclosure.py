"""P0-2: the assigned Partner gets the Customer's door, route and number — on a clock.

Before `scheduled_start - M1_ADDRESS_UNLOCK_MINUTES` the Partner sees the locality and nothing more.
From that instant, while the visit is live, they see the address, the Google Maps route, the
Customer's first name and phone. Once the visit is submitted, settled or cancelled all of it is
withdrawn. No other Partner can read the projection at all. The Customer sees the Partner's number
in exactly the same window; Operations sees both numbers and the address whenever a case is open.
"""

import itertools
from datetime import datetime, timedelta
from http import HTTPStatus

import pytest
from freezegun import freeze_time
from pytest_django.fixtures import SettingsWrapper
from rest_framework.test import APIClient

from apps.commerce.models import Booking
from apps.fulfilment.cancellation import cancel_booking
from apps.identity.models import Role, User, UserRole
from apps.locations.pins import directions_url
from apps.partners.models import PartnerProfile
from tests.carts.test_fulfilment_planning import _partner
from tests.fulfilment.conftest import BookedGroup, create_booked_group
from tests.helpers import force_role_client

pytestmark = pytest.mark.django_db(transaction=True)

_keys = itertools.count(1)
ONE_SECOND = timedelta(seconds=1)
CONTACT_FIELDS = ("site_address", "directions_url", "customer_first_name", "customer_phone")


@pytest.fixture(autouse=True)
def _production_unlock(settings: SettingsWrapper) -> None:
    settings.M1_ADDRESS_UNLOCK_MINUTES = 120


def _booked(label: str) -> BookedGroup:
    booked = create_booked_group(key_prefix=f"disclosure-{label}-{next(_keys)}")
    booked.customer.full_name = "Asha Rao"
    booked.customer.save(update_fields=("full_name",))
    return booked


def _client(user: User, role_code: str) -> APIClient:
    role, _created = Role.objects.get_or_create(code=role_code, defaults={"name": role_code})
    UserRole.objects.get_or_create(user=user, role=role, revoked_at=None)
    return force_role_client(user=user, role_code=role_code)


def _partner_view(booked: BookedGroup, at: datetime) -> dict[str, object]:
    client = _client(booked.partner.user, "partner")
    with freeze_time(at):
        response = client.get(f"/api/v1/partner/bookings/{booked.booking.id}/")
    assert response.status_code == HTTPStatus.OK
    return response.json()


def _unlocks_at(booked: BookedGroup) -> datetime:
    return booked.booking.scheduled_start - timedelta(minutes=120)


def test_partner_sees_only_the_locality_one_second_before_unlock() -> None:
    booked = _booked("locked")
    address = booked.group.address

    view = _partner_view(booked, _unlocks_at(booked) - ONE_SECOND)

    assert all(view[field] is None for field in CONTACT_FIELDS)
    assert view["approximate_area"] == address.locality
    assert address.line1 not in str(view)
    assert booked.customer.phone_number not in str(view)


def test_partner_sees_address_route_name_and_phone_exactly_at_unlock() -> None:
    booked = _booked("unlocked")
    address = booked.group.address

    view = _partner_view(booked, _unlocks_at(booked))

    assert view["site_address"] == {
        "line1": address.line1,
        "line2": address.line2,
        "landmark": address.landmark,
        "locality": address.locality,
        "city": address.city,
        "state": address.state,
        "postal_code": address.postal_code,
        "directions_url": directions_url(address.latitude, address.longitude),
    }
    assert view["directions_url"] == directions_url(address.latitude, address.longitude)
    assert str(view["directions_url"]).startswith("https://www.google.com/maps/")
    assert view["customer_first_name"] == "Asha"
    assert view["customer_phone"] == booked.customer.phone_number


def test_disclosure_is_withdrawn_once_the_visit_is_cancelled() -> None:
    booked = _booked("cancelled")
    booking = booked.booking
    with freeze_time(_unlocks_at(booked)):
        cancel_booking(
            booking_id=booking.id,
            customer_id=booked.customer.id,
            expected_version=booking.version,
            reason="plans changed",
            idempotency_key="disclosure-cancel",
        )

    view = _partner_view(booked, _unlocks_at(booked) + timedelta(minutes=1))

    assert view["status"] == Booking.Status.CANCELLED
    assert all(view[field] is None for field in CONTACT_FIELDS)


def test_disclosure_is_withdrawn_once_the_completion_is_submitted() -> None:
    booked = _booked("submitted")
    booking = booked.booking
    booking.status = Booking.Status.COMPLETION_SUBMITTED
    booking.version += 1
    booking.save(update_fields=("status", "version"))

    view = _partner_view(booked, booking.scheduled_start)

    assert all(view[field] is None for field in CONTACT_FIELDS)


def test_another_partner_cannot_read_the_visit_even_inside_the_window() -> None:
    booked = _booked("stranger")
    stranger: PartnerProfile = _partner(suffix="9901", variant_slugs=("switch-socket-repair",))
    client = _client(stranger.user, "partner")

    with freeze_time(booked.booking.scheduled_start):
        response = client.get(f"/api/v1/partner/bookings/{booked.booking.id}/")

    assert response.status_code == HTTPStatus.FORBIDDEN
    assert booked.customer.phone_number not in response.content.decode()


def test_customer_sees_the_partner_phone_only_inside_the_same_window() -> None:
    booked = _booked("customer-side")
    url = f"/api/v1/bookings/{booked.booking.id}/"

    with freeze_time(_unlocks_at(booked) - ONE_SECOND):
        before = booked.client.get(url)
    with freeze_time(_unlocks_at(booked)):
        inside = booked.client.get(url)

    assert before.status_code == HTTPStatus.OK
    assert before.json()["partner_phone"] is None
    assert inside.json()["partner_phone"] == booked.partner.user.phone_number


def test_operations_sees_address_and_both_numbers_without_waiting_for_the_unlock() -> None:
    booked = _booked("operations")
    operator = User.objects.create_user(phone_number="+919876555001")
    client = _client(operator, "operations")
    address = booked.group.address

    with freeze_time(_unlocks_at(booked) - timedelta(days=1)):
        response = client.get(f"/api/v1/operations/bookings/{booked.booking.id}/")

    assert response.status_code == HTTPStatus.OK
    body = response.json()
    assert body["site_address"]["line1"] == address.line1
    assert body["customer_phone"] == booked.customer.phone_number
    assert body["customer_name"] == "Asha Rao"
    assert body["partner_phone"] == booked.partner.user.phone_number
