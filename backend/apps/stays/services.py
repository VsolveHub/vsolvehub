"""Transactional domain commands for Stays & Accommodations (A9_STAY).

Implements the lifecycle and state machines from M3 Phase D (§5.1a, §5.2, §5.4, §7.3, §8.2, §9).
"""

import datetime
import hashlib
import math
import uuid
from typing import Any

from django.db import IntegrityError, models, transaction
from django.utils import timezone
from psycopg.types.range import Range

from apps.cases.approvals import propose_or_approve_settlement
from apps.cases.models import OperationsCase
from apps.catalog.models import A9VariantConfiguration
from apps.commerce.models import PaymentAttempt, Refund
from apps.commerce.services.payments import initiate_standalone_payment_attempt
from apps.commerce.services.refunds import request_standalone_refund
from apps.foundation.services import enqueue_outbox_event
from apps.notifications.models import NotificationIntent
from apps.notifications.services import request_notification
from apps.payouts.models import PartnerLedgerEntry
from apps.stays.exceptions import (
    GuestPolicyViolationError,
    InvalidStayStateTransitionError,
    StayAuthorizationError,
    UnitUnavailableError,
)
from apps.stays.models import (
    PropertyPolicy,
    StayCheckIn,
    StayCheckOut,
    StayDeposit,
    StayDepositTransaction,
    StayExtension,
    StayPaymentAllocation,
    StayReservation,
    StayReservationLine,
    Unit,
    UnitPricingRule,
    UnitReservation,
    UnitType,
)


def _payment_attempt_refunded_paise(attempt: PaymentAttempt) -> int:
    refunds_sum = (
        attempt.refunds.exclude(status=Refund.Status.FAILED).aggregate(models.Sum("amount_paise"))[
            "amount_paise__sum"
        ]
        or 0
    )
    alloc_sum = 0
    if hasattr(attempt, "stay_allocations"):
        alloc_sum = (
            attempt.stay_allocations.aggregate(models.Sum("refunded_paise"))["refunded_paise__sum"]
            or 0
        )
    return max(int(refunds_sum), int(alloc_sum))


@transaction.atomic
def handle_stay_checkout_failure(*, payment_attempt_id: uuid.UUID | str) -> None:
    """Release only the failed stay hold and unwind a captured sibling payment."""
    attempt = PaymentAttempt.objects.select_for_update().get(id=payment_attempt_id)
    allocation = (
        attempt.stay_allocations.select_related("stay_reservation_line__stay_reservation")
        .order_by("created_at")
        .first()
    )
    if allocation is None:
        return
    reservation = StayReservation.objects.select_for_update().get(
        id=allocation.stay_reservation_line.stay_reservation_id
    )
    if reservation.status not in (
        StayReservation.Status.HELD,
        StayReservation.Status.PAYMENT_PENDING,
    ):
        return
    siblings = PaymentAttempt.objects.filter(
        stay_allocations__stay_reservation_line__stay_reservation=reservation,
        purpose__in=(
            PaymentAttempt.Purpose.A9_STAY_RESERVATION,
            PaymentAttempt.Purpose.A9_DEPOSIT_HOLD,
        ),
        status__in=(PaymentAttempt.Status.CAPTURED, PaymentAttempt.Status.PARTIALLY_REFUNDED),
    ).distinct()
    for sibling in siblings:
        remaining = sibling.amount_paise - _payment_attempt_refunded_paise(sibling)
        if remaining > 0:
            request_standalone_refund(
                payment_attempt_id=sibling.id,
                amount_paise=remaining,
                reason_code="stay_checkout_payment_failed",
                idempotency_key=f"stay-failed-refund:{reservation.id}:{sibling.id}",
            )
    if reservation.calendar_hold_id:
        UnitReservation.objects.filter(id=reservation.calendar_hold_id).update(
            status=UnitReservation.Status.RELEASED,
            released_at=timezone.now(),
        )
    reservation.status = StayReservation.Status.FAILED
    reservation.save(update_fields=("status", "updated_at"))
    enqueue_outbox_event(
        aggregate_type="stay_reservation",
        aggregate_id=reservation.id,
        event_type="stay.checkout_failed",
        idempotency_key=f"stay-checkout-failed:{reservation.id}",
        payload={"reservation_id": str(reservation.id)},
    )


