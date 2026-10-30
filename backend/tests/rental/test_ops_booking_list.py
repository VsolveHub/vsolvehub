"""Operations' rental booking list: both parties, a status filter, and no handover PIN."""

import pytest
from django.contrib.auth import get_user_model
from rest_framework import status

from apps.identity.models import Role, UserRole
from apps.rental.models import RentalBooking
from tests.helpers import force_role_client
from tests.rental.test_cancel_booking import _booked, rental_world  # noqa: F401

User = get_user_model()


def _ops_client():
    ops_user = User.objects.create(phone_number="+919922230003", full_name="Ops List")
    role, _ = Role.objects.get_or_create(code="operations", defaults={"name": "Operations"})
    UserRole.objects.get_or_create(user=ops_user, role=role, revoked_at=None)
    return force_role_client(user=ops_user, role_code="operations")


@pytest.mark.django_db
def test_ops_lists_bookings_with_both_parties(rental_world):  # noqa: F811
    booking = _booked(rental_world)
    response = _ops_client().get("/api/v1/ops/rentals/bookings")
    assert response.status_code == status.HTTP_200_OK
    row = next(item for item in response.data["results"] if item["id"] == str(booking.id))
    assert row["customer_name"] == "Customer Cancel"
    assert row["customer_phone"] == "+919922220002"
    assert row["partner_name"] == "Owner Cancel Co"
    assert row["partner_id"] == str(rental_world["partner"].id)
    # The PIN is the customer's alone; Operations never reads it.
    assert row["handover_pin"] is None


@pytest.mark.django_db
def test_ops_booking_list_filters_by_status(rental_world):  # noqa: F811
    booking = _booked(rental_world)
    client = _ops_client()
    same = client.get(f"/api/v1/ops/rentals/bookings?status={booking.status.lower()}")
    assert [row["id"] for row in same.data["results"]] == [str(booking.id)]
    other = client.get(f"/api/v1/ops/rentals/bookings?status={RentalBooking.Status.RETURNED}")
    assert other.data["results"] == []


@pytest.mark.django_db
@pytest.mark.usefixtures("rental_world")
def test_ops_booking_list_refuses_unknown_status():
    response = _ops_client().get("/api/v1/ops/rentals/bookings?status=NOPE")
    assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_ops_booking_list_is_operations_only(rental_world):  # noqa: F811
    client = force_role_client(user=rental_world["customer"], role_code="customer")
    response = client.get("/api/v1/ops/rentals/bookings")
    assert response.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)
