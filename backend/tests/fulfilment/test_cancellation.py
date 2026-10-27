"""Customer cancel / reschedule / address-change: fee ladder, refunds, typed conflicts."""

from datetime import datetime, time, timedelta
from http import HTTPStatus
from zoneinfo import ZoneInfo

import pytest
from django.utils import timezone
from freezegun import freeze_time

from apps.carts.models import BookingGroup, FulfilmentUnit
from apps.commerce.models import Booking, PaymentAllocation, Refund
from apps.fulfilment.cancellation import (
    cancel_booking,
    change_booking_group_address,
    reschedule_booking,
)
from apps.fulfilment.exceptions import (
    BookingCommandInvalidApiError,
    OutsideServiceableAreaApiError,
    PartnerUnavailableApiError,
)
from apps.fulfilment.models import CustomerContactAttempt
from apps.fulfilment.services import (
    mark_arrived,
    mark_customer_unavailable_wait_started,
    mark_en_route,
    record_customer_contact_attempt,
)
from apps.locations.models import Address
from tests.carts.test_fulfilment_planning import _address_payload
from tests.fulfilment.conftest import create_booked_group

pytestmark = [
    pytest.mark.django_db(transaction=True),
    # Walks visits booked for tomorrow through en route and arrival; the clock gates on those
    # steps are tested in tests/fulfilment/test_partner_time_gates.py.
    pytest.mark.usefixtures("partner_gates_open"),
]


def test_cancel_more_than_24_hours_out_is_fee_free_and_refunds_everything() -> None:
    booked = create_booked_group(key_prefix="cancel-free")
    unit = booked.unit
    unit.requested_start = timezone.now() + timedelta(days=3)
    unit.save(update_fields=("requested_start",))
    booking = booked.booking
    total_paise = PaymentAllocation.objects.filter(fulfilment_unit=booked.unit).count()
    assert total_paise > 0

    cancelled, refunds = cancel_booking(
        booking_id=booking.id,
        customer_id=booked.customer.id,
        expected_version=booking.version,
        reason="change of plans",
        idempotency_key="cancel-free-key",
    )

    assert cancelled.status == Booking.Status.CANCELLED
    assert cancelled.cancellation_reason == "change of plans"
    assert len(refunds) == 1
    refund = refunds[0]
    assert refund.status == Refund.Status.REQUESTED
    unit_gross = sum(
        PaymentAllocation.objects.filter(fulfilment_unit=booked.unit).values_list(
            "amount_paise", flat=True
        )
    )
    assert refund.amount_paise == unit_gross
    booked.unit.refresh_from_db()
    assert booked.unit.status == FulfilmentUnit.Status.CANCELLED


def test_cancellation_is_idempotent_on_replay() -> None:
    booked = create_booked_group(key_prefix="cancel-replay")
    booking = booked.booking

    _first_booking, first_refunds = cancel_booking(
        booking_id=booking.id,
        customer_id=booked.customer.id,
        expected_version=booking.version,
        reason="replay test",
        idempotency_key="cancel-replay-key",
    )
    booking.refresh_from_db()
    with pytest.raises(BookingCommandInvalidApiError):
        # A second, distinct attempt against the now-cancelled Booking is refused: the caller
        # is responsible for the version guard + idempotency-key replay at the command boundary,
        # exactly like the BE-07 offer/recovery commands.
        cancel_booking(
            booking_id=booking.id,
            customer_id=booked.customer.id,
            expected_version=booking.version,
            reason="replay test",
            idempotency_key="cancel-replay-key",
        )
    assert Refund.objects.filter(payment_attempt=first_refunds[0].payment_attempt).count() == 1


def test_cancel_inside_two_hours_charges_the_short_notice_fee() -> None:
    booked = create_booked_group(key_prefix="cancel-fee")
    unit = booked.unit
    unit.requested_start = timezone.now() + timedelta(minutes=30)
    unit.save(update_fields=("requested_start",))
    booking = booked.booking

    _cancelled, refunds = cancel_booking(
        booking_id=booking.id,
        customer_id=booked.customer.id,
        expected_version=booking.version,
        reason="last minute",
        idempotency_key="cancel-fee-key",
    )

    unit_gross = sum(
        PaymentAllocation.objects.filter(fulfilment_unit=booked.unit).values_list(
            "amount_paise", flat=True
        )
    )
    assert len(refunds) == 1
    refund = refunds[0]
    assert refund.amount_paise == unit_gross - 9900