@transaction.atomic
def create_stay_hold(  # noqa: PLR0912, PLR0915, PLR0917
    customer: Any,
    unit_type_id: uuid.UUID | str,
    start_date: datetime.date,
    end_date: datetime.date,
    duration_mode: str = "MONTHLY",
    guest_count: int = 1,
    lease_duration_months: int = 11,
    hold_ttl_minutes: int = 15,
    primary_tenant_name: str = "",
    guest_phone: str = "",
    guest_email: str = "",
    emergency_contact_name: str = "",
    emergency_contact_phone: str = "",
    agreement_version: str = "",
    agreement_accepted: bool = False,
    kyc_document: Any = None,
    require_checkout_details: bool = False,
) -> StayReservation:
    """Find a vacant Unit of the given UnitType, lock it via UnitReservation, and
    create a HELD StayReservation.
    """
    try:
        unit_type = UnitType.objects.select_related(
            "property",
            "variant__service__subcategory__category",
        ).get(
            id=unit_type_id,
            is_active=True,
            property__is_active=True,
            variant__is_active=True,
            variant__service__status="ACTIVE",
            variant__service__subcategory__is_active=True,
            variant__service__subcategory__category__is_active=True,
        )
    except UnitType.DoesNotExist:
        raise UnitUnavailableError("The requested stay type was not found.") from None
    prop = unit_type.property
    config = A9VariantConfiguration.objects.filter(
        variant=unit_type.variant,
        status=A9VariantConfiguration.Status.ACTIVE,
    ).first()
    if config is None:
        raise UnitUnavailableError("This stay type has no active booking policy.")

    # Validate guest policy
    policy = prop.get_active_policy(start_date)
    if policy is None:
        raise UnitUnavailableError("This property has no active stay policy.")
    if policy and guest_count > policy.max_guests_per_unit:
        raise GuestPolicyViolationError(
            f"Requested {guest_count} guests exceeds unit limit of {policy.max_guests_per_unit}."
        )
    if require_checkout_details:
        if not primary_tenant_name.strip() or not guest_phone.strip() or not guest_email.strip():
            raise GuestPolicyViolationError("Primary tenant name, phone, and email are required.")
        if not emergency_contact_name.strip() or not emergency_contact_phone.strip():
            raise GuestPolicyViolationError("Emergency contact name and phone are required.")
        if not agreement_accepted or not agreement_version.strip():
            raise GuestPolicyViolationError("House rules and tenant agreement must be accepted.")
        id_required = config.id_verification_required or policy.id_verification_required
        if id_required and not kyc_document:
            raise GuestPolicyViolationError(
                "A government ID document is required for this property."
            )

    # Dates validation
    if start_date >= end_date:
        raise ValueError("Check-out date must be after check-in date.")
    total_days = (end_date - start_date).days
    if not config.min_stay_nights <= total_days <= config.max_stay_nights:
        raise ValueError(
            f"Stay duration must be between {config.min_stay_nights} and "
            f"{config.max_stay_nights} nights."
        )

    # Time boundaries (checkin 12:00, checkout 11:00)
    checkin_time = policy.check_in_time
    checkout_time = policy.check_out_time

    start_dt = timezone.make_aware(datetime.datetime.combine(start_date, checkin_time))
    end_dt = timezone.make_aware(datetime.datetime.combine(end_date, checkout_time))
    occupied_range = Range(start_dt, end_dt, "[)")

    now = timezone.now()
    expires_at = now + datetime.timedelta(minutes=hold_ttl_minutes)
    UnitReservation.objects.filter(
        unit__unit_type=unit_type,
        status=UnitReservation.Status.TENTATIVE,
        expires_at__lte=now,
    ).update(status=UnitReservation.Status.RELEASED, released_at=now)

    # Find a candidate active Unit with no overlapping active CONFIRMED or
    # unexpired TENTATIVE reservations
    candidate_units = (
        Unit.objects.filter(
            unit_type=unit_type,
            current_status=Unit.Status.ACTIVE,
        )
        .exclude(
            models.Q(
                reservations__status=UnitReservation.Status.CONFIRMED,
                reservations__occupied_range__overlap=occupied_range,
            )
            | models.Q(
                reservations__status=UnitReservation.Status.TENTATIVE,
                reservations__expires_at__gt=now,
                reservations__occupied_range__overlap=occupied_range,
            )
        )
        .select_for_update()
        .order_by("unit_code")
    )

    candidate = candidate_units.first()
    if not candidate:
        raise UnitUnavailableError(
            f"No {unit_type.name} units are available at {prop.title} for "
            f"{start_date} to {end_date}."
        )

    # Database-level calendar lock
    try:
        with transaction.atomic():
            unit_res = UnitReservation.objects.create(
                unit=candidate,
                occupied_range=occupied_range,
                status=UnitReservation.Status.TENTATIVE,
                expires_at=expires_at,
            )
    except IntegrityError:
        raise UnitUnavailableError(
            "The selected unit was just reserved by another customer."
        ) from None

    # Calculate pricing
    rule = (
        unit_type.pricing_rules.filter(
            duration_mode=duration_mode,
            is_active=True,
            effective_from__lte=start_date,
        )
        .filter(models.Q(effective_to__isnull=True) | models.Q(effective_to__gte=start_date))
        .order_by("-effective_from", "id")
        .first()
    )
    if not rule and duration_mode in (
        UnitPricingRule.DurationMode.DAILY,
        UnitPricingRule.DurationMode.NIGHTLY,
    ):
        alt_mode = (
            UnitPricingRule.DurationMode.DAILY
            if duration_mode == UnitPricingRule.DurationMode.NIGHTLY
            else UnitPricingRule.DurationMode.NIGHTLY
        )
        rule = (
            unit_type.pricing_rules.filter(
                duration_mode=alt_mode,
                is_active=True,
                effective_from__lte=start_date,
            )
            .filter(models.Q(effective_to__isnull=True) | models.Q(effective_to__gte=start_date))
            .order_by("-effective_from", "id")
            .first()
        )
    if not rule:
        raise ValueError(f"No active pricing rule configured for duration mode {duration_mode}.")

    if duration_mode == UnitPricingRule.DurationMode.MONTHLY:
        periods = max(1, math.ceil(total_days / 30))
        base_rate = rule.base_rate_paise * periods
        maintenance_rate = rule.maintenance_paise * periods
        deposit_rate = (
            (rule.deposit_paise if rule.deposit_paise else config.default_deposit_paise)
            if config.deposit_required
            else 0
        )
        one_time_charge = 0
        tax_rate = (one_time_charge + maintenance_rate) * 1800 // 10000
    else:
        if duration_mode in (
            UnitPricingRule.DurationMode.NIGHTLY,
            UnitPricingRule.DurationMode.DAILY,
        ):
            overrides = {
                item.date: item.rate_paise
                for item in rule.overrides.filter(date__gte=start_date, date__lt=end_date)
            }
            base_rate = sum(
                overrides.get(start_date + datetime.timedelta(days=offset), rule.base_rate_paise)
                for offset in range(total_days)
            )
        elif duration_mode == UnitPricingRule.DurationMode.WEEKLY:
            base_rate = rule.base_rate_paise * max(1, math.ceil(total_days / 7))
        elif duration_mode == UnitPricingRule.DurationMode.HOURLY:
            occupied_hours = max(
                1,
                math.ceil((end_dt - start_dt).total_seconds() / 3600),
            )
            base_rate = rule.base_rate_paise * occupied_hours
        else:  # DAILY
            base_rate = rule.base_rate_paise * total_days
        maintenance_rate = 0
        deposit_rate = (
            (rule.deposit_paise if rule.deposit_paise else config.default_deposit_paise)
            if config.deposit_required
            else 0
        )
        one_time_charge = 0
        tax_rate = (base_rate + one_time_charge) * 1200 // 10000

    total_amount = base_rate + maintenance_rate + deposit_rate + one_time_charge + tax_rate

    policy_snapshot = {
        "check_in_time": str(checkin_time),
        "check_out_time": str(checkout_time),
        "cancellation_policy": policy.cancellation_policy,
        "id_verification_required": config.id_verification_required
        or (policy.id_verification_required if policy else False),
        "max_guests": policy.max_guests_per_unit,
        "no_show_grace_minutes": policy.no_show_grace_minutes,
        "no_show_first_night_charge_basis_points": (policy.no_show_first_night_charge_basis_points),
        "no_show_deposit_forfeit_basis_points": (policy.no_show_deposit_forfeit_basis_points),
    }

    reservation = StayReservation.objects.create(
        customer=customer,
        unit=candidate,
        unit_type=unit_type,
        calendar_hold=unit_res,
        status=StayReservation.Status.HELD,
        duration_mode=duration_mode,
        lease_duration_months=lease_duration_months,
        start_date=start_date,
        end_date=end_date,
        guest_count=guest_count,
        primary_tenant_name=primary_tenant_name.strip(),
        guest_phone_snapshot=guest_phone.strip(),
        guest_email_snapshot=guest_email.strip(),
        emergency_contact_name=emergency_contact_name.strip(),
        emergency_contact_phone=emergency_contact_phone.strip(),
        agreement_version=agreement_version.strip(),
        agreement_accepted_at=timezone.now(),
        kyc_document=kyc_document,
        total_nights=total_days,
        base_amount_paise=base_rate,
        maintenance_amount_paise=maintenance_rate,
        deposit_amount_paise=deposit_rate,
        one_time_charges_paise=one_time_charge,
        tax_amount_paise=tax_rate,
        total_amount_paise=total_amount,
        policy_snapshot=policy_snapshot,
    )

    # Financial lines
    StayReservationLine.objects.create(
        stay_reservation=reservation,
        kind=StayReservationLine.Kind.ROOM_CHARGE,
        description=f"Room Tariff ({unit_type.name})",
        amount_paise=base_rate,
    )
    if maintenance_rate > 0:
        StayReservationLine.objects.create(
            stay_reservation=reservation,
            kind=StayReservationLine.Kind.MAINTENANCE_FEE,
            description="Maintenance & Society Amenities",
            amount_paise=maintenance_rate,
        )
    if deposit_rate > 0:
        StayReservationLine.objects.create(
            stay_reservation=reservation,
            kind=StayReservationLine.Kind.SECURITY_DEPOSIT,
            description="Refundable Security Deposit",
            amount_paise=deposit_rate,
        )
    if one_time_charge > 0:
        desc = (
            "Cleaning & Hospitality Linen Fee"
            if duration_mode
            in (UnitPricingRule.DurationMode.DAILY, UnitPricingRule.DurationMode.NIGHTLY)
            else "Agreement & Verification Fee"
        )
        StayReservationLine.objects.create(
            stay_reservation=reservation,
            kind=StayReservationLine.Kind.ONE_TIME_CHARGE,
            description=desc,
            amount_paise=one_time_charge,
        )
    if tax_rate > 0:
        StayReservationLine.objects.create(
            stay_reservation=reservation,
            kind=StayReservationLine.Kind.TAX,
            description=(
                "Taxes (GST 18%)"
                if duration_mode == UnitPricingRule.DurationMode.MONTHLY
                else "Taxes (GST 12%)"
            ),
            amount_paise=tax_rate,
        )

    # Deposit record
    StayDeposit.objects.create(
        stay_reservation=reservation,
        status=StayDeposit.Status.REQUIRED if deposit_rate > 0 else StayDeposit.Status.NOT_REQUIRED,
        authorized_amount_paise=deposit_rate,
    )

    return reservation


@transaction.atomic
def release_stay_hold(*, customer: Any, reservation_id: uuid.UUID | str) -> StayReservation:
    """Release an unpaid checkout hold immediately; safe to replay."""
    try:
        res = StayReservation.objects.select_for_update().get(id=reservation_id)
    except StayReservation.DoesNotExist:
        raise StayAuthorizationError("Stay reservation was not found.") from None
    if res.customer != customer:
        raise StayAuthorizationError("Only the reservation customer can release this hold.")
    if res.status in (StayReservation.Status.EXPIRED, StayReservation.Status.FAILED):
        return res
    if res.status not in (StayReservation.Status.HELD, StayReservation.Status.PAYMENT_PENDING):
        raise InvalidStayStateTransitionError(f"Cannot release a stay from status {res.status}.")

    attempts = (
        PaymentAttempt.objects.select_for_update()
        .filter(stay_allocations__stay_reservation_line__stay_reservation=res)
        .distinct()
    )
    if attempts.filter(
        status__in=(PaymentAttempt.Status.CAPTURED, PaymentAttempt.Status.PARTIALLY_REFUNDED)
    ).exists():
        raise InvalidStayStateTransitionError(
            "Payment was captured; use reservation cancellation so refund policy is applied."
        )
    attempts.exclude(
        status__in=(PaymentAttempt.Status.FAILED, PaymentAttempt.Status.EXPIRED)
    ).update(status=PaymentAttempt.Status.EXPIRED, updated_at=timezone.now())
    UnitReservation.objects.filter(
        id=res.calendar_hold_id, status=UnitReservation.Status.TENTATIVE
    ).update(status=UnitReservation.Status.RELEASED, released_at=timezone.now())
    res.status = StayReservation.Status.EXPIRED
    res.save(update_fields=("status", "updated_at"))
    enqueue_outbox_event(
        aggregate_type="StayReservation",
        aggregate_id=res.id,
        event_type="stay_reservation.hold_released",
        idempotency_key=f"stay_reservation_hold_released:{res.id}",
        payload={"reservation_id": str(res.id), "customer_id": str(res.customer_id)},
    )
    return res


