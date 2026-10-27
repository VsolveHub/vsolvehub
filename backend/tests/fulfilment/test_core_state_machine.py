"""Booking transition service: legal moves, illegal moves, version guard, group derivation."""

from concurrent.futures import ThreadPoolExecutor

import pytest
from django.db import close_old_connections

from apps.carts.models import BookingGroup, FulfilmentUnit
from apps.commerce.models import Booking
from apps.fulfilment.exceptions import BookingCommandInvalidApiError, BookingVersionConflictApiError
from apps.fulfilment.models import BookingStatusHistory
from apps.fulfilment.services import (
    declare_booking_late,
    mark_arrived,
    mark_customer_unavailable_wait_started,
    mark_en_route,
    record_customer_contact_attempt,
    sync_group_completion,
)
from tests.fulfilment.conftest import create_booked_group

pytestmark = [
    pytest.mark.django_db(transaction=True),
    # Walks visits booked for tomorrow through en route and arrival; the clock gates on those
    # steps are tested in tests/fulfilment/test_partner_time_gates.py.
    pytest.mark.usefixtures("partner_gates_open"),
]
CONCURRENT_COMMANDS = 2
VERSION_AFTER_ONE_MOVE = 2


def test_booking_starts_confirmed_with_a_matching_booked_unit() -> None:
    booked = create_booked_group(key_prefix="sm-initial")
    booking = booked.booking
    assert booking.status == Booking.Status.CONFIRMED
    assert booking.version == 1
    assert booked.unit.status == FulfilmentUnit.Status.BOOKED


def test_mark_en_route_then_arrived_advances_state_and_writes_history() -> None:
    booked = create_booked_group(key_prefix="sm-progress")
    booking = booked.booking

    en_route = mark_en_route(
        booking_id=booking.id, partner_id=booked.partner.id, expected_version=booking.version
    )
    assert en_route.status == Booking.Status.EN_ROUTE
    assert en_route.en_route_at is not None
    assert en_route.version == booking.version + 1

    arrived = mark_arrived(
        booking_id=booking.id, partner_id=booked.partner.id, expected_version=en_route.version
    )
    assert arrived.status == Booking.Status.ARRIVED
    assert arrived.arrived_at is not None

    history = list(BookingStatusHistory.objects.filter(booking=booking).order_by("created_at"))
    assert [row.to_status for row in history] == [Booking.Status.EN_ROUTE, Booking.Status.ARRIVED]
    assert all(row.actor_id == booked.partner.user_id for row in history)


def test_stale_version_is_refused_and_current_version_is_published() -> None:
    booked = create_booked_group(key_prefix="sm-version")
    booking = booked.booking
    mark_en_route(
        booking_id=booking.id, partner_id=booked.partner.id, expected_version=booking.version
    )

    with pytest.raises(BookingVersionConflictApiError) as excinfo:
        mark_en_route(
            booking_id=booking.id, partner_id=booked.partner.id, expected_version=booking.version
        )
    assert excinfo.value.api_details["current_version"] == booking.version + 1


def test_illegal_transition_is_refused() -> None:
    booked = create_booked_group(key_prefix="sm-illegal")
    booking = booked.booking

    with pytest.raises(BookingCommandInvalidApiError):
        mark_arrived(
            booking_id=booking.id, partner_id=booked.partner.id, expected_version=booking.version
        )


def test_another_partner_cannot_move_someone_elses_booking() -> None:
    # Distinct slugs guarantee disjoint candidate pools, so the two Bookings are guaranteed to
    # land with two different Partners even though they share one fixed preferred start time.
    first = create_booked_group(slugs=("switch-socket-repair",), key_prefix="sm-owner-a")
    second = create_booked_group(slugs=("tap-repair",), key_prefix="sm-owner-b")

    with pytest.raises(PermissionError):
        mark_en_route(
            booking_id=first.booking.id,
            partner_id=second.partner.id,
            expected_version=first.booking.version,
        )


def test_customer_unavailable_wait_requires_arrival_first() -> None:
    booked = create_booked_group(key_prefix="sm-wait-guard")
    booking = booked.booking

    with pytest.raises(BookingCommandInvalidApiError):
        mark_customer_unavailable_wait_started(
            booking_id=booking.id,
            partner_id=booked.partner.id,
            expected_version=booking.version,
        )


def test_customer_unavailable_wait_and_contact_attempts_are_recorded() -> None:
    booked = create_booked_group(key_prefix="sm-wait")
    booking = booked.booking
    booking = mark_en_route(
        booking_id=booking.id, partner_id=booked.partner.id, expected_version=booking.version
    )
    booking = mark_arrived(
        booking_id=booking.id, partner_id=booked.partner.id, expected_version=booking.version
    )

    waiting = mark_customer_unavailable_wait_started(
        booking_id=booking.id, partner_id=booked.partner.id, expected_version=booking.version
    )
    assert waiting.customer_unavailable_wait_started_at is not None
    # Idempotent no-op replay: calling it again with the same (now stale) version still succeeds
    # because the wait was already recorded and nothing else needs to change.
    replay = mark_customer_unavailable_wait_started(
        booking_id=booking.id, partner_id=booked.partner.id, expected_version=waiting.version
    )
    assert (
        replay.customer_unavailable_wait_started_at == waiting.customer_unavailable_wait_started_at
    )

    attempt = record_customer_contact_attempt(
        booking_id=booking.id, partner_id=booked.partner.id, outcome="NO_ANSWER"
    )
    assert attempt.outcome == "NO_ANSWER"
    assert booked.booking.contact_attempts.count() == 1


