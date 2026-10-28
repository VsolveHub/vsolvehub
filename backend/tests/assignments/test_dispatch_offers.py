"""Tests for Instant Booking DispatchOffer model and Partner APIs."""

from datetime import timedelta
from http import HTTPStatus
from unittest.mock import patch

import pytest
from django.utils import timezone

from apps.assignments.models import DispatchOffer
from apps.commerce.models import Booking
from apps.identity.models import Role, User, UserRole
from apps.partners.models import PartnerProfile
from tests.fulfilment.conftest import create_booked_group
from tests.helpers import force_role_client

pytestmark = [
    pytest.mark.django_db(transaction=True),
    pytest.mark.usefixtures("partner_gates_open"),
]


def _seed_booking_and_partner(*, suffix: str = "1") -> tuple[Booking, PartnerProfile, User]:
    booked = create_booked_group(key_prefix=f"dsp-{suffix}")
    partner_role, _ = Role.objects.get_or_create(code="partner", defaults={"name": "Partner"})
    UserRole.objects.get_or_create(user=booked.partner.user, role=partner_role)
    return booked.booking, booked.partner, booked.partner.user



def _seed_second_partner(*, suffix: str = "2") -> tuple[PartnerProfile, User]:
    user = User.objects.create_user(phone_number=f"+9198333{int(suffix):05d}")
    role, _ = Role.objects.get_or_create(code="partner", defaults={"name": "Partner"})
    UserRole.objects.get_or_create(user=user, role=role)
    partner = PartnerProfile.objects.create(user=user, display_name=f"Partner {suffix}")
    return partner, user


def test_partner_cannot_accept_another_partners_offer() -> None:
    booking, partner_a, _user_a = _seed_booking_and_partner(suffix="10")
    partner_b, user_b = _seed_second_partner(suffix="11")
    client_b = force_role_client(user=user_b, role_code="partner")

    offer_a = DispatchOffer.objects.create(
        booking=booking,
        partner=partner_a,
        status=DispatchOffer.Status.PENDING,
        offered_at=timezone.now(),
        expires_at=timezone.now() + timedelta(seconds=60),
    )

    response = client_b.post(f"/api/v1/partner/dispatch-offers/{offer_a.id}/accept/")
    assert response.status_code == HTTPStatus.FORBIDDEN
    assert "belongs to another partner" in str(response.json())


def test_expired_offer_cannot_be_accepted() -> None:
    booking, partner, user = _seed_booking_and_partner(suffix="20")
    client = force_role_client(user=user, role_code="partner")

    now = timezone.now()
    offer = DispatchOffer.objects.create(
        booking=booking,
        partner=partner,
        status=DispatchOffer.Status.PENDING,
        offered_at=now - timedelta(seconds=120),
        expires_at=now - timedelta(seconds=10),
    )

    response = client.post(f"/api/v1/partner/dispatch-offers/{offer.id}/accept/")
    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert "expired" in str(response.json()).lower()

    offer.refresh_from_db()
    assert offer.status == DispatchOffer.Status.EXPIRED


def test_already_accepted_offer_cannot_be_accepted_again() -> None:
    booking, partner, user = _seed_booking_and_partner(suffix="30")
    client = force_role_client(user=user, role_code="partner")

    now = timezone.now()
    offer = DispatchOffer.objects.create(
        booking=booking,
        partner=partner,
        status=DispatchOffer.Status.ACCEPTED,
        offered_at=now - timedelta(seconds=30),
        expires_at=now + timedelta(seconds=30),
        responded_at=now - timedelta(seconds=10),
    )

    response = client.post(f"/api/v1/partner/dispatch-offers/{offer.id}/accept/")
    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert "not pending" in str(response.json()).lower()


def test_partner_decline_triggers_reassignment() -> None:
    booking, partner, user = _seed_booking_and_partner(suffix="40")
    client = force_role_client(user=user, role_code="partner")

    now = timezone.now()
    offer = DispatchOffer.objects.create(
        booking=booking,
        partner=partner,
        status=DispatchOffer.Status.PENDING,
        offered_at=now,
        expires_at=now + timedelta(seconds=60),
    )

    with patch("apps.assignments.tasks.reassignment_or_downgrade_task.delay") as mock_reassign:
        response = client.post(f"/api/v1/partner/dispatch-offers/{offer.id}/decline/")
        assert response.status_code == HTTPStatus.OK
        assert response.json()["status"] == "DECLINED"

        offer.refresh_from_db()
        assert offer.status == DispatchOffer.Status.DECLINED
        assert offer.responded_at is not None

        mock_reassign.assert_called_once_with(str(booking.id))


def test_successful_accept_cancels_competing_offers_and_confirms_booking() -> None:
    booking, partner_a, user_a = _seed_booking_and_partner(suffix="50")
    client_a = force_role_client(user=user_a, role_code="partner")

    now = timezone.now()
    offer_a = DispatchOffer.objects.create(
        booking=booking,
        partner=partner_a,
        status=DispatchOffer.Status.PENDING,
        offered_at=now,
        expires_at=now + timedelta(seconds=60),
    )

    response = client_a.post(f"/api/v1/partner/dispatch-offers/{offer_a.id}/accept/")
    assert response.status_code == HTTPStatus.OK
    assert response.json()["status"] == "ACCEPTED"

    offer_a.refresh_from_db()
    assert offer_a.status == DispatchOffer.Status.ACCEPTED
    assert offer_a.responded_at is not None

    booking.refresh_from_db()
    assert booking.partner == partner_a
    assert booking.status == Booking.Status.CONFIRMED


def test_dispatch_offer_detail_endpoint() -> None:
    booking, partner, user = _seed_booking_and_partner(suffix="60")
    client = force_role_client(user=user, role_code="partner")

    now = timezone.now()
    offer = DispatchOffer.objects.create(
        booking=booking,
        partner=partner,
        status=DispatchOffer.Status.PENDING,
        offered_at=now,
        expires_at=now + timedelta(seconds=45),
    )

    response = client.get(f"/api/v1/partner/dispatch-offers/{offer.id}/")
    assert response.status_code == HTTPStatus.OK

    data = response.json()
    assert data["id"] == str(offer.id)
    assert data["status"] == "PENDING"
    assert data["remaining_seconds"] > 0
    assert data["booking"]["id"] == str(booking.id)
    assert data["booking"]["estimated_duration_minutes"] == booking.estimated_duration_minutes