@transaction.atomic
def confirm_stay_reservation(
    reservation_id: uuid.UUID | str,
    payment_attempt: PaymentAttempt | None = None,
) -> StayReservation:
    """Confirm only after every provider-backed stay charge has captured."""
    try:
        res = StayReservation.objects.select_for_update().get(id=reservation_id)
    except StayReservation.DoesNotExist:
        raise StayAuthorizationError("Stay reservation was not found.") from None
    if res.status not in (StayReservation.Status.HELD, StayReservation.Status.PAYMENT_PENDING):
        raise InvalidStayStateTransitionError(
            f"Reservation cannot be confirmed from status {res.status}."
        )

    attempt_ids = list(
        PaymentAttempt.objects.filter(stay_allocations__stay_reservation_line__stay_reservation=res)
        .values_list("id", flat=True)
        .distinct()
    )
    payment_attempts = list(PaymentAttempt.objects.select_for_update().filter(id__in=attempt_ids))
    if payment_attempt is not None and payment_attempt.id not in {
        item.id for item in payment_attempts
    }:
        raise ValueError("The payment attempt does not belong to this stay reservation.")
    charge_lines = list(res.lines.exclude(kind=StayReservationLine.Kind.SECURITY_DEPOSIT))
    deposit_lines = list(res.lines.filter(kind=StayReservationLine.Kind.SECURITY_DEPOSIT))
    expected = {
        PaymentAttempt.Purpose.A9_STAY_RESERVATION: sum(line.amount_paise for line in charge_lines),
        PaymentAttempt.Purpose.A9_DEPOSIT_HOLD: sum(line.amount_paise for line in deposit_lines),
    }
    for purpose, amount in expected.items():
        if amount == 0:
            continue
        matching = [
            item
            for item in payment_attempts
            if item.purpose == purpose and item.status == PaymentAttempt.Status.CAPTURED
        ]
        if len(matching) != 1:
            raise InvalidStayStateTransitionError(
                f"Captured {purpose} payment is required before confirmation."
            )
        if matching[0].amount_paise != amount:
            raise ValueError(
                "Captured stay payment does not reconcile to immutable reservation lines."
            )

    # Confirm calendar hold
    unit_res = res.calendar_hold
    if unit_res:
        unit_res.status = UnitReservation.Status.CONFIRMED
        unit_res.save(update_fields=["status"])

    res.status = StayReservation.Status.CONFIRMED
    res.save(update_fields=["status", "updated_at"])

    # Hold deposit
    if hasattr(res, "deposit") and res.deposit.status == StayDeposit.Status.REQUIRED:
        deposit = res.deposit
        deposit.status = StayDeposit.Status.HELD
        deposit.save(update_fields=["status", "updated_at"])
        StayDepositTransaction.objects.create(
            deposit=deposit,
            kind=StayDepositTransaction.Kind.HOLD,
            amount_paise=deposit.authorized_amount_paise,
            reason="Deposit captured and held at checkout confirmation.",
        )

    enqueue_outbox_event(
        aggregate_type="StayReservation",
        aggregate_id=res.id,
        event_type="stay_reservation.confirmed",
        idempotency_key=f"stay_reservation_confirmed:{res.id}",
        payload={
            "reservation_id": str(res.id),
            "customer_id": str(res.customer_id),
            "unit_id": str(res.unit_id),
            "property_id": str(res.unit.property_id),
            "start_date": str(res.start_date),
            "end_date": str(res.end_date),
            "total_amount_paise": res.total_amount_paise,
            "status": res.status,
        },
    )

    return res


@transaction.atomic
def initiate_stay_checkout(
    *, reservation_id: uuid.UUID | str, customer: Any, idempotency_key: str
) -> list[PaymentAttempt]:
    """Create separate provider orders for the stay price and refundable deposit."""
    try:
        res = StayReservation.objects.select_for_update().get(id=reservation_id)
    except StayReservation.DoesNotExist:
        raise StayAuthorizationError("Stay reservation was not found.") from None
    if res.customer != customer:
        raise StayAuthorizationError("Only the reservation customer can start payment.")
    if res.status not in (StayReservation.Status.HELD, StayReservation.Status.PAYMENT_PENDING):
        raise InvalidStayStateTransitionError(f"Cannot start payment from status {res.status}.")
    unit_hold = (
        UnitReservation.objects.select_for_update()
        .filter(id=res.calendar_hold_id, status=UnitReservation.Status.TENTATIVE)
        .first()
    )
    if unit_hold is None or unit_hold.expires_at <= timezone.now():
        raise UnitUnavailableError("The stay hold expired before payment could start.")

    groups = (
        (
            PaymentAttempt.Purpose.A9_STAY_RESERVATION,
            list(res.lines.exclude(kind=StayReservationLine.Kind.SECURITY_DEPOSIT)),
        ),
        (
            PaymentAttempt.Purpose.A9_DEPOSIT_HOLD,
            list(res.lines.filter(kind=StayReservationLine.Kind.SECURITY_DEPOSIT)),
        ),
    )
    attempts: list[PaymentAttempt] = []
    for purpose, lines in groups:
        amount = sum(line.amount_paise for line in lines)
        if amount <= 0:
            continue
        key = f"{idempotency_key}:{purpose}:{res.id}"
        existing = (
            PaymentAttempt.objects.filter(
                purpose=purpose,
                stay_allocations__stay_reservation_line__stay_reservation=res,
            )
            .exclude(status__in=(PaymentAttempt.Status.FAILED, PaymentAttempt.Status.EXPIRED))
            .distinct()
            .order_by("created_at")
            .first()
        )
        if existing is not None:
            if existing.amount_paise != amount:
                raise ValueError("The stay price changed after payment was started.")
            attempts.append(existing)
            continue
        attempt = initiate_standalone_payment_attempt(
            purpose=purpose,
            amount_paise=amount,
            idempotency_key=key,
            expires_at=unit_hold.expires_at,
        )
        for line in lines:
            StayPaymentAllocation.objects.create(
                payment_attempt=attempt,
                stay_reservation_line=line,
                amount_paise=line.amount_paise,
            )
        attempts.append(attempt)
    if sum(item.amount_paise for item in attempts) != sum(
        line.amount_paise for line in res.lines.all()
    ):
        raise ValueError("Stay payment allocations do not reconcile to the reservation total.")
    res.status = StayReservation.Status.PAYMENT_PENDING
    res.save(update_fields=("status", "updated_at"))
    return attempts


def complete_stay_checkout(*, payment_attempt_id: uuid.UUID | str) -> StayReservation | None:
    """Confirm a stay only after both allocated provider orders have captured."""
    attempt = PaymentAttempt.objects.get(id=payment_attempt_id)
    allocation = attempt.stay_allocations.select_related(
        "stay_reservation_line__stay_reservation__customer"
    ).first()
    if allocation is None:
        return None
    res = allocation.stay_reservation_line.stay_reservation
    try:
        return confirm_stay_reservation(reservation_id=res.id, payment_attempt=attempt)
    except InvalidStayStateTransitionError:
        if res.status == StayReservation.Status.CONFIRMED:
            return res
        return None


@transaction.atomic
def host_reassign_unit(
    host_partner: Any,
    reservation_id: uuid.UUID | str,
    target_unit_id: uuid.UUID | str,
) -> StayReservation:
    """Host swaps assigned physical Unit to another vacant Unit under the same UnitType.

    Benign, zero-cost, concurrency-safe like-for-like operational swap (§5.1a, §8.2).
    """
    res = StayReservation.objects.select_for_update().get(id=reservation_id)
    if res.unit.property.partner != host_partner:
        raise StayAuthorizationError("You do not own this property reservation.")

    if res.status not in (
        StayReservation.Status.CONFIRMED,
        StayReservation.Status.HELD,
    ):
        raise InvalidStayStateTransitionError(
            f"Cannot reassign room while reservation is in status {res.status}."
        )

    try:
        target_unit = Unit.objects.select_for_update().get(id=target_unit_id)
    except Unit.DoesNotExist:
        raise UnitUnavailableError("Replacement unit was not found.") from None
    if target_unit.current_status != Unit.Status.ACTIVE:
        raise UnitUnavailableError("Target unit is not active.")
    if target_unit.unit_type_id != res.unit_type_id:
        raise ValueError("Replacement must preserve the booked UnitType and price.")
    if target_unit.id == res.unit_id:
        return res  # No-op

    # Find the active UnitReservation
    active_hold = res.calendar_hold

    if not active_hold:
        raise UnitUnavailableError("Active reservation hold was not found.")

    occupied_range = active_hold.occupied_range

    # Check candidate availability
    is_conflict = (
        UnitReservation.objects.filter(
            unit=target_unit,
            occupied_range__overlap=occupied_range,
        )
        .filter(
            models.Q(status=UnitReservation.Status.CONFIRMED)
            | models.Q(status=UnitReservation.Status.TENTATIVE, expires_at__gt=timezone.now())
        )
        .exists()
    )

    if is_conflict:
        raise UnitUnavailableError(
            f"Room {target_unit.unit_code} is already reserved for these dates."
        )

    # Swap hold to candidate unit
    active_hold.unit = target_unit
    active_hold.save(update_fields=["unit"])

    # Update reservation
    res.unit = target_unit
    res.save(update_fields=["unit", "updated_at"])

    return res