def test_declare_late_is_a_noop_before_the_grace_deadline() -> None:
    booked = create_booked_group(key_prefix="sm-not-late")
    result = declare_booking_late(booking_id=booked.booking.id)
    assert result is None
    booked.booking.refresh_from_db()
    assert booked.booking.late_declared_at is None


def test_concurrent_en_route_commands_serialize_to_one_winner() -> None:
    booked = create_booked_group(key_prefix="sm-race")
    booking = booked.booking
    partner_id = booked.partner.id

    def attempt() -> str:
        close_old_connections()
        try:
            mark_en_route(
                booking_id=booking.id, partner_id=partner_id, expected_version=booking.version
            )
        except BookingVersionConflictApiError:
            return "conflict"
        finally:
            close_old_connections()
        return "moved"

    with ThreadPoolExecutor(max_workers=CONCURRENT_COMMANDS) as executor:
        outcomes = list(executor.map(lambda _: attempt(), range(CONCURRENT_COMMANDS)))

    assert sorted(outcomes) == ["conflict", "moved"]
    booking.refresh_from_db()
    assert booking.status == Booking.Status.EN_ROUTE
    assert booking.version == VERSION_AFTER_ONE_MOVE
    assert BookingStatusHistory.objects.filter(booking=booking).count() == 1


def test_group_completes_only_once_every_unit_reaches_a_terminal_outcome() -> None:
    booked = create_booked_group(
        slugs=("switch-socket-repair", "tap-repair"), key_prefix="sm-group"
    )
    group = booked.group
    units = list(group.units.order_by("position"))
    assert len(units) == 2

    first_booking = units[0].booking
    first_booking.status = Booking.Status.COMPLETED
    first_booking.version += 1
    first_booking.save(update_fields=("status", "version"))
    units[0].status = FulfilmentUnit.Status.COMPLETED
    units[0].version += 1
    units[0].save(update_fields=("status", "version"))

    sync_group_completion(group)
    group.refresh_from_db()
    assert group.status == BookingGroup.Status.BOOKED

    second_booking = units[1].booking
    second_booking.status = Booking.Status.PARTIALLY_COMPLETED
    second_booking.version += 1
    second_booking.save(update_fields=("status", "version"))
    units[1].status = FulfilmentUnit.Status.PARTIALLY_COMPLETED
    units[1].version += 1
    units[1].save(update_fields=("status", "version"))

    sync_group_completion(group)
    group.refresh_from_db()
    assert group.status == BookingGroup.Status.COMPLETED


def _force_unit_outcome(unit: FulfilmentUnit, *, booking_status: str, unit_status: str) -> None:
    booking = unit.booking
    booking.status = booking_status
    booking.version += 1
    booking.save(update_fields=("status", "version"))
    unit.status = unit_status
    unit.version += 1
    unit.save(update_fields=("status", "version"))


def test_a_group_whose_every_unit_was_cancelled_derives_cancelled_not_completed() -> None:
    """Nothing was delivered, so the Customer's group must not read back as `COMPLETED`."""

    booked = create_booked_group(
        slugs=("switch-socket-repair", "tap-repair"), key_prefix="sm-group-cancelled"
    )
    group = booked.group
    for unit in group.units.order_by("position"):
        _force_unit_outcome(
            unit,
            booking_status=Booking.Status.CANCELLED,
            unit_status=FulfilmentUnit.Status.CANCELLED,
        )

    sync_group_completion(group)

    group.refresh_from_db()
    assert group.status == BookingGroup.Status.CANCELLED


def test_a_group_with_one_delivered_unit_still_derives_completed() -> None:
    """One cancelled unit does not erase the visit that actually happened."""

    booked = create_booked_group(
        slugs=("switch-socket-repair", "tap-repair"), key_prefix="sm-group-mixed"
    )
    group = booked.group
    units = list(group.units.order_by("position"))
    _force_unit_outcome(
        units[0],
        booking_status=Booking.Status.CANCELLED,
        unit_status=FulfilmentUnit.Status.CANCELLED,
    )
    _force_unit_outcome(
        units[1],
        booking_status=Booking.Status.COMPLETED,
        unit_status=FulfilmentUnit.Status.COMPLETED,
    )

    sync_group_completion(group)

    group.refresh_from_db()
    assert group.status == BookingGroup.Status.COMPLETED
