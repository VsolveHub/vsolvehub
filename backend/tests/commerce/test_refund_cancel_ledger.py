"""T5/T6: full refund success cancels capacity and reverses settled earnings.

T5 — `_apply_refund_provider_result` on a full refund cancels the linked booking
and releases FulfilmentUnit / AssetReservation / UnitReservation by purpose.
T6 — when a PartnerLedgerEntry EARNING already exists, append a REVERSAL via
`record_adjustment` (idempotent).
"""

from __future__ import annotations

import itertools
from datetime import date, timedelta
from uuid import uuid4

import pytest
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from apps.assignments.models import Reservation
from apps.catalog.models import (
    A7VariantConfiguration,
    A9VariantConfiguration,
    Category,
    Service,
    ServiceVariant,
    Subcategory,
)
from apps.commerce.models import Booking, PaymentAttempt, Refund
from apps.commerce.providers import ProviderRefund
from apps.commerce.services.refunds import (
    _apply_refund_provider_result,
    request_standalone_refund,
    request_unit_refund,
    submit_refund,
)
from apps.fulfilment.completion import OutcomeInput, confirm_completion, submit_completion
from apps.fulfilment.models import WorkOutcome, WorkTask
from apps.fulfilment.otp import operations_assisted_start
from apps.fulfilment.services import mark_arrived, mark_en_route
from apps.partners.models import PartnerApplication, PartnerCapability, PartnerProfile
from apps.payouts.models import PartnerLedgerEntry
from apps.payouts.services import settle_booking_earning
from apps.rental.models import AssetReservation, RentalBooking, RentalDeposit
from apps.rental.services import (
    create_asset,
    create_booking,
    mark_deposit_held,
    moderate_asset,
    submit_asset,
)
from apps.stay.models import Property, StayReservation, Unit, UnitReservation
from apps.stay.services import (
    confirm_reservation_payment,
    create_reservation,
    initiate_reservation_payment,
)
from tests.fulfilment.conftest import BookedGroup, create_booked_group

User = get_user_model()

pytestmark = pytest.mark.django_db(transaction=True)

_operator_sequence = itertools.count(1)


def _operator() -> object:
    return User.objects.create_user(phone_number=f"+91987{next(_operator_sequence):07d}")


def _capture_standalone(attempt: PaymentAttempt, *, payment_id: str) -> PaymentAttempt:
    attempt.provider = "fake"
    attempt.provider_payment_id = payment_id
    attempt.status = PaymentAttempt.Status.CAPTURED
    attempt.captured_at = timezone.now()
    attempt.save(
        update_fields=(
            "provider",
            "provider_payment_id",
            "status",
            "captured_at",
            "updated_at",
        )
    )
    return attempt


def _full_refund_via_provider(*, attempt: PaymentAttempt, reason: str, actor_id) -> Refund:
    refund = request_standalone_refund(
        payment_attempt_id=attempt.id,
        amount_paise=attempt.amount_paise,
        reason_code=reason,
        idempotency_key=f"{reason}:{attempt.id}:{uuid4().hex[:8]}",
        requested_by_id=actor_id,
    )
    return submit_refund(refund_id=refund.id)


# ---------------------------------------------------------------------------
# T5 — BOOKING_GROUP full refund cancels + releases capacity
# ---------------------------------------------------------------------------