@transaction.atomic
def record_check_in(  # noqa: PLR0917
    host_partner: Any,
    reservation_id: uuid.UUID | str,
    id_document_type: str = "AADHAAR",
    id_document_number: str = "",
    guest_notes: str = "",
    condition_photo_urls: list[str] | None = None,
) -> StayCheckIn:
    """Record guest arrival and mandatory ID verification."""
    res = StayReservation.objects.select_for_update().get(id=reservation_id)
    if res.unit.property.partner != host_partner:
        raise StayAuthorizationError("You do not own this property reservation.")

    if res.status != StayReservation.Status.CONFIRMED:
        raise InvalidStayStateTransitionError(
            f"Check-in requires CONFIRMED status; currently in {res.status}."
        )

    id_verification_required = bool(res.policy_snapshot.get("id_verification_required", True))
    if id_verification_required and not id_document_number.strip():
        raise InvalidStayStateTransitionError("Verified government ID is required before check-in.")
    check_in = StayCheckIn.objects.create(
        stay_reservation=res,
        id_document_type=id_document_type,
        id_document_number=(f"****{id_document_number[-4:]}" if id_document_number else ""),
        id_document_hash=(
            hashlib.sha256(id_document_number.strip().encode("utf-8")).hexdigest()
            if id_document_number.strip()
            else ""
        ),
        id_verified=bool(id_document_number.strip()),
        condition_photo_urls=condition_photo_urls or [],
        guest_notes=guest_notes,
    )

    res.status = StayReservation.Status.IN_STAY
    res.save(update_fields=["status", "updated_at"])

    enqueue_outbox_event(
        aggregate_type="StayReservation",
        aggregate_id=res.id,
        event_type="stay_reservation.checked_in",
        idempotency_key=f"stay_reservation_checked_in:{res.id}",
        payload={
            "reservation_id": str(res.id),
            "check_in_id": str(check_in.id),
            "customer_id": str(res.customer_id),
            "unit_id": str(res.unit_id),
            "id_verified": check_in.id_verified,
            "status": res.status,
        },
    )

    return check_in


@transaction.atomic
def record_check_out(  # noqa: PLR0917
    host_partner: Any,
    reservation_id: uuid.UUID | str,
    condition_grade: str = "EXCELLENT",
    damage_found: bool = False,
    damage_estimate_paise: int = 0,
    inspection_notes: str = "",
    condition_photo_urls: list[str] | None = None,
) -> StayCheckOut:
    """Record guest departure and initial room condition check."""
    res = StayReservation.objects.select_for_update().get(id=reservation_id)
    if res.unit.property.partner != host_partner:
        raise StayAuthorizationError("You do not own this property reservation.")

    if res.status not in (StayReservation.Status.IN_STAY, StayReservation.Status.CHECKED_IN):
        raise InvalidStayStateTransitionError(
            f"Check-out requires IN_STAY status; currently in {res.status}."
        )

    check_in = getattr(res, "check_in_record", None)
    if damage_found and (
        not check_in or not check_in.condition_photo_urls or not condition_photo_urls
    ):
        raise InvalidStayStateTransitionError(
            "Damage assessment requires check-in and check-out condition photos."
        )
    check_out = StayCheckOut.objects.create(
        stay_reservation=res,
        condition_grade=condition_grade,
        damage_found=damage_found,
        damage_estimate_paise=damage_estimate_paise,
        inspection_notes=inspection_notes,
        condition_photo_urls=condition_photo_urls or [],
    )

    if damage_found:
        res.status = StayReservation.Status.INSPECTED
        deposit = res.deposit
        deposit.status = StayDeposit.Status.DISPUTED
        deposit.dispute_reason = "Host reported damage; Operations evidence review required."
        deposit.save(update_fields=("status", "dispute_reason", "updated_at"))
        OperationsCase.objects.get_or_create(
            stay_reservation=res,
            kind=OperationsCase.Kind.STAY_DAMAGE_DISPUTE,
            status__in=(OperationsCase.Status.OPEN, OperationsCase.Status.IN_PROGRESS),
            defaults={
                "owner_team": OperationsCase.Team.QUALITY_SUPPORT,
                "summary": f"Damage review for Stay #{str(res.id)[:8]}",
                "detail": (
                    f"Host assessed {damage_estimate_paise} paise. "
                    "Check-in and check-out photo evidence is attached."
                ),
                "due_at": timezone.now() + datetime.timedelta(hours=24),
            },
        )
    else:
        res.status = StayReservation.Status.CHECKED_OUT

    res.save(update_fields=["status", "updated_at"])

    # If no damage found, auto-settle the deposit
    if not damage_found:
        settle_stay_deposit(
            reservation_id=res.id, consumed_amount_paise=0, reason="Clean check-out"
        )

    enqueue_outbox_event(
        aggregate_type="StayReservation",
        aggregate_id=res.id,
        event_type="stay_reservation.checked_out",
        idempotency_key=f"stay_reservation_checked_out:{res.id}",
        payload={
            "reservation_id": str(res.id),
            "check_out_id": str(check_out.id),
            "customer_id": str(res.customer_id),
            "unit_id": str(res.unit_id),
            "damage_found": check_out.damage_found,
            "condition_grade": check_out.condition_grade,
            "status": res.status,
        },
    )

    return check_out


@transaction.atomic
def settle_stay_deposit(
    reservation_id: uuid.UUID | str,
    consumed_amount_paise: int = 0,
    reason: str = "Clean check-out inspection",
) -> StayDeposit | None:
    """Deposit sub-lifecycle settlement (§4.5 & §5.6)."""
    res = StayReservation.objects.select_for_update().get(id=reservation_id)
    deposit = getattr(res, "deposit", None)
    if not deposit:
        try:
            deposit = StayDeposit.objects.get(stay_reservation=res)
        except StayDeposit.DoesNotExist:
            return None

    if deposit.status not in (StayDeposit.Status.HELD, StayDeposit.Status.REQUIRED):
        return deposit  # Already settled or not required

    auth_paise = deposit.authorized_amount_paise

    if consumed_amount_paise <= 0:
        dep_id = (
            PaymentAttempt.objects.filter(
                purpose=PaymentAttempt.Purpose.A9_DEPOSIT_HOLD,
                stay_allocations__stay_reservation_line__stay_reservation=res,
                status__in=(
                    PaymentAttempt.Status.CAPTURED,
                    PaymentAttempt.Status.PARTIALLY_REFUNDED,
                ),
            )
            .values_list("id", flat=True)
            .first()
        )
        deposit_attempt = (
            PaymentAttempt.objects.select_for_update().filter(id=dep_id).first() if dep_id else None
        )
        if auth_paise and deposit_attempt:
            request_standalone_refund(
                payment_attempt_id=deposit_attempt.id,
                amount_paise=auth_paise,
                reason_code="stay_clean_checkout",
                idempotency_key=f"stay-deposit-clean:{res.id}",
                requested_by_id=res.customer_id,
            )
        deposit.status = StayDeposit.Status.RELEASED
        deposit.refunded_amount_paise = auth_paise
        deposit.consumed_amount_paise = 0
        if auth_paise > 0:
            StayDepositTransaction.objects.create(
                deposit=deposit,
                kind=StayDepositTransaction.Kind.REFUND,
                amount_paise=auth_paise,
                reason=reason,
            )
    elif consumed_amount_paise < auth_paise:
        deposit.status = StayDeposit.Status.PARTIALLY_CONSUMED
        deposit.consumed_amount_paise = consumed_amount_paise
        deposit.refunded_amount_paise = auth_paise - consumed_amount_paise
        dep_id = (
            PaymentAttempt.objects.filter(
                purpose=PaymentAttempt.Purpose.A9_DEPOSIT_HOLD,
                stay_allocations__stay_reservation_line__stay_reservation=res,
                status__in=(
                    PaymentAttempt.Status.CAPTURED,
                    PaymentAttempt.Status.PARTIALLY_REFUNDED,
                ),
            )
            .values_list("id", flat=True)
            .first()
        )
        deposit_attempt = (
            PaymentAttempt.objects.select_for_update().filter(id=dep_id).first() if dep_id else None
        )
        if deposit_attempt:
            request_standalone_refund(
                payment_attempt_id=deposit_attempt.id,
                amount_paise=auth_paise - consumed_amount_paise,
                reason_code="stay_deposit_remainder",
                idempotency_key=f"stay-deposit-remainder:{res.id}",
                requested_by_id=res.customer_id,
            )
        StayDepositTransaction.objects.create(
            deposit=deposit,
            kind=StayDepositTransaction.Kind.CONSUMPTION,
            amount_paise=consumed_amount_paise,
            reason=f"Damage or lateness deduction: {reason}",
        )
        StayDepositTransaction.objects.create(
            deposit=deposit,
            kind=StayDepositTransaction.Kind.REFUND,
            amount_paise=auth_paise - consumed_amount_paise,
            reason="Remainder deposit refund",
        )
    else:
        deposit.status = StayDeposit.Status.FULLY_CONSUMED
        deposit.consumed_amount_paise = auth_paise
        deposit.refunded_amount_paise = 0
        StayDepositTransaction.objects.create(
            deposit=deposit,
            kind=StayDepositTransaction.Kind.CONSUMPTION,
            amount_paise=auth_paise,
            reason=f"Major damage full deposit consumption: {reason}",
        )

    deposit.save(
        update_fields=["status", "consumed_amount_paise", "refunded_amount_paise", "updated_at"]
    )

    res.status = StayReservation.Status.COMPLETED
    res.save(update_fields=["status", "updated_at"])

    # Release calendar hold
    if res.calendar_hold_id:
        UnitReservation.objects.filter(id=res.calendar_hold_id).update(
            status=UnitReservation.Status.RELEASED, released_at=timezone.now()
        )

    # Create partner ledger entry for host earnings
    host_profile = res.unit.property.partner
    gross = res.base_amount_paise + res.maintenance_amount_paise
    commission = gross * 1000 // 10000
    net = gross - commission

    PartnerLedgerEntry.objects.get_or_create(
        idempotency_key=f"stay_earning_{res.id}",
        defaults={
            "partner": host_profile,
            "stay_reservation": res,
            "kind": PartnerLedgerEntry.Kind.EARNING,
            "status": PartnerLedgerEntry.Status.AVAILABLE,
            "gross_paise": gross,
            "commission_paise": commission,
            "net_paise": net,
            "calculation_snapshot": {
                "reservation_id": str(res.id),
                "base_paise": res.base_amount_paise,
                "maintenance_paise": res.maintenance_amount_paise,
                "commission_bps": 1000,
            },
            "reason": f"Completed stay at {res.unit.property.title} [{res.unit.unit_code}]",
        },
    )

    enqueue_outbox_event(
        aggregate_type="StayReservation",
        aggregate_id=res.id,
        event_type="stay_reservation.settled",
        idempotency_key=f"stay_reservation_settled:{res.id}",
        payload={
            "reservation_id": str(res.id),
            "deposit_id": str(deposit.id),
            "consumed_amount_paise": deposit.consumed_amount_paise,
            "refunded_amount_paise": deposit.refunded_amount_paise,
            "status": deposit.status,
        },
    )

    return deposit


