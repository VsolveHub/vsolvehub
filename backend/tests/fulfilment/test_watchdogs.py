"""Lateness watchdog sweep and the restricted Operations-assisted outage start."""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.commerce.models import Booking
from apps.fulfilment.exceptions import BookingCommandInvalidApiError
from apps.fulfilment.models import BookingStatusHistory
from apps.fulfilment.services import (
    is_partner_late,
    mark_arrived,
    mark_en_route,
    operations_assisted_outage_start,
)
from apps.fulfilment.tasks import sweep_late_bookings
from apps.identity.models import User
from tests.fulfilment.conftest import create_booked_group

pytestmark = [
    pytest.mark.django_db(transaction=True),
    # Walks visits booked for tomorrow through en route and arrival; the clock gates on those
    # steps are tested in tests/fulfilment/test_partner_time_gates.py.
    pytest.mark.usefixtures("partner_gates_open"),
]


def _make_overdue(booked: object) -> None:
    unit = booked.unit  # type: ignore[attr-defined]
    unit.requested_start = timezone.now() - timedelta(hours=3)
    unit.save(update_fields=("requested_start",))


def test_sweep_declares_overdue_confirmed_bookings_late() -> None:
    booked = create_booked_group(key_prefix="watchdog-sweep")
    _make_overdue(booked)

    swept = sweep_late_bookings()
    assert swept == 1

    booked.booking.refresh_from_db()
    assert booked.booking.late_declared_at is not None
    assert (
        BookingStatusHistory.objects.filter(booking=booked.booking, command="DECLARE_LATE").count()
        == 1
    )


def test_sweep_ignores_bookings_that_are_not_yet_overdue() -> None:
    booked = create_booked_group(key_prefix="watchdog-not-due")
    swept = sweep_late_bookings()
    assert swept == 0
    booked.booking.refresh_from_db()
    assert booked.booking.late_declared_at is None


def test_sweep_never_double_declares_the_same_booking() -> None:
    booked = create_booked_group(key_prefix="watchdog-once")
    _make_overdue(booked)

    first = sweep_late_bookings()
    second = sweep_late_bookings()
    assert first == 1
    assert second == 0
    assert (
        BookingStatusHistory.objects.filter(booking=booked.booking, command="DECLARE_LATE").count()
        == 1
    )


def test_operations_assisted_outage_start_moves_en_route_with_audited_reason() -> None:
    booked = create_booked_group(key_prefix="watchdog-assisted")
    operator = User.objects.create_user(phone_number="+919820000001")

    moved = operations_assisted_outage_start(
        booking_id=booked.booking.id,
        operator=operator,
        outage_reason="Partner app offline, confirmed by phone.",
        expected_version=booked.booking.version,
    )
    assert moved.status == Booking.Status.EN_ROUTE
    assert moved.en_route_at is not None

    history = BookingStatusHistory.objects.get(booking=moved, command="MARK_EN_ROUTE")
    assert history.actor_id == operator.id
    assert history.context["assisted"] is True
    assert "offline" in history.context["outage_reason"]


def test_operations_assisted_outage_start_requires_a_reason() -> None:
    booked = create_booked_group(key_prefix="watchdog-assisted-blank")
    operator = User.objects.create_user(phone_number="+919820000002")

    with pytest.raises(BookingCommandInvalidApiError):
        operations_assisted_outage_start(
            booking_id=booked.booking.id,
            operator=operator,
            outage_reason="   ",
            expected_version=booked.booking.version,
        )


def test_operations_assisted_outage_start_is_restricted_to_en_route_and_arrived() -> None:
    booked = create_booked_group(key_prefix="watchdog-assisted-restricted")
    operator = User.objects.create_user(phone_number="+919820000003")
    booking = mark_en_route(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        expected_version=booked.booking.version,
    )
    booking = mark_arrived(
        booking_id=booking.id, partner_id=booked.partner.id, expected_version=booking.version
    )

    with pytest.raises(BookingCommandInvalidApiError):
        operations_assisted_outage_start(
            booking_id=booking.id,
            operator=operator,
            outage_reason="Too late for this to apply.",
            expected_version=booking.version,
        )


def test_is_partner_late_reflects_the_grace_deadline() -> None:
    booked = create_booked_group(key_prefix="watchdog-grace-check")
    assert is_partner_late(booking=booked.booking, unit=booked.unit) is False
    _make_overdue(booked)
    booked.unit.refresh_from_db()
    assert is_partner_late(booking=booked.booking, unit=booked.unit) is True