def test_full_booking_group_refund_cancels_booking_and_releases_reservation() -> None:
    booked = create_booked_group(key_prefix="t5-bg-cancel")
    booking = booked.booking
    assert booking.status == Booking.Status.CONFIRMED
    assert booking.reservation_id is not None

    attempt = PaymentAttempt.objects.filter(
        checkout=booked.checkout, status=PaymentAttempt.Status.CAPTURED
    ).get()
    unit_ids = list(booked.group.units.values_list("id", flat=True))
    refund = request_unit_refund(
        order_id=booked.order.id,
        unit_ids=unit_ids,
        reason_code="ops_full_refund_cancel",
        idempotency_key="t5-bg-cancel-refund",
        requested_by_id=booked.customer.id,
    )
    submitted = submit_refund(refund_id=refund.id)

    assert submitted.status == Refund.Status.SUCCEEDED
    attempt.refresh_from_db()
    assert attempt.status == PaymentAttempt.Status.REFUNDED

    booking.refresh_from_db()
    assert booking.status == Booking.Status.CANCELLED
    booked.unit.refresh_from_db()
    assert booked.unit.status == "CANCELLED"

    reservation = Reservation.objects.get(id=booking.reservation_id)
    assert reservation.status == Reservation.Status.RELEASED


def test_partial_booking_group_refund_does_not_cancel() -> None:
    booked = create_booked_group(
        slugs=("switch-socket-repair", "tap-repair"),
        key_prefix="t5-bg-partial",
    )
    units = list(booked.group.units.order_by("position"))
    assert len(units) == 2
    first_unit = units[0]

    refund = request_unit_refund(
        order_id=booked.order.id,
        unit_ids=[first_unit.id],
        reason_code="ops_partial_refund",
        idempotency_key="t5-bg-partial-refund",
        requested_by_id=booked.customer.id,
    )
    submitted = submit_refund(refund_id=refund.id)
    assert submitted.status == Refund.Status.SUCCEEDED

    for unit in units:
        unit.refresh_from_db()
        booking = unit.booking
        assert booking.status == Booking.Status.CONFIRMED


# ---------------------------------------------------------------------------
# T5 — A7 rental full refund cancels + releases AssetReservation
# ---------------------------------------------------------------------------


def test_full_rental_refund_cancels_booking_and_releases_asset_reservation() -> None:
    category = Category.objects.create(slug="rental-t5", name="Rental T5")
    sub = Subcategory.objects.create(category=category, slug="tools-t5", name="Tools")
    service = Service.objects.create(
        subcategory=sub, slug="drill-t5", name="Drill", status=Service.Status.ACTIVE
    )
    variant = ServiceVariant.objects.create(
        service=service,
        code="drill-rental-t5",
        name="Drill rental T5",
        pricing_strategy=ServiceVariant.PricingStrategy.FIXED,
        booking_archetype=ServiceVariant.BookingArchetype.A7_RENTAL,
        required_skill_code="rental",
        tax_category_code="rental",
    )
    A7VariantConfiguration.objects.create(
        variant=variant,
        version=1,
        status=A7VariantConfiguration.Status.ACTIVE,
        default_deposit_paise=100000,
    )
    owner = User.objects.create(phone_number="+919944440001", full_name="Owner T5")
    partner = PartnerProfile.objects.create(user=owner, display_name="Owner T5 Co")
    PartnerApplication.objects.create(partner=partner, status=PartnerApplication.Status.APPROVED)
    PartnerCapability.objects.create(
        partner=partner,
        variant=variant,
        archetype=ServiceVariant.BookingArchetype.A7_RENTAL,
        status=PartnerCapability.Status.APPROVED,
    )
    customer = User.objects.create(phone_number="+919944440002", full_name="Customer T5")

    asset = create_asset(
        partner=partner,
        variant_id=variant.id,
        title="T5 Drill",
        daily_rate_paise=50000,
        deposit_paise=100000,
    )
    submit_asset(asset=asset, partner=partner)
    moderate_asset(asset=asset, actor=owner, action="APPROVE", reason="ok")
    start = timezone.localdate() + timedelta(days=1)
    booking = create_booking(
        customer=customer,
        asset_id=asset.id,
        start_date=start,
        end_date=start + timedelta(days=2),
    )
    attempt = booking.deposit.payment_attempt
    assert attempt is not None
    _capture_standalone(attempt, payment_id=f"fake_rental_t5_{booking.id.hex[:8]}")
    with transaction.atomic():
        mark_deposit_held(payment_attempt_id=attempt.id)
    booking.refresh_from_db()
    assert booking.status == RentalBooking.Status.CONFIRMED

    refund = _full_refund_via_provider(
        attempt=attempt, reason="ops_rental_full_refund", actor_id=customer.id
    )
    assert refund.status == Refund.Status.SUCCEEDED

    booking.refresh_from_db()
    assert booking.status == RentalBooking.Status.CANCELLED
    booking.deposit.refresh_from_db()
    assert booking.deposit.status == RentalDeposit.Status.RELEASED
    reservation = AssetReservation.objects.get(id=booking.reservation_id)
    assert reservation.status == AssetReservation.Status.RELEASED