@transaction.atomic
def cancel_stay_reservation(
    customer: Any,
    reservation_id: uuid.UUID | str,
    reason: str = "Customer requested cancellation",
) -> StayReservation:
    """Cancel a confirmed/held stay reservation enforcing cancellation policy refund
    bands (§5.4, §5.5, M3-A9-02).
    """
    res = StayReservation.objects.select_for_update().get(id=reservation_id)

    # Permission check: customer or staff
    if res.customer != customer and not getattr(customer, "is_staff", False):
        raise StayAuthorizationError("You are not authorized to cancel this reservation.")

    if res.status not in (
        StayReservation.Status.HELD,
        StayReservation.Status.PAYMENT_PENDING,
        StayReservation.Status.CONFIRMED,
    ):
        raise InvalidStayStateTransitionError(f"Cannot cancel reservation in status {res.status}.")

    # Release calendar hold immediately
    if res.calendar_hold_id:
        UnitReservation.objects.filter(id=res.calendar_hold_id).update(
            status=UnitReservation.Status.RELEASED, released_at=timezone.now()
        )

    # Release/refund deposit
    if hasattr(res, "deposit") and res.deposit.status in (
        StayDeposit.Status.HELD,
        StayDeposit.Status.REQUIRED,
    ):
        dep = res.deposit
        auth_paise = dep.authorized_amount_paise
        refund_recorded = auth_paise if dep.status == StayDeposit.Status.HELD else 0
        dep.status = StayDeposit.Status.RELEASED
        dep.refunded_amount_paise = refund_recorded
        dep.consumed_amount_paise = 0
        dep.save(
            update_fields=["status", "refunded_amount_paise", "consumed_amount_paise", "updated_at"]
        )
        if refund_recorded > 0:
            StayDepositTransaction.objects.create(
                deposit=dep,
                kind=StayDepositTransaction.Kind.REFUND,
                amount_paise=refund_recorded,
                reason="Full deposit refund upon reservation cancellation",
            )

    # Calculate policy refund band on base rent/tariff
    cancellation_policy = res.policy_snapshot.get(
        "cancellation_policy", PropertyPolicy.CancellationPolicy.MODERATE
    )

    now = timezone.now().date()
    days_to_checkin = (res.start_date - now).days

    refund_basis_points = 10000
    if cancellation_policy == PropertyPolicy.CancellationPolicy.FLEXIBLE:
        refund_basis_points = 10000 if days_to_checkin >= 1 else 8500
    elif cancellation_policy == PropertyPolicy.CancellationPolicy.MODERATE:
        refund_basis_points = 10000 if days_to_checkin >= 5 else 5000  # noqa: PLR2004
    elif cancellation_policy == PropertyPolicy.CancellationPolicy.STRICT:
        refund_basis_points = 5000 if days_to_checkin >= 7 else 0  # noqa: PLR2004
    elif cancellation_policy == PropertyPolicy.CancellationPolicy.NON_REFUNDABLE:
        refund_basis_points = 0

    refundable_amount = res.base_amount_paise * refund_basis_points // 10000

    price_id = (
        PaymentAttempt.objects.filter(
            purpose=PaymentAttempt.Purpose.A9_STAY_RESERVATION,
            stay_allocations__stay_reservation_line__stay_reservation=res,
            status__in=(PaymentAttempt.Status.CAPTURED, PaymentAttempt.Status.PARTIALLY_REFUNDED),
        )
        .values_list("id", flat=True)
        .first()
    )
    price_attempt = (
        PaymentAttempt.objects.select_for_update().filter(id=price_id).first() if price_id else None
    )
    dep_id = (
        PaymentAttempt.objects.filter(
            purpose=PaymentAttempt.Purpose.A9_DEPOSIT_HOLD,
            stay_allocations__stay_reservation_line__stay_reservation=res,
            status__in=(PaymentAttempt.Status.CAPTURED, PaymentAttempt.Status.PARTIALLY_REFUNDED),
        )
        .values_list("id", flat=True)
        .first()
    )
    deposit_attempt = (
        PaymentAttempt.objects.select_for_update().filter(id=dep_id).first() if dep_id else None
    )
    if refundable_amount and price_attempt:
        request_standalone_refund(
            payment_attempt_id=price_attempt.id,
            amount_paise=min(refundable_amount, price_attempt.amount_paise),
            reason_code="stay_customer_cancellation",
            idempotency_key=f"stay-cancel-price:{res.id}",
            requested_by_id=customer.id,
        )
    if deposit_attempt:
        request_standalone_refund(
            payment_attempt_id=deposit_attempt.id,
            amount_paise=deposit_attempt.amount_paise,
            reason_code="stay_deposit_release",
            idempotency_key=f"stay-cancel-deposit:{res.id}",
            requested_by_id=customer.id,
        )

    res.status = StayReservation.Status.CANCELLED
    res.cancellation_reason = (
        f"{reason} [Policy: {cancellation_policy}, Days: {days_to_checkin}, "
        f"Refund: {refund_basis_points // 100}%]"
    )
    res.notes = (
        f"Cancellation calculated refund: ₹{refundable_amount // 100} on tariff + full deposit."
    )
    res.save(update_fields=["status", "cancellation_reason", "notes", "updated_at"])

    enqueue_outbox_event(
        aggregate_type="StayReservation",
        aggregate_id=res.id,
        event_type="stay_reservation.cancelled",
        idempotency_key=f"stay_reservation_cancelled:{res.id}",
        payload={
            "reservation_id": str(res.id),
            "customer_id": str(res.customer_id),
            "unit_id": str(res.unit_id),
            "cancellation_reason": res.cancellation_reason,
            "status": res.status,
        },
    )

    return res


