"""`GET /operations/bookings/`: every home-service visit, so Operations can find one without its id.

Before this list existed the console could only open a visit whose booking id somebody pasted in.
"""

from datetime import timedelta
from http import HTTPStatus

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.commerce.models import Booking
from apps.identity.models import Role, User, UserRole
from tests.fulfilment.conftest import create_booked_group
from tests.helpers import force_role_client

pytestmark = pytest.mark.django_db(transaction=True)

URL = "/api/v1/operations/bookings/"


def _operations_client(phone: str) -> APIClient:
    user = User.objects.create_user(phone_number=phone)
    role, _created = Role.objects.get_or_create(code="operations", defaults={"name": "Operations"})
    UserRole.objects.get_or_create(user=user, role=role, revoked_at=None)
    return force_role_client(user=user, role_code="operations")


def test_operations_lists_visits_with_who_what_and_where() -> None:
    booked = create_booked_group(key_prefix="ops-list-row")
    client = _operations_client("+919870000101")

    response = client.get(URL)

    assert response.status_code == HTTPStatus.OK
    rows = {row["id"]: row for row in response.json()["results"]}
    row = rows[str(booked.booking.id)]
    assert row["customer_phone"] == booked.customer.phone_number
    assert row["partner_display_name"] == booked.booking.partner.display_name
    assert row["services"], "the service lines name what is being done"
    assert row["total_paise"] == booked.unit.total_paise
    assert row["is_late"] is False


def test_search_finds_a_visit_by_customer_phone_or_booking_id() -> None:
    booked = create_booked_group(key_prefix="ops-list-search")
    other = create_booked_group(key_prefix="ops-list-other")
    client = _operations_client("+919870000102")

    by_phone = client.get(URL, {"q": booked.customer.phone_number[-6:]}).json()["results"]
    by_id = client.get(URL, {"q": str(booked.booking.id)}).json()["results"]

    assert [row["id"] for row in by_id] == [str(booked.booking.id)]
    assert str(booked.booking.id) in {row["id"] for row in by_phone}
    assert str(other.booking.id) not in {row["id"] for row in by_id}


def test_late_filter_keeps_only_visits_past_their_start_that_have_not_started() -> None:
    late = create_booked_group(key_prefix="ops-list-late")
    on_time = create_booked_group(key_prefix="ops-list-ontime")
    Booking.objects.filter(id=late.booking.id).update(
        scheduled_start=timezone.now() - timedelta(hours=1)
    )
    client = _operations_client("+919870000103")

    rows = client.get(URL, {"late": "true"}).json()["results"]

    ids = {row["id"] for row in rows}
    assert str(late.booking.id) in ids
    assert str(on_time.booking.id) not in ids
    assert all(row["is_late"] for row in rows)


def test_an_unknown_status_is_refused_rather_than_read_as_nothing() -> None:
    client = _operations_client("+919870000104")

    response = client.get(URL, {"status": "NOT_A_STATUS"})

    assert response.status_code == HTTPStatus.BAD_REQUEST


def test_a_customer_cannot_list_visits() -> None:
    booked = create_booked_group(key_prefix="ops-list-customer")

    response = booked.client.get(URL)

    assert response.status_code in (HTTPStatus.FORBIDDEN, HTTPStatus.UNAUTHORIZED)