# ---------------------------------------------------------------------------
# T5 — A9 stay full refund cancels + releases UnitReservation
# ---------------------------------------------------------------------------


def test_full_stay_refund_cancels_reservation_and_releases_unit() -> None:
    category = Category.objects.create(slug="stay-t5", name="Stay T5")
    sub = Subcategory.objects.create(category=category, slug="pg-t5", name="PG")
    service = Service.objects.create(
        subcategory=sub, slug="pg-t5-svc", name="PG T5", status=Service.Status.ACTIVE
    )
    variant = ServiceVariant.objects.create(
        service=service,
        code="A9_T5_PG",
        name="PG T5 stay",
        pricing_strategy=ServiceVariant.PricingStrategy.FIXED,
        booking_archetype=ServiceVariant.BookingArchetype.A9_STAY,
        required_skill_code="stay",
        tax_category_code="stay",
    )
    A9VariantConfiguration.objects.create(
        variant=variant,
        version=1,
        status=A9VariantConfiguration.Status.ACTIVE,
        booking_mode=A9VariantConfiguration.BookingMode.RESERVATION,
        property_schema={},
        enquiry_schema={},
    )
    host_user = User.objects.create(phone_number="+919955550001", full_name="Host T5")
    host = PartnerProfile.objects.create(user=host_user, display_name="Host T5")
    PartnerApplication.objects.create(partner=host, status=PartnerApplication.Status.APPROVED)
    PartnerCapability.objects.create(
        partner=host,
        variant=variant,
        archetype=ServiceVariant.BookingArchetype.A9_STAY,
        status=PartnerCapability.Status.APPROVED,
    )
    guest = User.objects.create(phone_number="+919955550002", full_name="Guest T5")
    prop = Property.objects.create(
        host=host,
        variant=variant,
        title="T5 Property",
        location_text="Hyderabad",
        moderation_status=Property.ModerationStatus.APPROVED,
    )
    unit = Unit.objects.create(
        property=prop, name="Room T5", nightly_rate_paise=200000, is_active=True
    )
    check_in = date.today() + timedelta(days=5)
    res = create_reservation(
        customer=guest,
        property_id=prop.id,
        unit_id=unit.id,
        check_in=check_in,
        check_out=check_in + timedelta(days=2),
    )
    initiate_reservation_payment(res.id)
    res.refresh_from_db()
    attempt = res.payment_attempt
    assert attempt is not None
    _capture_standalone(attempt, payment_id=f"fake_stay_t5_{res.id.hex[:8]}")
    confirm_reservation_payment(attempt.id)
    res.refresh_from_db()
    assert res.status == StayReservation.Status.CONFIRMED

    refund = _full_refund_via_provider(
        attempt=attempt, reason="ops_stay_full_refund", actor_id=guest.id
    )
    assert refund.status == Refund.Status.SUCCEEDED

    res.refresh_from_db()
    assert res.status == StayReservation.Status.CANCELLED
    unit_res = UnitReservation.objects.get(id=res.unit_reservation_id)
    assert unit_res.status == UnitReservation.Status.RELEASED


# ---------------------------------------------------------------------------
# T6 — refund after earnings settled → REVERSAL
# ---------------------------------------------------------------------------