@transaction.atomic
def request_stay_extension(
    customer: Any,
    reservation_id: uuid.UUID | str,
    additional_nights: int = 0,
    additional_months: int = 0,
    additional_deposit_paise: int | None = None,
) -> StayExtension:
    """Request late check-out or extended stay with inventory conflict detection
    (§5.4, M3-A9-05).
    """
    res = StayReservation.objects.select_for_update().get(id=reservation_id)
    if res.customer != customer and not getattr(customer, "is_staff", False):
        raise StayAuthorizationError("You do not own this stay reservation.")

    if res.status not in (
        StayReservation.Status.CONFIRMED,
        StayReservation.Status.CHECKED_IN,
        StayReservation.Status.IN_STAY,
    ):
        raise InvalidStayStateTransitionError(
            f"Extensions can only be requested on active reservations; "
            f"current status: {res.status}."
        )

    days_to_add = additional_nights + (additional_months * 30)
    if days_to_add <= 0:
        raise ValueError("Extension must be at least 1 night or 1 month.")

    orig_end = res.end_date
    new_end = orig_end + datetime.timedelta(days=days_to_add)

    # Time boundaries (11:00 AM check-out)
    policy = getattr(res.unit.property, "policy", None)
    checkout_time = policy.check_out_time if policy else datetime.time(11, 0)

    ext_start_dt = timezone.make_aware(datetime.datetime.combine(orig_end, checkout_time))
    ext_end_dt = timezone.make_aware(datetime.datetime.combine(new_end, checkout_time))
    extension_range = Range(ext_start_dt, ext_end_dt, "[)")

    # Conflict check against candidate Unit
    conflict = (
        UnitReservation.objects.filter(
            unit=res.unit,
            occupied_range__overlap=extension_range,
        )
        .filter(
            models.Q(status=UnitReservation.Status.CONFIRMED)
            | models.Q(status=UnitReservation.Status.TENTATIVE, expires_at__gt=timezone.now())
        )
        .exists()
    )

    if conflict:
        raise UnitUnavailableError(
            f"Cannot extend stay: {res.unit.unit_code} has an incoming reservation for these dates."
        )

    # Calculate additional price
    rule = res.unit_type.pricing_rules.filter(
        duration_mode=res.duration_mode, is_active=True
    ).first()
    if not rule:
        raise ValueError("No active pricing rule exists for this reservation's duration mode.")

    if res.duration_mode == UnitPricingRule.DurationMode.MONTHLY and additional_months > 0:
        rate = rule.base_rate_paise * additional_months
    else:
        daily_rate = rule.base_rate_paise // (
            30 if res.duration_mode == UnitPricingRule.DurationMode.MONTHLY else 1
        )
        rate = daily_rate * days_to_add

    # Compute independent deposit delta
    if additional_deposit_paise is not None:
        deposit_delta = max(0, additional_deposit_paise)
    elif res.duration_mode == UnitPricingRule.DurationMode.MONTHLY and additional_months > 0:
        deposit_delta = rule.deposit_paise * additional_months
    else:
        deposit_delta = 0

    extension = StayExtension.objects.create(
        stay_reservation=res,
        original_end_date=orig_end,
        extended_end_date=new_end,
        additional_nights=days_to_add,
        additional_amount_paise=rate,
        additional_deposit_paise=deposit_delta,
        status=StayExtension.Status.PENDING_PAYMENT,
    )
    return extension


@transaction.atomic
def confirm_stay_extension(
    extension_id: uuid.UUID | str,
    payment_attempt: PaymentAttempt | None = None,
) -> StayReservation:
    """Confirm an extension upon payment, expand UnitReservation calendar hold, and
    update StayReservation end date.
    """
    ext = StayExtension.objects.select_for_update().get(id=extension_id)
    if ext.status != StayExtension.Status.PENDING_PAYMENT:
        raise InvalidStayStateTransitionError(
            f"Extension cannot be confirmed from status {ext.status}."
        )
    if payment_attempt is None or payment_attempt.status != PaymentAttempt.Status.CAPTURED:
        raise InvalidStayStateTransitionError("Extension payment has not been captured.")
    if payment_attempt.purpose != PaymentAttempt.Purpose.A9_EXTENSION:
        raise ValueError("Payment purpose does not match a stay extension.")
    allocation = payment_attempt.stay_allocations.filter(
        stay_reservation_line__stay_reservation=ext.stay_reservation,
        stay_reservation_line__description=f"Stay Extension {ext.id}",
    ).first()
    if allocation is None or allocation.amount_paise != ext.additional_amount_paise:
        raise ValueError("Extension payment is not allocated to this stay revision.")

    res = ext.stay_reservation
    ext.status = StayExtension.Status.APPROVED
    ext.save(update_fields=["status"])

    # Update deposit authorization if deposit delta was charged
    if ext.additional_deposit_paise > 0:
        deposit = getattr(res, "deposit", None)
        if not deposit:
            try:
                deposit = StayDeposit.objects.get(stay_reservation=res)
            except StayDeposit.DoesNotExist:
                deposit = None
        if deposit:
            deposit.authorized_amount_paise += ext.additional_deposit_paise
            deposit.save(update_fields=["authorized_amount_paise", "updated_at"])

    # Expand active UnitReservation hold
    policy = getattr(res.unit.property, "policy", None)
    checkout_time = policy.check_out_time if policy else datetime.time(11, 0)
    new_end_dt = timezone.make_aware(
        datetime.datetime.combine(ext.extended_end_date, checkout_time)
    )

    active_hold = res.calendar_hold

    if active_hold:
        start_dt = active_hold.occupied_range.lower
        active_hold.occupied_range = Range(start_dt, new_end_dt, "[)")
        active_hold.save(update_fields=["occupied_range"])

    res.end_date = ext.extended_end_date
    res.total_nights += ext.additional_nights
    res.total_amount_paise += ext.additional_amount_paise + ext.additional_deposit_paise
    res.save(update_fields=["end_date", "total_nights", "total_amount_paise", "updated_at"])

    return res


@transaction.atomic
def initiate_stay_extension_payment(
    *, extension_id: uuid.UUID | str, customer: Any, idempotency_key: str
) -> PaymentAttempt:
    ext = (
        StayExtension.objects.select_for_update()
        .select_related("stay_reservation__customer")
        .get(id=extension_id)
    )
    if ext.stay_reservation.customer != customer:
        raise StayAuthorizationError("Only the reservation customer can pay for an extension.")
    if ext.status != StayExtension.Status.PENDING_PAYMENT:
        raise InvalidStayStateTransitionError(f"Extension cannot be paid from status {ext.status}.")
    key = f"{idempotency_key}:A9_EXTENSION:{ext.id}"
    existing = (
        PaymentAttempt.objects.filter(
            purpose=PaymentAttempt.Purpose.A9_EXTENSION,
            stay_allocations__stay_reservation_line__description=f"Stay Extension {ext.id}",
        )
        .exclude(status__in=(PaymentAttempt.Status.FAILED, PaymentAttempt.Status.EXPIRED))
        .first()
    )
    if existing is not None:
        return existing

    total_charge = ext.additional_amount_paise + ext.additional_deposit_paise
    line = StayReservationLine.objects.create(
        stay_reservation=ext.stay_reservation,
        kind=StayReservationLine.Kind.ROOM_CHARGE,
        description=f"Stay Extension {ext.id}",
        amount_paise=ext.additional_amount_paise,
    )
    lines_to_allocate = [line]

    if ext.additional_deposit_paise > 0:
        dep_line = StayReservationLine.objects.create(
            stay_reservation=ext.stay_reservation,
            kind=StayReservationLine.Kind.SECURITY_DEPOSIT,
            description=f"Stay Extension Deposit {ext.id}",
            amount_paise=ext.additional_deposit_paise,
        )
        lines_to_allocate.append(dep_line)

    attempt = initiate_standalone_payment_attempt(
        purpose=PaymentAttempt.Purpose.A9_EXTENSION,
        amount_paise=total_charge,
        idempotency_key=key,
    )
    for alloc_line in lines_to_allocate:
        StayPaymentAllocation.objects.create(
            payment_attempt=attempt,
            stay_reservation_line=alloc_line,
            amount_paise=alloc_line.amount_paise,
        )
    return attempt


def complete_stay_extension(*, payment_attempt_id: uuid.UUID | str) -> StayReservation | None:
    attempt = PaymentAttempt.objects.get(id=payment_attempt_id)
    allocation = (
        attempt.stay_allocations.select_related("stay_reservation_line__stay_reservation")
        .filter(stay_reservation_line__description__startswith="Stay Extension ")
        .first()
    )
    if allocation is None:
        return None
    extension_id = allocation.stay_reservation_line.description.removeprefix("Stay Extension ")
    return confirm_stay_extension(extension_id=extension_id, payment_attempt=attempt)