def test_cancel_after_partner_declared_late_waives_the_fee() -> None:
    booked = create_booked_group(key_prefix="cancel-late-waiver")
    unit = booked.unit
    unit.requested_start = timezone.now() + timedelta(minutes=30)
    unit.save(update_fields=("requested_start",))
    booking = booked.booking
    booking.late_declared_at = timezone.now()
    booking.save(update_fields=("late_declared_at",))

    _cancelled, refunds = cancel_booking(
        booking_id=booking.id,
        customer_id=booked.customer.id,
        expected_version=booking.version,
        reason="partner was late",
        idempotency_key="cancel-late-key",
    )

    unit_gross = sum(
        PaymentAllocation.objects.filter(fulfilment_unit=booked.unit).values_list(
            "amount_paise", flat=True
        )
    )
    assert len(refunds) == 1
    refund = refunds[0]
    assert refund.amount_paise == unit_gross


def test_cancel_after_verified_arrival_charges_the_arrival_fee() -> None:
    """The band needs the wait and both contact attempts, not merely an arrival (P0-1)."""

    booked = create_booked_group(key_prefix="cancel-arrival")
    booking = mark_en_route(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        expected_version=booked.booking.version,
    )
    booking = mark_arrived(
        booking_id=booking.id, partner_id=booked.partner.id, expected_version=booking.version
    )
    booking = mark_customer_unavailable_wait_started(
        booking_id=booking.id, partner_id=booked.partner.id, expected_version=booking.version
    )
    record_customer_contact_attempt(
        booking_id=booking.id,
        partner_id=booked.partner.id,
        outcome=CustomerContactAttempt.Outcome.NO_ANSWER,
    )
    with freeze_time(timezone.now() + timedelta(minutes=5)):
        record_customer_contact_attempt(
            booking_id=booking.id,
            partner_id=booked.partner.id,
            outcome=CustomerContactAttempt.Outcome.NO_ANSWER,
        )

    with freeze_time(timezone.now() + timedelta(minutes=11)):
        _cancelled, refunds = cancel_booking(
            booking_id=booking.id,
            customer_id=booked.customer.id,
            expected_version=booking.version,
            reason="customer changed mind on-site",
            idempotency_key="cancel-arrival-key",
        )

    unit_gross = sum(
        PaymentAllocation.objects.filter(fulfilment_unit=booked.unit).values_list(
            "amount_paise", flat=True
        )
    )
    assert len(refunds) == 1
    refund = refunds[0]
    assert refund.amount_paise == unit_gross - 14900


def test_cancel_after_work_started_is_refused() -> None:
    booked = create_booked_group(key_prefix="cancel-too-late")
    booking = mark_en_route(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        expected_version=booked.booking.version,
    )
    booking = mark_arrived(
        booking_id=booking.id, partner_id=booked.partner.id, expected_version=booking.version
    )
    booking.status = Booking.Status.IN_PROGRESS
    booking.version += 1
    booking.save(update_fields=("status", "version"))

    with pytest.raises(BookingCommandInvalidApiError):
        cancel_booking(
            booking_id=booking.id,
            customer_id=booked.customer.id,
            expected_version=booking.version,
            reason="too late",
            idempotency_key="cancel-too-late-key",
        )


def test_reschedule_with_notice_moves_the_unit_and_reservation() -> None:
    booked = create_booked_group(key_prefix="reschedule-ok")
    unit = booked.unit
    # Shift by whole weeks so the Partner's weekday-scoped availability rule still matches.
    unit.requested_start = unit.requested_start + timedelta(days=14)
    unit.save(update_fields=("requested_start",))
    booking = booked.booking
    new_start = unit.requested_start + timedelta(days=7)

    rescheduled = reschedule_booking(
        booking_id=booking.id,
        customer_id=booked.customer.id,
        expected_version=booking.version,
        new_requested_start=new_start,
        idempotency_key="reschedule-ok-key",
    )

    assert rescheduled.scheduled_start == new_start
    booked.unit.refresh_from_db()
    assert booked.unit.requested_start == new_start


