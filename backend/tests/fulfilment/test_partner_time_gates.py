"""P0-1: the Partner's en-route and arrival commands are gated by the server clock.

Every boundary is pinned at production values (the module fixture sets them explicitly, so a local
environment override cannot move them): one second before a window opens, the instant it opens, the
instant it closes, and one second after. The windows are measured from `Booking.scheduled_start`:

* on the way: `start - 60 min` until arrival closes;
* arrived: `start - 30 min` until `start + max(duration, promised arrival window) + 30 min`.
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
from apps.fulfilment.exceptions import (
    BookingActionNotYetAllowedApiError,
    BookingActionWindowClosedApiError,
    BookingCommandInvalidApiError,
)
from apps.fulfilment.models import BookingStatusHistory, CustomerContactAttempt
from apps.fulfilment.services import (
    mark_arrived,
    mark_customer_unavailable_wait_started,
    mark_en_route,
    operations_assisted_outage_start,
    record_customer_contact_attempt,
)
from apps.identity.models import Role, User, UserRole
from apps.partners.models import PartnerProfile
from tests.fulfilment.conftest import BookedGroup, create_booked_group
from tests.helpers import force_role_client

pytestmark = pytest.mark.django_db(transaction=True)

_keys = itertools.count(1)
ONE_SECOND = timedelta(seconds=1)


@pytest.fixture(autouse=True)
def _production_gates(settings: SettingsWrapper) -> None:
    settings.M1_ADDRESS_UNLOCK_MINUTES = 120
    settings.M1_EN_ROUTE_OPENS_MINUTES = 60
    settings.M1_ARRIVAL_OPENS_MINUTES = 30
    settings.M1_ARRIVAL_CLOSE_GRACE_MINUTES = 30


def _booked(label: str) -> BookedGroup:
    return create_booked_group(key_prefix=f"gates-{label}-{next(_keys)}")


def _start(booked: BookedGroup) -> datetime:
    return booked.booking.scheduled_start


def _closes(booked: BookedGroup) -> datetime:
    booking = booked.booking
    minutes = max(booking.estimated_duration_minutes, booked.unit.arrival_window_minutes)
    return booking.scheduled_start + timedelta(minutes=minutes + 30)


def _en_route_at(booked: BookedGroup, instant: datetime) -> Booking:
    with freeze_time(instant):
        return mark_en_route(
            booking_id=booked.booking.id,
            partner_id=booked.partner.id,
            expected_version=booked.booking.version,
        )


def _arrive_at(booked: BookedGroup, instant: datetime) -> Booking:
    booking = booked.booking
    with freeze_time(instant):
        return mark_arrived(
            booking_id=booking.id,
            partner_id=booked.partner.id,
            expected_version=booking.version,
        )


def _partner_client(profile: PartnerProfile) -> APIClient:
    role, _created = Role.objects.get_or_create(code="partner", defaults={"name": "Partner"})
    UserRole.objects.get_or_create(user=profile.user, role=role, revoked_at=None)
    return force_role_client(user=profile.user, role_code="partner")


def _operator() -> User:
    role, _created = Role.objects.get_or_create(code="operations", defaults={"name": "Ops"})
    user = User.objects.create_user(phone_number=f"+9198760{next(_keys):05d}")
    UserRole.objects.create(user=user, role=role)
    return user


# --------------------------------------------------------------------------------------------
# On the way
# --------------------------------------------------------------------------------------------


def test_en_route_is_refused_one_second_before_it_opens() -> None:
    booked = _booked("en-route-early")
    opens_at = _start(booked) - timedelta(minutes=60)

    with pytest.raises(BookingActionNotYetAllowedApiError) as refusal:
        _en_route_at(booked, opens_at - ONE_SECOND)

    assert refusal.value.api_details == {
        "action": "MARK_EN_ROUTE",
        "opens_at": opens_at.isoformat(),
        "closes_at": _closes(booked).isoformat(),
        "server_now": (opens_at - ONE_SECOND).isoformat(),
    }
    booking = Booking.objects.get(id=booked.booking.id)
    assert booking.status == Booking.Status.CONFIRMED
    assert booking.en_route_at is None
    assert not BookingStatusHistory.objects.filter(
        booking=booking, to_status=Booking.Status.EN_ROUTE
    ).exists()


def test_en_route_is_allowed_exactly_when_it_opens() -> None:
    booked = _booked("en-route-open")
    opens_at = _start(booked) - timedelta(minutes=60)

    booking = _en_route_at(booked, opens_at)

    assert booking.status == Booking.Status.EN_ROUTE
    assert booking.en_route_at == opens_at


def test_en_route_is_allowed_at_the_instant_arrival_closes() -> None:
    booked = _booked("en-route-last")

    booking = _en_route_at(booked, _closes(booked))

    assert booking.status == Booking.Status.EN_ROUTE


def test_en_route_is_refused_one_second_after_arrival_closes() -> None:
    booked = _booked("en-route-closed")

    with pytest.raises(BookingActionWindowClosedApiError) as refusal:
        _en_route_at(booked, _closes(booked) + ONE_SECOND)

    assert refusal.value.api_details["action"] == "MARK_EN_ROUTE"
    assert refusal.value.api_details["closes_at"] == _closes(booked).isoformat()
    assert Booking.objects.get(id=booked.booking.id).status == Booking.Status.CONFIRMED


def test_a_command_the_state_machine_refuses_gets_that_refusal_not_a_clock_one() -> None:
    """Already on the way and tapping it again a day early is a state error, not "too early"."""

    booked = _booked("en-route-twice")
    _en_route_at(booked, _start(booked) - timedelta(minutes=60))

    with pytest.raises(BookingCommandInvalidApiError):
        _en_route_at(booked, _start(booked) - timedelta(days=1))


# --------------------------------------------------------------------------------------------
# Arrived
# --------------------------------------------------------------------------------------------


def test_arrival_is_refused_one_second_before_it_opens() -> None:
    booked = _booked("arrive-early")
    _en_route_at(booked, _start(booked) - timedelta(minutes=60))
    opens_at = _start(booked) - timedelta(minutes=30)

    with pytest.raises(BookingActionNotYetAllowedApiError) as refusal:
        _arrive_at(booked, opens_at - ONE_SECOND)

    assert refusal.value.api_details["action"] == "MARK_ARRIVED"
    assert refusal.value.api_details["opens_at"] == opens_at.isoformat()
    booking = Booking.objects.get(id=booked.booking.id)
    assert booking.status == Booking.Status.EN_ROUTE
    assert booking.arrived_at is None


def test_arrival_is_allowed_exactly_when_it_opens() -> None:
    booked = _booked("arrive-open")
    _en_route_at(booked, _start(booked) - timedelta(minutes=60))
    opens_at = _start(booked) - timedelta(minutes=30)

    booking = _arrive_at(booked, opens_at)

    assert booking.status == Booking.Status.ARRIVED
    assert booking.arrived_at == opens_at


def test_arrival_is_allowed_at_the_instant_it_closes() -> None:
    booked = _booked("arrive-last")
    _en_route_at(booked, _start(booked))

    booking = _arrive_at(booked, _closes(booked))

    assert booking.status == Booking.Status.ARRIVED


def test_arrival_is_refused_one_second_after_it_closes() -> None:
    booked = _booked("arrive-closed")
    _en_route_at(booked, _start(booked))

    with pytest.raises(BookingActionWindowClosedApiError) as refusal:
        _arrive_at(booked, _closes(booked) + ONE_SECOND)

    assert refusal.value.api_details["action"] == "MARK_ARRIVED"
    assert Booking.objects.get(id=booked.booking.id).status == Booking.Status.EN_ROUTE


# --------------------------------------------------------------------------------------------
# Over HTTP: the envelope, the retry and the projection
# --------------------------------------------------------------------------------------------


def test_early_en_route_is_a_409_with_the_window_and_the_same_key_works_once_it_opens() -> None:
    booked = _booked("http-early")
    client = _partner_client(booked.partner)
    opens_at = _start(booked) - timedelta(minutes=60)
    url = f"/api/v1/partner/bookings/{booked.booking.id}/en-route/"
    payload = {"expected_version": booked.booking.version}

    with freeze_time(opens_at - ONE_SECOND):
        early = client.post(url, payload, format="json", HTTP_IDEMPOTENCY_KEY="gate-retry")

    assert early.status_code == HTTPStatus.CONFLICT
    error = early.json()["error"]
    assert error["code"] == "booking_action_not_yet_allowed"
    assert error["retryable"] is True
    assert error["details"]["action"] == "MARK_EN_ROUTE"
    assert error["details"]["opens_at"] == opens_at.isoformat()
    assert error["details"]["closes_at"] == _closes(booked).isoformat()
    assert error["details"]["server_now"] == (opens_at - ONE_SECOND).isoformat()

    # The refusal rolled its idempotency record back, so the identical retry runs fresh.
    with freeze_time(opens_at):
        retried = client.post(url, payload, format="json", HTTP_IDEMPOTENCY_KEY="gate-retry")

    assert retried.status_code == HTTPStatus.OK
    assert retried.json()["status"] == Booking.Status.EN_ROUTE
    assert "Idempotent-Replay" not in retried


def test_closed_window_is_a_non_retryable_409() -> None:
    booked = _booked("http-closed")
    client = _partner_client(booked.partner)

    with freeze_time(_closes(booked) + ONE_SECOND):
        response = client.post(
            f"/api/v1/partner/bookings/{booked.booking.id}/en-route/",
            {"expected_version": booked.booking.version},
            format="json",
            HTTP_IDEMPOTENCY_KEY="gate-closed",
        )

    assert response.status_code == HTTPStatus.CONFLICT
    assert response.json()["error"]["code"] == "booking_action_window_closed"
    assert response.json()["error"]["retryable"] is False


def test_projection_publishes_the_gates_and_only_the_actions_open_now() -> None:
    booked = _booked("http-projection")
    client = _partner_client(booked.partner)
    start = _start(booked)
    url = f"/api/v1/partner/bookings/{booked.booking.id}/"

    with freeze_time(start - timedelta(minutes=60) - ONE_SECOND):
        before = client.get(url).json()
    with freeze_time(start - timedelta(minutes=60)):
        at_open = client.get(url).json()

    assert before["gates"] == {
        "address_unlocks_at": (start - timedelta(minutes=120)).isoformat(),
        "en_route_opens_at": (start - timedelta(minutes=60)).isoformat(),
        "en_route_closes_at": _closes(booked).isoformat(),
        "arrival_opens_at": (start - timedelta(minutes=30)).isoformat(),
        "arrival_closes_at": _closes(booked).isoformat(),
    }
    assert before["allowed_actions"] == ["PARTNER_RELEASE"]
    assert at_open["allowed_actions"] == ["MARK_EN_ROUTE", "PARTNER_RELEASE"]


# --------------------------------------------------------------------------------------------
# The audited override
# --------------------------------------------------------------------------------------------


def test_operations_outage_start_overrides_the_gate_and_records_that_it_did() -> None:
    booked = _booked("override")
    operator = _operator()
    a_day_early = _start(booked) - timedelta(days=1)

    with freeze_time(a_day_early):
        booking = operations_assisted_outage_start(
            booking_id=booked.booking.id,
            operator=operator,
            outage_reason="Partner app down; partner confirmed by phone",
            expected_version=booked.booking.version,
        )

    assert booking.status == Booking.Status.EN_ROUTE
    history = BookingStatusHistory.objects.get(booking=booking, to_status=Booking.Status.EN_ROUTE)
    assert history.actor == operator
    assert history.context["assisted"] is True
    assert history.context["partner_gate_open"] is False


# --------------------------------------------------------------------------------------------
# The after-arrival cancellation band
# --------------------------------------------------------------------------------------------


def _unit_gross(booked: BookedGroup) -> int:
    from apps.commerce.models import PaymentAllocation  # noqa: PLC0415

    return sum(
        PaymentAllocation.objects.filter(fulfilment_unit=booked.unit).values_list(
            "amount_paise", flat=True
        )
    )


def _cancel_at(booked: BookedGroup, instant: datetime) -> int:
    booking = Booking.objects.get(id=booked.booking.id)
    with freeze_time(instant):
        _cancelled, refunds = cancel_booking(
            booking_id=booking.id,
            customer_id=booked.customer.id,
            expected_version=booking.version,
            reason="changed my mind",
            idempotency_key=f"gate-cancel-{booking.id}",
        )
    return sum(refund.amount_paise for refund in refunds)


def test_after_arrival_fee_needs_a_checked_arrival_the_wait_and_both_contact_attempts() -> None:
    booked = _booked("fee-proven")
    start = _start(booked)
    _en_route_at(booked, start - timedelta(minutes=60))
    _arrive_at(booked, start - timedelta(minutes=5))
    booking = Booking.objects.get(id=booked.booking.id)
    with freeze_time(start):
        booking = mark_customer_unavailable_wait_started(
            booking_id=booking.id, partner_id=booked.partner.id, expected_version=booking.version
        )
        record_customer_contact_attempt(
            booking_id=booking.id,
            partner_id=booked.partner.id,
            outcome=CustomerContactAttempt.Outcome.NO_ANSWER,
        )
    with freeze_time(start + timedelta(minutes=5)):
        record_customer_contact_attempt(
            booking_id=booking.id,
            partner_id=booked.partner.id,
            outcome=CustomerContactAttempt.Outcome.NO_ANSWER,
        )

    refunded = _cancel_at(booked, start + timedelta(minutes=10))

    assert refunded == _unit_gross(booked) - 14_900


def test_a_door_cancellation_without_the_wait_pays_the_time_band_not_the_arrival_fee() -> None:
    booked = _booked("fee-door")
    start = _start(booked)
    _en_route_at(booked, start - timedelta(minutes=60))
    _arrive_at(booked, start - timedelta(minutes=5))

    refunded = _cancel_at(booked, start)

    # Under two hours to the start and no wait/contact proof: the ₹99 band.
    assert refunded == _unit_gross(booked) - 9_900


def test_contact_attempts_bunched_at_the_start_of_the_wait_do_not_prove_the_second_one() -> None:
    booked = _booked("fee-bunched")
    start = _start(booked)
    _en_route_at(booked, start - timedelta(minutes=60))
    _arrive_at(booked, start - timedelta(minutes=5))
    booking = Booking.objects.get(id=booked.booking.id)
    with freeze_time(start):
        booking = mark_customer_unavailable_wait_started(
            booking_id=booking.id, partner_id=booked.partner.id, expected_version=booking.version
        )
        for _attempt in range(2):
            record_customer_contact_attempt(
                booking_id=booking.id,
                partner_id=booked.partner.id,
                outcome=CustomerContactAttempt.Outcome.NO_ANSWER,
            )

    refunded = _cancel_at(booked, start + timedelta(minutes=10))

    assert refunded == _unit_gross(booked) - 9_900


def test_an_override_arrival_outside_the_window_never_earns_the_arrival_fee() -> None:
    booked = _booked("fee-override")
    operator = _operator()
    start = _start(booked)
    booking = booked.booking
    with freeze_time(start - timedelta(hours=5)):
        booking = operations_assisted_outage_start(
            booking_id=booking.id,
            operator=operator,
            outage_reason="outage",
            expected_version=booking.version,
        )
        booking = operations_assisted_outage_start(
            booking_id=booking.id,
            operator=operator,
            outage_reason="outage",
            expected_version=booking.version,
        )
        assert booking.status == Booking.Status.ARRIVED
        booking = mark_customer_unavailable_wait_started(
            booking_id=booking.id, partner_id=booked.partner.id, expected_version=booking.version
        )
        record_customer_contact_attempt(
            booking_id=booking.id,
            partner_id=booked.partner.id,
            outcome=CustomerContactAttempt.Outcome.NO_ANSWER,
        )
    with freeze_time(start - timedelta(hours=5) + timedelta(minutes=5)):
        record_customer_contact_attempt(
            booking_id=booking.id,
            partner_id=booked.partner.id,
            outcome=CustomerContactAttempt.Outcome.NO_ANSWER,
        )

    refunded = _cancel_at(booked, start - timedelta(hours=4))

    # Arrival five hours early is outside the arrival window, so the band falls back to time:
    # four hours out is the 24-to-2-hour band.
    assert refunded == _unit_gross(booked) - 4_900