@transaction.atomic
def record_early_checkout(
    user: Any,
    reservation_id: uuid.UUID | str,
    early_checkout_date: datetime.date | None = None,
    reason: str = "Early departure",
) -> StayReservation:
    """Record guest early departure, trim calendar hold to unlock unit for new
    bookings, and calculate refund (§5.4, M3-A9-04).
    """
    res = StayReservation.objects.select_for_update().get(id=reservation_id)

    if res.status not in (StayReservation.Status.CHECKED_IN, StayReservation.Status.IN_STAY):
        raise InvalidStayStateTransitionError(
            f"Early check-out is only valid for active stays; currently in {res.status}."
        )

    depart_date = early_checkout_date or timezone.now().date()
    if depart_date >= res.end_date:
        raise ValueError("Early departure date must precede the booked check-out date.")

    # Trim UnitReservation calendar hold
    policy = getattr(res.unit.property, "policy", None)
    checkout_time = policy.check_out_time if policy else datetime.time(11, 0)
    new_end_dt = timezone.make_aware(datetime.datetime.combine(depart_date, checkout_time))

    active_hold = res.calendar_hold

    if active_hold:
        start_dt = active_hold.occupied_range.lower
        active_hold.occupied_range = Range(start_dt, new_end_dt, "[)")
        active_hold.save(update_fields=["occupied_range"])

    res.status = StayReservation.Status.EARLY_CHECKOUT
    unconsumed_days = (res.end_date - depart_date).days
    refund_paise = round(res.base_amount_paise * unconsumed_days / max(1, res.total_nights))
    price_id = (
        PaymentAttempt.objects.filter(
            purpose=PaymentAttempt.Purpose.A9_STAY_RESERVATION,
            stay_allocations__stay_reservation_line__stay_reservation=res,
            status__in=(PaymentAttempt.Status.CAPTURED, PaymentAttempt.Status.PARTIALLY_REFUNDED),
        )
        .values_list("id", flat=True)
        .first()
    )
    price_attempt = (
        PaymentAttempt.objects.select_for_update().filter(id=price_id).first() if price_id else None
    )
    if refund_paise and price_attempt:
        request_standalone_refund(
            payment_attempt_id=price_attempt.id,
            amount_paise=min(refund_paise, price_attempt.amount_paise),
            reason_code="stay_early_checkout",
            idempotency_key=f"stay-early-checkout:{res.id}:{depart_date}",
            requested_by_id=user.id,
        )
    res.notes = (
        f"Guest departed early on {depart_date}. "
        f"Unconsumed nights: {unconsumed_days}. Reason: {reason}."
    )
    res.end_date = depart_date
    res.save(update_fields=["status", "end_date", "notes", "updated_at"])

    enqueue_outbox_event(
        aggregate_type="StayReservation",
        aggregate_id=res.id,
        event_type="stay_reservation.early_checkout",
        idempotency_key=f"stay_reservation_early_checkout:{res.id}",
        payload={
            "reservation_id": str(res.id),
            "customer_id": str(res.customer_id),
            "depart_date": str(depart_date),
            "status": res.status,
        },
    )

    return res


@transaction.atomic
def dispute_stay_damage(
    customer: Any,
    reservation_id: uuid.UUID | str,
    dispute_reason: str,
) -> StayReservation:
    """Guest contests damage deduction, freezing deposit settlement and opening
    an OperationsCase (§5.4, §8.2, M3-A9-06).
    """
    res = StayReservation.objects.select_for_update().get(id=reservation_id)
    if res.customer != customer and not getattr(customer, "is_staff", False):
        raise StayAuthorizationError("You do not own this stay reservation.")

    if res.status not in (StayReservation.Status.CHECKED_OUT, StayReservation.Status.INSPECTED):
        raise InvalidStayStateTransitionError(
            f"Damage dispute can only be filed after check-out inspection; "
            f"current status: {res.status}."
        )

    res.status = StayReservation.Status.DISPUTED
    res.save(update_fields=["status", "updated_at"])

    if hasattr(res, "deposit"):
        res.deposit.status = StayDeposit.Status.DISPUTED
        res.deposit.dispute_reason = dispute_reason
        res.deposit.save(update_fields=["status", "dispute_reason", "updated_at"])

    check_in = getattr(res, "check_in_record", None)
    check_out = getattr(res, "check_out_record", None)
    if (
        not check_in
        or not check_out
        or not check_in.condition_photo_urls
        or not check_out.condition_photo_urls
    ):
        raise InvalidStayStateTransitionError(
            "A damage dispute requires check-in and check-out condition evidence."
        )

    OperationsCase.objects.get_or_create(
        kind=OperationsCase.Kind.STAY_DAMAGE_DISPUTE,
        stay_reservation=res,
        status__in=(OperationsCase.Status.OPEN, OperationsCase.Status.IN_PROGRESS),
        defaults={
            "owner_team": OperationsCase.Team.QUALITY_SUPPORT,
            "summary": f"Damage dispute on Stay #{str(res.id)[:8]} at {res.unit.property.title}",
            "detail": f"Guest contests deduction: {dispute_reason}",
            "due_at": timezone.now() + datetime.timedelta(hours=24),
        },
    )

    enqueue_outbox_event(
        aggregate_type="StayReservation",
        aggregate_id=res.id,
        event_type="stay_reservation.disputed",
        idempotency_key=f"stay_reservation_disputed:{res.id}",
        payload={
            "reservation_id": str(res.id),
            "customer_id": str(res.customer_id),
            "dispute_reason": dispute_reason,
            "status": res.status,
        },
    )

    return res


@transaction.atomic
def operations_reassign_unit(
    ops_user: Any,
    reservation_id: uuid.UUID | str,
    target_unit_id: uuid.UUID | str,
    reason: str = "Operations emergency reassignment",
) -> StayReservation:
    """Operations emergency unit recovery reassignment (§8.2, M3-A9-10)."""
    if not getattr(ops_user, "is_staff", False):
        raise StayAuthorizationError("Operations staff privileges required.")

    try:
        res = StayReservation.objects.select_for_update().get(id=reservation_id)
    except StayReservation.DoesNotExist:
        raise StayAuthorizationError("Stay reservation was not found.") from None
    try:
        target_unit = Unit.objects.select_for_update().get(id=target_unit_id)
    except Unit.DoesNotExist:
        raise UnitUnavailableError("Replacement unit was not found.") from None
    if target_unit.current_status != Unit.Status.ACTIVE:
        raise UnitUnavailableError("Target unit is not active.")
    if target_unit.unit_type_id != res.unit_type_id:
        raise ValueError("Operations replacement must preserve the booked UnitType and price.")

    # Active hold
    active_hold = res.calendar_hold

    if active_hold:
        occupied_range = active_hold.occupied_range
        # Check target availability
        conflict = (
            UnitReservation.objects.filter(
                unit=target_unit,
                occupied_range__overlap=occupied_range,
            )
            .filter(
                models.Q(status=UnitReservation.Status.CONFIRMED)
                | models.Q(status=UnitReservation.Status.TENTATIVE, expires_at__gt=timezone.now())
            )
            .exists()
        )
        if conflict:
            raise UnitUnavailableError(f"Target unit {target_unit.unit_code} is already occupied.")

        active_hold.unit = target_unit
        active_hold.save(update_fields=["unit"])

    old_code = res.unit.unit_code
    res.unit = target_unit
    res.unit_type = target_unit.unit_type
    if res.status == StayReservation.Status.RECOVERY_REQUIRED:
        res.status = StayReservation.Status.CONFIRMED
    res.notes += f" [Operations reassigned from {old_code} to {target_unit.unit_code}: {reason}]"
    res.save(update_fields=["unit", "unit_type", "status", "notes", "updated_at"])

    request_notification(
        recipient_id=res.customer_id,
        purpose="stay.unit_reassigned",
        channel=NotificationIntent.Channel.IN_APP,
        template_code="stay_unit_reassigned_customer",
        context={"reservation_id": str(res.id)},
        idempotency_key=f"stay-reassigned:{res.id}:{target_unit.id}",
    )

    return res