def test_reschedule_into_the_past_is_refused() -> None:
    """A past start would make the lateness watchdog declare an on-time Partner late.

    `is_partner_late` is derived from `requested_start`, `declare_booking_late` writes a flag
    that never clears, and a late Partner waives every cancellation fee — so accepting a
    backdated reschedule hands the Customer a permanent full-refund switch, and moves the
    Partner's held slot into the past while the Booking still claims it.
    """

    booked = create_booked_group(key_prefix="reschedule-past")
    unit = booked.unit
    unit.requested_start = unit.requested_start + timedelta(days=14)
    unit.save(update_fields=("requested_start",))
    booking = booked.booking
    original_start = unit.requested_start
    # Whole weeks back, so the Partner's weekday-scoped availability rule still matches and the
    # only thing standing between the Customer and a backdated Booking is the command itself.
    backdated = original_start - timedelta(days=21)

    with pytest.raises(BookingCommandInvalidApiError):
        reschedule_booking(
            booking_id=booking.id,
            customer_id=booked.customer.id,
            expected_version=booking.version,
            new_requested_start=backdated,
            idempotency_key="reschedule-past-key",
        )

    booked.unit.refresh_from_db()
    booking.refresh_from_db()
    assert booked.unit.requested_start == original_start
    assert booking.late_declared_at is None


def test_reschedule_inside_the_fee_window_is_refused_without_touching_the_booking() -> None:
    booked = create_booked_group(key_prefix="reschedule-fee-window")
    unit = booked.unit
    unit.requested_start = timezone.now() + timedelta(minutes=30)
    unit.save(update_fields=("requested_start",))
    booking = booked.booking
    original_start = unit.requested_start

    with pytest.raises(BookingCommandInvalidApiError):
        reschedule_booking(
            booking_id=booking.id,
            customer_id=booked.customer.id,
            expected_version=booking.version,
            new_requested_start=original_start + timedelta(days=1),
            idempotency_key="reschedule-fee-window-key",
        )
    booked.unit.refresh_from_db()
    assert booked.unit.requested_start == original_start


def test_reschedule_when_partner_is_unavailable_is_a_typed_conflict() -> None:
    booked = create_booked_group(key_prefix="reschedule-unavailable")
    unit = booked.unit
    unit.requested_start = timezone.now() + timedelta(days=3)
    unit.save(update_fields=("requested_start",))
    booking = booked.booking
    # Outside the Partner's registered 08:00-20:00 weekly availability window, regardless of
    # which weekday it lands on.
    future_date = (timezone.now() + timedelta(days=10)).astimezone(ZoneInfo("Asia/Kolkata")).date()
    far_future = datetime.combine(future_date, time(2), tzinfo=ZoneInfo("Asia/Kolkata"))

    with pytest.raises(PartnerUnavailableApiError):
        reschedule_booking(
            booking_id=booking.id,
            customer_id=booked.customer.id,
            expected_version=booking.version,
            new_requested_start=far_future,
            idempotency_key="reschedule-unavailable-key",
        )


def test_address_change_within_the_same_service_area_succeeds() -> None:
    booked = create_booked_group(key_prefix="address-change-ok")
    payload = _address_payload()
    payload["label"] = "Office"
    payload["line1"] = "2 Vsolve Street"
    response = booked.client.post("/api/v1/addresses/", payload, format="json")
    assert response.status_code == HTTPStatus.CREATED
    new_address_id = response.json()["id"]

    group = change_booking_group_address(
        group_id=booked.group.id,
        customer_id=booked.customer.id,
        expected_version=booked.group.version,
        new_address_id=new_address_id,
        idempotency_key="address-change-ok-key",
    )
    assert str(group.address_id) == new_address_id


def test_address_change_outside_the_service_area_is_refused() -> None:
    booked = create_booked_group(key_prefix="address-change-outside")
    outside_address = Address.objects.create(
        customer=booked.customer,
        label="Elsewhere",
        line1="1 Nowhere Road",
        locality="Nowhere",
        city="Nowhere",
        state="Nowhere",
        postal_code="999999",
        latitude="0",
        longitude="0",
        confirmed_at=timezone.now(),
    )

    with pytest.raises(OutsideServiceableAreaApiError):
        change_booking_group_address(
            group_id=booked.group.id,
            customer_id=booked.customer.id,
            expected_version=booked.group.version,
            new_address_id=outside_address.id,
            idempotency_key="address-change-outside-key",
        )


def test_address_change_requires_group_to_be_booked() -> None:
    booked = create_booked_group(key_prefix="address-change-not-booked")
    booked.group.status = BookingGroup.Status.MATCHING
    booked.group.save(update_fields=("status",))

    with pytest.raises(BookingCommandInvalidApiError):
        change_booking_group_address(
            group_id=booked.group.id,
            customer_id=booked.customer.id,
            expected_version=booked.group.version,
            new_address_id=booked.group.address_id,
            idempotency_key="address-change-not-booked-key",
        )