def _deliver(booked: BookedGroup, *, key: str) -> Booking:
    booking = mark_en_route(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        expected_version=booked.booking.version,
    )
    booking = mark_arrived(
        booking_id=booking.id, partner_id=booked.partner.id, expected_version=booking.version
    )
    operations_assisted_start(
        booking_id=booking.id,
        operator=_operator(),
        outage_reason="Test bootstrap: skip OTP.",
        expected_version=booking.version,
    )
    booked.booking.refresh_from_db()
    tasks = list(WorkTask.objects.filter(booking=booked.booking))
    submit_completion(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        notes="Done.",
        safety_damage_declared=False,
        outcomes=[
            OutcomeInput(
                work_task_id=task.id, outcome=WorkOutcome.Outcome.COMPLETED, quantity=task.quantity
            )
            for task in tasks
        ],
        expected_version=booked.booking.version,
        idempotency_key=f"{key}-submit",
    )
    booked.booking.refresh_from_db()
    confirm_completion(
        booking_id=booked.booking.id,
        customer_id=booked.customer.id,
        expected_version=booked.booking.version,
        idempotency_key=f"{key}-confirm",
    )
    booked.booking.refresh_from_db()
    return booked.booking


def test_full_refund_after_earning_settled_records_reversal() -> None:
    booked = create_booked_group(key_prefix="t6-earn-rev")
    _deliver(booked, key="t6-earn-rev")
    earning = settle_booking_earning(booking_id=booked.booking.id)
    assert earning is not None
    assert earning.kind == PartnerLedgerEntry.Kind.EARNING
    assert earning.net_paise > 0

    unit_ids = list(booked.group.units.values_list("id", flat=True))
    refund = request_unit_refund(
        order_id=booked.order.id,
        unit_ids=unit_ids,
        reason_code="ops_refund_after_settle",
        idempotency_key="t6-earn-rev-refund",
        requested_by_id=booked.customer.id,
    )
    submitted = submit_refund(refund_id=refund.id)
    assert submitted.status == Refund.Status.SUCCEEDED

    # Completed bookings stay completed (fail-closed); ledger still reverses.
    booked.booking.refresh_from_db()
    assert booked.booking.status == Booking.Status.COMPLETED

    reversal = PartnerLedgerEntry.objects.filter(
        kind=PartnerLedgerEntry.Kind.REVERSAL,
        corrects_id=earning.id,
    ).get()
    assert reversal.net_paise == -earning.net_paise
    assert reversal.idempotency_key == f"refund-reversal:{submitted.id}:{earning.id}"


def test_earning_reversal_is_idempotent_on_refund_replay() -> None:
    booked = create_booked_group(key_prefix="t6-earn-idem")
    _deliver(booked, key="t6-earn-idem")
    earning = settle_booking_earning(booking_id=booked.booking.id)
    assert earning is not None

    unit_ids = list(booked.group.units.values_list("id", flat=True))
    refund = request_unit_refund(
        order_id=booked.order.id,
        unit_ids=unit_ids,
        reason_code="ops_refund_idempotent",
        idempotency_key="t6-earn-idem-refund",
        requested_by_id=booked.customer.id,
    )
    first = submit_refund(refund_id=refund.id)
    assert first.status == Refund.Status.SUCCEEDED

    # Replaying the provider result must not mint a second REVERSAL.
    replayed = _apply_refund_provider_result(
        ProviderRefund(
            provider_refund_id=first.provider_refund_id,
            provider_payment_id=first.payment_attempt.provider_payment_id,
            amount_paise=first.gateway_refund_paise or first.amount_paise,
            currency=first.currency,
            status="processed",
        ),
        refund_id=first.id,
    )
    assert replayed.status == Refund.Status.SUCCEEDED
    assert (
        PartnerLedgerEntry.objects.filter(
            kind=PartnerLedgerEntry.Kind.REVERSAL, corrects_id=earning.id
        ).count()
        == 1
    )
