"""Start OTP: single-use, rate-limited, hashed challenge; Operations-assisted outage fallback."""

import pytest
from django.core.cache import cache

from apps.commerce.models import Booking
from apps.fulfilment.exceptions import BookingCommandInvalidApiError, OtpInvalidApiError
from apps.fulfilment.models import BookingOtp, WorkSession, WorkTask
from apps.fulfilment.otp import (
    OtpRateLimitError,
    operations_assisted_start,
    request_start_otp,
    verify_start_otp,
)
from apps.fulfilment.services import mark_arrived, mark_en_route
from apps.identity.models import User
from tests.fulfilment.conftest import create_booked_group

pytestmark = pytest.mark.django_db(transaction=True)


def _arrived(key_prefix: str) -> object:
    booked = create_booked_group(key_prefix=key_prefix)
    booking = mark_en_route(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        expected_version=booked.booking.version,
    )
    booking = mark_arrived(
        booking_id=booking.id, partner_id=booked.partner.id, expected_version=booking.version
    )
    booked.booking.refresh_from_db()
    return booked


def test_request_start_otp_requires_arrival_first() -> None:
    booked = create_booked_group(key_prefix="otp-not-arrived")
    with pytest.raises(BookingCommandInvalidApiError):
        request_start_otp(
            booking_id=booked.booking.id,
            customer_id=booked.customer.id,
            expected_version=booked.booking.version,
        )


def test_request_then_verify_start_otp_starts_work_and_materializes_tasks() -> None:
    booked = _arrived("otp-happy")
    booking = booked.booking

    issued = request_start_otp(
        booking_id=booking.id, customer_id=booked.customer.id, expected_version=booking.version
    )
    assert issued.development_code is not None
    assert len(issued.development_code) == 6  # noqa: PLR2004

    started = verify_start_otp(
        booking_id=booking.id,
        partner_id=booked.partner.id,
        expected_version=booking.version,
        code=issued.development_code,
    )
    assert started.status == Booking.Status.IN_PROGRESS
    session = WorkSession.objects.get(booking=started)
    assert session.started_via == WorkSession.StartedVia.CUSTOMER_OTP
    assert session.started_at is not None

    tasks = list(WorkTask.objects.filter(booking=started, kind=WorkTask.Kind.ORIGINAL))
    assert len(tasks) == booked.unit.lines.count()
    assert all(task.amount_paise > 0 for task in tasks)

    otp = BookingOtp.objects.get(booking=started)
    assert otp.is_consumed


def test_verify_start_otp_with_wrong_code_is_refused_and_counts_the_attempt() -> None:
    booked = _arrived("otp-wrong-code")
    booking = booked.booking
    request_start_otp(
        booking_id=booking.id, customer_id=booked.customer.id, expected_version=booking.version
    )

    with pytest.raises(OtpInvalidApiError):
        verify_start_otp(
            booking_id=booking.id,
            partner_id=booked.partner.id,
            expected_version=booking.version,
            code="000000",
        )
    otp = BookingOtp.objects.get(booking=booking)
    assert otp.failed_attempts == 1
    booking.refresh_from_db()
    assert booking.status == Booking.Status.ARRIVED


def test_verify_start_otp_locks_out_after_max_attempts() -> None:
    booked = _arrived("otp-lockout")
    booking = booked.booking
    request_start_otp(
        booking_id=booking.id, customer_id=booked.customer.id, expected_version=booking.version
    )
    otp = BookingOtp.objects.get(booking=booking)

    for _ in range(otp.max_attempts):
        with pytest.raises(OtpInvalidApiError):
            verify_start_otp(
                booking_id=booking.id,
                partner_id=booked.partner.id,
                expected_version=booking.version,
                code="000000",
            )

    otp.refresh_from_db()
    assert otp.is_locked
    with pytest.raises(OtpInvalidApiError):
        verify_start_otp(
            booking_id=booking.id,
            partner_id=booked.partner.id,
            expected_version=booking.version,
            code="000000",
        )


def test_a_fresh_request_retires_the_previous_active_challenge() -> None:
    booked = _arrived("otp-superseded")
    booking = booked.booking
    first = request_start_otp(
        booking_id=booking.id, customer_id=booked.customer.id, expected_version=booking.version
    )

    with pytest.raises(OtpInvalidApiError):
        verify_start_otp(
            booking_id=booking.id,
            partner_id=booked.partner.id,
            expected_version=booking.version,
            code="999999",
        )
    first_otp = BookingOtp.objects.get(id=first.otp.id)
    assert not first_otp.is_expired  # first attempt above used a wrong code, not expiry

    cache.delete(f"booking-otp:cooldown:{booking.id}")
    request_start_otp(
        booking_id=booking.id, customer_id=booked.customer.id, expected_version=booking.version
    )
    first_otp.refresh_from_db()
    assert first_otp.is_expired


def test_request_start_otp_is_rate_limited_against_resend_spam() -> None:
    booked = _arrived("otp-rate-limit")
    booking = booked.booking
    request_start_otp(
        booking_id=booking.id, customer_id=booked.customer.id, expected_version=booking.version
    )
    with pytest.raises(OtpRateLimitError):
        request_start_otp(
            booking_id=booking.id, customer_id=booked.customer.id, expected_version=booking.version
        )


def test_operations_assisted_start_requires_a_reason() -> None:
    booked = _arrived("otp-assisted-blank")
    operator = User.objects.create_user(phone_number="+919821000001")
    with pytest.raises(BookingCommandInvalidApiError):
        operations_assisted_start(
            booking_id=booked.booking.id,
            operator=operator,
            outage_reason="  ",
            expected_version=booked.booking.version,
        )


def test_operations_assisted_start_moves_to_in_progress_and_audits_the_outage() -> None:
    booked = _arrived("otp-assisted-ok")
    operator = User.objects.create_user(phone_number="+919821000002")

    started = operations_assisted_start(
        booking_id=booked.booking.id,
        operator=operator,
        outage_reason="SMS provider outage confirmed with Partner by phone.",
        expected_version=booked.booking.version,
    )
    assert started.status == Booking.Status.IN_PROGRESS
    session = WorkSession.objects.get(booking=started)
    assert session.started_via == WorkSession.StartedVia.OPERATIONS_ASSISTED
    assert session.assisted_by_id == operator.id
    assert "outage" in session.assisted_reason

    tasks = WorkTask.objects.filter(booking=started, kind=WorkTask.Kind.ORIGINAL).count()
    assert tasks == booked.unit.lines.count()


def test_verify_start_otp_after_work_already_started_is_refused() -> None:
    booked = _arrived("otp-already-started")
    booking = booked.booking
    issued = request_start_otp(
        booking_id=booking.id, customer_id=booked.customer.id, expected_version=booking.version
    )
    started = verify_start_otp(
        booking_id=booking.id,
        partner_id=booked.partner.id,
        expected_version=booking.version,
        code=issued.development_code,
    )

    with pytest.raises(BookingCommandInvalidApiError):
        request_start_otp(
            booking_id=started.id, customer_id=booked.customer.id, expected_version=started.version
        )