@transaction.atomic
def operations_resolve_stay_dispute(  # noqa: PLR0912, PLR0915
    ops_user: Any,
    reservation_id: uuid.UUID | str,
    final_consumed_amount_paise: int,
    resolution_notes: str = "",
    refund_deposit: bool = True,
) -> tuple[StayDeposit, bool]:
    """Operations adjudicates damage dispute with maker-checker override, settles
    deposit and closes case (§8.2).
    """
    if not getattr(ops_user, "is_staff", False):
        raise StayAuthorizationError("Operations staff privileges required.")

    try:
        res = StayReservation.objects.select_for_update().get(id=reservation_id)
    except StayReservation.DoesNotExist:
        raise StayAuthorizationError("Stay reservation was not found.") from None
    deposit = getattr(res, "deposit", None)
    if not deposit:
        deposit = StayDeposit.objects.get(stay_reservation=res)

    if final_consumed_amount_paise < 0:
        raise ValueError("Settlement amount cannot be negative.")
    check_in = getattr(res, "check_in_record", None)
    check_out = getattr(res, "check_out_record", None)
    if final_consumed_amount_paise > 0 and (
        not check_in
        or not check_out
        or not check_in.condition_photo_urls
        or not check_out.condition_photo_urls
    ):
        raise InvalidStayStateTransitionError(
            "Deposit consumption requires check-in and check-out condition evidence."
        )
    case = (
        OperationsCase.objects.select_for_update()
        .filter(
            stay_reservation=res,
            kind=OperationsCase.Kind.STAY_DAMAGE_DISPUTE,
            status__in=(OperationsCase.Status.OPEN, OperationsCase.Status.IN_PROGRESS),
        )
        .first()
    )
    if case is None:
        raise InvalidStayStateTransitionError("No open stay damage case exists.")
    proposal = {
        "final_consumed_amount_paise": final_consumed_amount_paise,
        "refund_deposit": refund_deposit,
        "resolution_notes": resolution_notes,
    }
    if not propose_or_approve_settlement(case=case, operator=ops_user, proposal=proposal):
        return deposit, False

    auth_paise = deposit.authorized_amount_paise
    final_consumed = max(0, min(auth_paise, final_consumed_amount_paise))
    excess_paise = max(0, final_consumed_amount_paise - auth_paise)
    final_refund = (auth_paise - final_consumed) if refund_deposit else 0

    if final_refund > 0:
        dep_id = (
            PaymentAttempt.objects.filter(
                purpose=PaymentAttempt.Purpose.A9_DEPOSIT_HOLD,
                stay_allocations__stay_reservation_line__stay_reservation=res,
                status__in=(
                    PaymentAttempt.Status.CAPTURED,
                    PaymentAttempt.Status.PARTIALLY_REFUNDED,
                ),
            )
            .values_list("id", flat=True)
            .first()
        )
        deposit_attempt = (
            PaymentAttempt.objects.select_for_update().filter(id=dep_id).first() if dep_id else None
        )
        if deposit_attempt is None:
            raise ValueError("Captured stay deposit payment was not found.")
        request_standalone_refund(
            payment_attempt_id=deposit_attempt.id,
            amount_paise=final_refund,
            reason_code="stay_damage_resolution",
            idempotency_key=f"stay-damage-refund:{res.id}",
            requested_by_id=ops_user.id,
        )

    deposit.consumed_amount_paise = final_consumed
    deposit.refunded_amount_paise = final_refund
    deposit.status = StayDeposit.Status.RESOLVED
    deposit.save(
        update_fields=["consumed_amount_paise", "refunded_amount_paise", "status", "updated_at"]
    )

    if final_consumed > 0:
        StayDepositTransaction.objects.create(
            deposit=deposit,
            kind=StayDepositTransaction.Kind.CONSUMPTION,
            amount_paise=final_consumed,
            reason=f"Operations dispute settlement deduction: {resolution_notes}",
        )
    if final_refund > 0:
        StayDepositTransaction.objects.create(
            deposit=deposit,
            kind=StayDepositTransaction.Kind.REFUND,
            amount_paise=final_refund,
            reason=f"Operations dispute settlement refund: {resolution_notes}",
        )

    if excess_paise > 0:
        line = StayReservationLine.objects.create(
            stay_reservation=res,
            kind=StayReservationLine.Kind.DAMAGE_SETTLEMENT,
            description=f"Stay Damage Settlement {res.id}",
            amount_paise=excess_paise,
        )
        attempt = initiate_standalone_payment_attempt(
            purpose=PaymentAttempt.Purpose.A9_DAMAGE_SETTLEMENT,
            amount_paise=excess_paise,
            idempotency_key=f"stay-damage:{res.id}",
        )
        StayPaymentAllocation.objects.create(
            payment_attempt=attempt,
            stay_reservation_line=line,
            amount_paise=excess_paise,
        )
        res.status = StayReservation.Status.RECOVERY_REQUIRED
    else:
        res.status = StayReservation.Status.COMPLETED
    res.notes += f" [Dispute resolved by {ops_user.full_name or 'staff'}: {resolution_notes}]"
    res.save(update_fields=["status", "notes", "updated_at"])

    # Release UnitReservation hold
    if res.calendar_hold_id:
        UnitReservation.objects.filter(id=res.calendar_hold_id).update(
            status=UnitReservation.Status.RELEASED, released_at=timezone.now()
        )

    # Close any open OperationsCase
    cases = OperationsCase.objects.filter(id=case.id)
    if excess_paise > 0:
        cases.update(
            status=OperationsCase.Status.IN_PROGRESS,
            resolution_note=f"{resolution_notes} Awaiting excess recovery payment.",
        )
    else:
        cases.update(
            status=OperationsCase.Status.RESOLVED,
            resolution="SETTLED",
            resolution_note=resolution_notes,
            resolved_at=timezone.now(),
        )

    return deposit, True


@transaction.atomic
def complete_stay_damage_settlement(
    *, payment_attempt_id: uuid.UUID | str
) -> StayReservation | None:
    attempt = PaymentAttempt.objects.select_for_update().get(id=payment_attempt_id)
    if attempt.status != PaymentAttempt.Status.CAPTURED:
        return None
    allocation = (
        attempt.stay_allocations.select_related(
            "stay_reservation_line__stay_reservation__unit__property__partner"
        )
        .filter(stay_reservation_line__kind=StayReservationLine.Kind.DAMAGE_SETTLEMENT)
        .first()
    )
    if allocation is None:
        return None
    res = StayReservation.objects.select_for_update().get(
        id=allocation.stay_reservation_line.stay_reservation_id
    )
    earning = res.ledger_entries.filter(kind=PartnerLedgerEntry.Kind.EARNING).first()
    PartnerLedgerEntry.objects.get_or_create(
        idempotency_key=f"stay-damage-recovery:{attempt.id}",
        defaults={
            "partner": res.unit.property.partner,
            "stay_reservation": res,
            "kind": PartnerLedgerEntry.Kind.ADJUSTMENT,
            "status": PartnerLedgerEntry.Status.AVAILABLE,
            "gross_paise": attempt.amount_paise,
            "commission_paise": 0,
            "net_paise": attempt.amount_paise,
            "corrects": earning,
            "reason": f"Captured excess damage settlement for stay {res.id}",
            "calculation_snapshot": {"payment_attempt_id": str(attempt.id)},
        },
    )
    res.status = StayReservation.Status.COMPLETED
    res.save(update_fields=("status", "updated_at"))
    OperationsCase.objects.filter(
        stay_reservation=res,
        kind=OperationsCase.Kind.STAY_DAMAGE_DISPUTE,
        status=OperationsCase.Status.IN_PROGRESS,
    ).update(
        status=OperationsCase.Status.RESOLVED,
        resolution="SETTLED",
        resolution_note="Excess damage recovery captured.",
        resolved_at=timezone.now(),
    )
    return res


@transaction.atomic
def host_block_unit(
    partner_user: Any,
    unit_id: uuid.UUID | str,
    reason: str = "Host maintenance block",
) -> tuple[Unit, int]:
    """Host blocks or marks a physical unit under maintenance, transitioning
    affected reservations to RECOVERY_REQUIRED.
    """
    try:
        unit = (
            Unit.objects.select_for_update()
            .select_related("property__partner__user")
            .get(id=unit_id)
        )
    except Unit.DoesNotExist:
        raise UnitUnavailableError("Unit was not found.") from None

    partner = getattr(unit.property, "partner", None)
    is_owner = partner and (
        partner.user_id == getattr(partner_user, "id", None)
        or partner == partner_user
        or getattr(partner, "user", None) == partner_user
    )
    if not is_owner and not getattr(partner_user, "is_staff", False):
        raise StayAuthorizationError("Only the property host can block this unit.")

    unit.current_status = Unit.Status.MAINTENANCE
    unit.save(update_fields=["current_status", "updated_at"])

    # Query active reservations on this unit
    active_reservations = StayReservation.objects.select_for_update().filter(
        unit=unit,
        status__in=(
            StayReservation.Status.CONFIRMED,
            StayReservation.Status.HELD,
            StayReservation.Status.PAYMENT_PENDING,
        ),
    )

    impacted_count = 0
    for res in active_reservations:
        res.status = StayReservation.Status.RECOVERY_REQUIRED
        res.notes += (
            f" [Host blocked unit {unit.unit_code}: {reason}. Requires Ops recovery reassignment.]"
        )
        res.save(update_fields=["status", "notes", "updated_at"])
        impacted_count += 1

        request_notification(
            recipient_id=res.customer_id,
            purpose="stay.recovery_required",
            channel=NotificationIntent.Channel.IN_APP,
            template_code="stay_unit_reassigned_customer",
            context={
                "reservation_id": str(res.id),
                "reason": reason,
                "unit_code": unit.unit_code,
            },
            idempotency_key=f"stay-recovery:{res.id}:{unit.id}",
        )

    return unit, impacted_count


@transaction.atomic
def host_reactivate_unit(
    partner_user: Any,
    unit_id: uuid.UUID | str,
) -> Unit:
    """Host returns a maintenance-blocked unit to the available inventory pool."""
    try:
        unit = (
            Unit.objects.select_for_update()
            .select_related("property__partner__user")
            .get(id=unit_id)
        )
    except Unit.DoesNotExist:
        raise UnitUnavailableError("Unit was not found.") from None

    partner = getattr(unit.property, "partner", None)
    is_owner = partner and (
        partner.user_id == getattr(partner_user, "id", None)
        or partner == partner_user
        or getattr(partner, "user", None) == partner_user
    )
    if not is_owner and not getattr(partner_user, "is_staff", False):
        raise StayAuthorizationError("Only the property host can reopen this unit.")

    if unit.current_status == Unit.Status.ACTIVE:
        return unit
    if unit.current_status != Unit.Status.MAINTENANCE:
        raise InvalidStayStateTransitionError(
            "Only a maintenance-blocked unit can be made available."
        )

    unit.current_status = Unit.Status.ACTIVE
    unit.save(update_fields=["current_status", "updated_at"])
    return unit
