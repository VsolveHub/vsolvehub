"""Transactional domain commands for Rental Services (A7_RENTAL).

Implements:
- Concurrency locks (PostgreSQL ExclusionConstraint & select_for_update)
- RentalBooking status machine (§7.1)
- RentalDeposit status machine & settlement matrix (§4.4, §4.5, §7.2)
- Operations recovery commands (§8.1)
"""

from datetime import date, timedelta
from typing import Any
from uuid import UUID

from django.db import IntegrityError, transaction
from django.db.models import Q, Sum
from django.utils import timezone

from apps.cases.approvals import propose_or_approve_settlement
from apps.cases.models import OperationsCase
from apps.catalog.models import A7VariantConfiguration
from apps.commerce.models import PaymentAttempt, Refund
from apps.commerce.services.payments import initiate_standalone_payment_attempt
from apps.commerce.services.refunds import request_standalone_refund
from apps.foundation.services import enqueue_outbox_event, request_fingerprint
from apps.notifications.models import NotificationIntent
from apps.notifications.services import request_notification
from apps.payouts.models import PartnerLedgerEntry
from apps.rentals.exceptions import (
    AssetUnavailableError,
    InvalidRentalStateTransitionError,
    RentalAuthorizationError,
)
from apps.rentals.models import (
    AssetReservation,
    RentalAsset,
    RentalBooking,
    RentalBookingLine,
    RentalDeposit,
    RentalDepositTransaction,
    RentalExtension,
    RentalHandover,
    RentalMaintenancePeriod,
    RentalPaymentAllocation,
    RentalReturnInspection,
)
from apps.rentals.selectors import get_occupied_datetime_range


def _payment_attempt_refunded_paise(attempt: PaymentAttempt) -> int:
    refunds_sum = (
        attempt.refunds.exclude(status=Refund.Status.FAILED).aggregate(
            Sum("amount_paise")
        )["amount_paise__sum"]
        or 0
    )
    alloc_sum = 0
    if hasattr(attempt, "rental_allocations"):
        alloc_sum = (
            attempt.rental_allocations.aggregate(Sum("refunded_paise"))["refunded_paise__sum"]
            or 0
        )
    return max(int(refunds_sum), int(alloc_sum))


def _emit_rental_event(
    booking_id: UUID | str, event_type: str, payload: dict[str, Any] | None = None
) -> bool:
    """Emits a domain OutboxEvent for rental lifecycle state transitions."""
    event_payload = payload or {}
    enqueue_outbox_event(
        aggregate_type="rental_booking",
        aggregate_id=UUID(str(booking_id)),
        event_type=event_type,
        idempotency_key=f"{booking_id}:{request_fingerprint(event_payload)[:32]}",
        payload=event_payload,
    )
    return True


@transaction.atomic
def handle_rental_checkout_failure(*, payment_attempt_id: UUID | str) -> None:
    """Release only the failed checkout's hold and unwind a captured sibling payment."""
    attempt = PaymentAttempt.objects.select_for_update().get(id=payment_attempt_id)
    allocation = (
        attempt.rental_allocations.select_related("rental_booking_line__rental_booking")
        .order_by("created_at")
        .first()
    )
    if allocation is None:
        return
    booking = RentalBooking.objects.select_for_update().get(
        id=allocation.rental_booking_line.rental_booking_id
    )
    if booking.status not in (RentalBooking.Status.HELD, RentalBooking.Status.PAYMENT_PENDING):
        return
    siblings = PaymentAttempt.objects.filter(
        rental_allocations__rental_booking_line__rental_booking=booking,
        purpose__in=(
            PaymentAttempt.Purpose.A7_RENTAL_BOOKING,
            PaymentAttempt.Purpose.A7_DEPOSIT_HOLD,
        ),
        status__in=(PaymentAttempt.Status.CAPTURED, PaymentAttempt.Status.PARTIALLY_REFUNDED),
    ).distinct()
    for sibling in siblings:
        remaining = sibling.amount_paise - _payment_attempt_refunded_paise(sibling)
        if remaining > 0:
            request_standalone_refund(
                payment_attempt_id=sibling.id,
                amount_paise=remaining,
                reason_code="rental_checkout_payment_failed",
                idempotency_key=f"rental-failed-refund:{booking.id}:{sibling.id}",
            )
    AssetReservation.objects.filter(id=booking.reservation_id).update(
        status=AssetReservation.Status.RELEASED,
        released_at=timezone.now(),
    )
    booking.status = RentalBooking.Status.FAILED
    booking.save(update_fields=("status", "updated_at"))
    _emit_rental_event(booking.id, "rental.checkout_failed", {"booking_id": str(booking.id)})


def create_rental_hold(  # noqa: PLR0912, PLR0915
    *,
    customer: Any,
    asset_id: UUID | str,
    start_date: date,
    end_date: date,
    quantity: int = 1,
    delivery_mode: str = RentalBooking.DeliveryMode.PICKUP,
    delivery_address_id: UUID | str | None = None,
    hold_ttl_minutes: int = 15,
) -> RentalBooking:
    """Create a tentative booking and asset reservation hold.

    Enforces PostgreSQL ExclusionConstraint on serialized assets, and
    select_for_update row-level capacity checks on fungible pooled assets.
    """
    if end_date < start_date:
        raise ValueError("Rental end date cannot be earlier than start date.")
    if quantity <= 0:
        raise ValueError("Rental quantity must be positive.")

    occupied = get_occupied_datetime_range(start_date, end_date)
    expires_at = timezone.now() + timedelta(minutes=hold_ttl_minutes)

    with transaction.atomic():
        # Acquire asset
        try:
            asset = RentalAsset.objects.select_for_update().get(id=asset_id)
        except RentalAsset.DoesNotExist:
            raise AssetUnavailableError(f"RentalAsset {asset_id} not found.") from None

        if asset.current_status != RentalAsset.Status.ACTIVE:
            raise AssetUnavailableError(f"Asset is not active (status: {asset.current_status}).")
        if (
            not asset.variant.is_active
            or asset.variant.service.status != "ACTIVE"
            or not asset.variant.service.subcategory.is_active
            or not asset.variant.service.subcategory.category.is_active
        ):
            raise AssetUnavailableError("This rental product is not currently bookable.")
        AssetReservation.objects.filter(
            asset=asset,
            status=AssetReservation.Status.TENTATIVE,
            expires_at__lte=timezone.now(),
        ).update(status=AssetReservation.Status.RELEASED, released_at=timezone.now())

        config = A7VariantConfiguration.objects.filter(
            variant=asset.variant,
            status=A7VariantConfiguration.Status.ACTIVE,
        ).first()
        if config is None:
            raise AssetUnavailableError("This rental variant has no active booking policy.")
        rental_days = max(1, (end_date - start_date).days + 1)
        if not config.min_rental_days <= rental_days <= config.max_rental_days:
            raise ValueError(
                f"Rental duration must be between {config.min_rental_days} and "
                f"{config.max_rental_days} days."
            )
        if delivery_mode == RentalBooking.DeliveryMode.PICKUP and not config.pickup_allowed:
            raise ValueError("Pickup is not allowed for this rental variant.")
        if delivery_mode == RentalBooking.DeliveryMode.DELIVERY and not config.delivery_allowed:
            raise ValueError("Delivery is not allowed for this rental variant.")
        if delivery_mode == RentalBooking.DeliveryMode.DELIVERY and delivery_address_id is None:
            raise ValueError("A delivery address is required for delivery rentals.")

        if asset.is_serialized:
            if quantity != 1:
                raise AssetUnavailableError(
                    "A serialized asset can only be reserved one unit at a time."
                )
            candidates = (
                RentalAsset.objects.select_for_update()
                .filter(
                    partner=asset.partner,
                    variant=asset.variant,
                    daily_price_paise=asset.daily_price_paise,
                    deposit_paise=asset.deposit_paise,
                    condition_grade=asset.condition_grade,
                    is_serialized=True,
                    current_status=RentalAsset.Status.ACTIVE,
                )
                .order_by("id")
            )
            chosen = None
            for candidate in candidates:
                AssetReservation.objects.filter(
                    asset=candidate,
                    status=AssetReservation.Status.TENTATIVE,
                    expires_at__lte=timezone.now(),
                ).update(status=AssetReservation.Status.RELEASED, released_at=timezone.now())
                unavailable = (
                    AssetReservation.objects.filter(
                        asset=candidate,
                        occupied_range__overlap=occupied,
                    )
                    .filter(
                        Q(status=AssetReservation.Status.CONFIRMED)
                        | Q(
                            status=AssetReservation.Status.TENTATIVE,
                            expires_at__gt=timezone.now(),
                        )
                    )
                    .exists()
                )
                maintenance = RentalMaintenancePeriod.objects.filter(
                    asset=candidate,
                    start_date__lte=end_date,
                    end_date__gte=start_date,
                ).exists()
                if not unavailable and not maintenance:
                    chosen = candidate
                    break
            if chosen is None:
                raise AssetUnavailableError(
                    "No equivalent serialized item is available for the requested dates."
                )
            asset = chosen

        # Check vendor maintenance periods
        in_maintenance = RentalMaintenancePeriod.objects.filter(
            asset=asset,
            start_date__lte=end_date,
            end_date__gte=start_date,
        ).exists()
        if in_maintenance:
            raise AssetUnavailableError(
                "Asset is scheduled for maintenance during requested dates."
            )

        # The asset row lock serializes every competing quantity decision for a pool.
        if not asset.is_serialized:
            reserved = (
                AssetReservation.objects.filter(
                    asset=asset,
                    occupied_range__overlap=occupied,
                )
                .filter(
                    Q(status=AssetReservation.Status.CONFIRMED)
                    | Q(
                        status=AssetReservation.Status.TENTATIVE,
                        expires_at__gt=timezone.now(),
                    )
                )
                .aggregate(total=Sum("reserved_quantity"))["total"]
                or 0
            )
            if reserved + quantity > asset.quantity_available:
                raise AssetUnavailableError(
                    "No units available in this pool for the requested dates."
                )

        # Create reservation
        try:
            reservation = AssetReservation.objects.create(
                asset=asset,
                is_serialized=asset.is_serialized,
                reserved_quantity=quantity,
                occupied_range=occupied,
                status=AssetReservation.Status.TENTATIVE,
                expires_at=expires_at,
            )
        except IntegrityError:
            raise AssetUnavailableError(
                "This asset is already reserved for the requested date range."
            ) from None

        # Create booking
        booking = RentalBooking.objects.create(
            customer=customer,
            asset=asset,
            reservation=reservation,
            rental_start=start_date,
            rental_end=end_date,
            quantity=quantity,
            delivery_mode=delivery_mode,
            delivery_address_id=delivery_address_id,
            status=RentalBooking.Status.HELD,
            policy_snapshot={
                "configuration_id": str(config.id),
                "configuration_version": config.version,
                "daily_price_paise": asset.daily_price_paise,
                "late_fee_per_day_paise": config.late_fee_per_day_paise,
                "minor_damage_cap_paise": config.minor_damage_cap_paise,
                "tax_basis_points": 1800,
            },
        )

        # Price calculation
        base_rent = rental_days * asset.daily_price_paise * quantity
        tax = base_rent * 1800 // 10000
        unit_deposit = (
            max(asset.deposit_paise, config.default_deposit_paise) if config.deposit_required else 0
        )
        deposit_paise = unit_deposit * quantity

        RentalBookingLine.objects.create(
            rental_booking=booking,
            line_type=RentalBookingLine.LineType.BASE_RENTAL,
            amount_paise=base_rent,
            description=f"Rental ({rental_days} days @ ₹{asset.daily_price_paise / 100:.2f}/day)",
        )

        if tax > 0:
            RentalBookingLine.objects.create(
                rental_booking=booking,
                line_type=RentalBookingLine.LineType.TAX,
                amount_paise=tax,
                description="GST (18%)",
            )
        if deposit_paise > 0:
            RentalBookingLine.objects.create(
                rental_booking=booking,
                line_type=RentalBookingLine.LineType.DEPOSIT_HOLD,
                amount_paise=deposit_paise,
                description="Refundable security deposit hold",
            )

        # Create deposit record
        RentalDeposit.objects.create(
            rental_booking=booking,
            amount_paise=deposit_paise,
            status=RentalDeposit.Status.REQUIRED
            if deposit_paise > 0
            else RentalDeposit.Status.RELEASED,
        )

        return booking


def confirm_rental_booking(
    *,
    booking_id: UUID | str,
    payment_attempt: PaymentAttempt | None,
    customer: Any,
) -> RentalBooking:
    """Confirm a held rental booking upon successful payment capture."""
    with transaction.atomic():
        booking = RentalBooking.objects.select_for_update().get(id=booking_id)

        if booking.customer != customer:
            raise RentalAuthorizationError("Only the booking's customer can confirm it.")

        if booking.status not in (RentalBooking.Status.HELD, RentalBooking.Status.PAYMENT_PENDING):
            raise InvalidRentalStateTransitionError(
                f"Cannot confirm booking from status {booking.status}."
            )

        attempt_ids = list(
            PaymentAttempt.objects.filter(
                rental_allocations__rental_booking_line__rental_booking=booking
            )
            .values_list("id", flat=True)
            .distinct()
        )
        payment_attempts = list(
            PaymentAttempt.objects.select_for_update().filter(id__in=attempt_ids)
        )
        if payment_attempt is not None and payment_attempt.id not in {
            item.id for item in payment_attempts
        }:
            raise ValueError("The payment attempt does not belong to this rental booking.")

        charge_lines = list(
            booking.lines.exclude(line_type=RentalBookingLine.LineType.DEPOSIT_HOLD)
        )
        deposit_lines = list(
            booking.lines.filter(line_type=RentalBookingLine.LineType.DEPOSIT_HOLD)
        )
        expected = {
            PaymentAttempt.Purpose.A7_RENTAL_BOOKING: sum(
                line.amount_paise for line in charge_lines
            ),
            PaymentAttempt.Purpose.A7_DEPOSIT_HOLD: sum(
                line.amount_paise for line in deposit_lines
            ),
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
                raise InvalidRentalStateTransitionError(
                    f"Captured {purpose} payment is required before confirmation."
                )
            if matching[0].amount_paise != amount:
                raise ValueError(
                    "Captured rental payment does not reconcile to immutable booking lines."
                )

        # Confirm reservation
        if booking.reservation:
            booking.reservation.status = AssetReservation.Status.CONFIRMED
            booking.reservation.save(update_fields=("status",))

        # Confirm deposit
        deposit = getattr(booking, "deposit", None)
        if deposit and deposit.status == RentalDeposit.Status.REQUIRED:
            deposit.status = RentalDeposit.Status.AUTHORIZED
            deposit.authorized_amount_paise = deposit.amount_paise
            deposit.save(update_fields=("status", "authorized_amount_paise", "updated_at"))

            RentalDepositTransaction.objects.create(
                rental_deposit=deposit,
                kind=RentalDepositTransaction.Kind.AUTHORIZATION,
                amount_paise=deposit.amount_paise,
                reason="Pre-authorized at checkout",
            )

        booking.status = RentalBooking.Status.CONFIRMED
        booking.save(update_fields=("status", "updated_at"))

        _emit_rental_event(
            booking.id,
            "rental_booking.confirmed",
            {
                "booking_id": str(booking.id),
                "asset_id": str(booking.asset_id),
                "customer_id": str(booking.customer_id),
                "rental_start": str(booking.rental_start),
                "rental_end": str(booking.rental_end),
            },
        )
        return booking


@transaction.atomic
def initiate_rental_checkout(
    *, booking_id: UUID | str, customer: Any, idempotency_key: str
) -> list[PaymentAttempt]:
    """Create provider-backed booking and deposit charges with immutable allocations."""
    try:
        booking = RentalBooking.objects.select_for_update().get(id=booking_id)
    except RentalBooking.DoesNotExist:
        raise RentalAuthorizationError("Rental booking was not found.") from None
    if booking.customer != customer:
        raise RentalAuthorizationError("Only the booking customer can start payment.")
    if booking.status not in (RentalBooking.Status.HELD, RentalBooking.Status.PAYMENT_PENDING):
        raise InvalidRentalStateTransitionError(
            f"Cannot start payment from status {booking.status}."
        )
    if (
        not booking.reservation
        or booking.reservation.status != AssetReservation.Status.TENTATIVE
        or booking.reservation.expires_at <= timezone.now()
    ):
        raise AssetUnavailableError("The rental hold expired before payment could start.")

    groups = (
        (
            PaymentAttempt.Purpose.A7_RENTAL_BOOKING,
            list(booking.lines.exclude(line_type=RentalBookingLine.LineType.DEPOSIT_HOLD)),
        ),
        (
            PaymentAttempt.Purpose.A7_DEPOSIT_HOLD,
            list(booking.lines.filter(line_type=RentalBookingLine.LineType.DEPOSIT_HOLD)),
        ),
    )
    attempts: list[PaymentAttempt] = []
    for purpose, lines in groups:
        amount = sum(line.amount_paise for line in lines)
        if amount <= 0:
            continue
        key = f"{idempotency_key}:{purpose}:{booking.id}"
        existing = (
            PaymentAttempt.objects.filter(
                purpose=purpose,
                rental_allocations__rental_booking_line__rental_booking=booking,
            )
            .exclude(status__in=(PaymentAttempt.Status.FAILED, PaymentAttempt.Status.EXPIRED))
            .distinct()
            .order_by("created_at")
            .first()
        )
        if existing is not None:
            if existing.amount_paise != amount:
                raise ValueError("The rental price changed after payment was started.")
            attempts.append(existing)
            continue
        attempt = initiate_standalone_payment_attempt(
            purpose=purpose,
            amount_paise=amount,
            idempotency_key=key,
            expires_at=booking.reservation.expires_at,
        )
        for line in lines:
            RentalPaymentAllocation.objects.create(
                payment_attempt=attempt,
                rental_booking_line=line,
                amount_paise=line.amount_paise,
            )
        attempts.append(attempt)

    if sum(item.amount_paise for item in attempts) != sum(
        line.amount_paise for line in booking.lines.all()
    ):
        raise ValueError("Rental payment allocations do not reconcile to the booking total.")
    booking.status = RentalBooking.Status.PAYMENT_PENDING
    booking.save(update_fields=("status", "updated_at"))
    return attempts


def complete_rental_checkout(*, payment_attempt_id: UUID | str) -> RentalBooking | None:
    """Confirm a rental only when every allocated provider charge has captured."""
    attempt = PaymentAttempt.objects.get(id=payment_attempt_id)
    allocation = attempt.rental_allocations.select_related(
        "rental_booking_line__rental_booking__customer"
    ).first()
    if allocation is None:
        return None
    booking = allocation.rental_booking_line.rental_booking
    try:
        return confirm_rental_booking(
            booking_id=booking.id,
            payment_attempt=attempt,
            customer=booking.customer,
        )
    except InvalidRentalStateTransitionError:
        if booking.status == RentalBooking.Status.CONFIRMED:
            return booking
        return None


def record_handover(
    *,
    booking_id: UUID | str,
    partner: Any,
    photo_urls: list[str],
    condition_notes: str = "",
    checklist: dict[str, Any] | None = None,
    assigned_serial: str = "",
) -> RentalHandover:
    """Record outbound handover condition check and transfer custody to customer."""
    with transaction.atomic():
        booking = RentalBooking.objects.select_for_update().get(id=booking_id)

        if booking.asset.partner != partner:
            raise RentalAuthorizationError("Only the owning vendor can record handover.")

        if booking.status != RentalBooking.Status.CONFIRMED:
            raise InvalidRentalStateTransitionError(
                f"Cannot handover booking from status {booking.status}."
            )

        handover = RentalHandover.objects.create(
            rental_booking=booking,
            partner=partner,
            assigned_serial=assigned_serial or booking.asset.asset_identifier,
            condition_notes=condition_notes,
            photo_urls=photo_urls,
            checklist=checklist or {},
            handed_over_at=timezone.now(),
        )

        booking.assigned_serial = handover.assigned_serial
        booking.status = RentalBooking.Status.HANDED_OVER
        booking.save(update_fields=("status", "assigned_serial", "updated_at"))

        # Transition deposit from AUTHORIZED to HELD during active custody
        deposit = getattr(booking, "deposit", None)
        if deposit and deposit.status == RentalDeposit.Status.AUTHORIZED:
            deposit.status = RentalDeposit.Status.HELD
            deposit.save(update_fields=("status", "updated_at"))

        # Booking progresses to ACTIVE
        booking.status = RentalBooking.Status.ACTIVE
        booking.save(update_fields=("status", "updated_at"))

        _emit_rental_event(
            booking.id,
            "rental_booking.handed_over",
            {
                "booking_id": str(booking.id),
                "handover_id": str(handover.id),
                "assigned_serial": handover.assigned_serial,
            },
        )

        return handover


def request_extension(
    *,
    booking_id: UUID | str,
    new_end_date: date,
) -> RentalExtension:
    """Request extension of an active rental."""
    with transaction.atomic():
        booking = RentalBooking.objects.select_for_update().get(id=booking_id)

        if booking.status != RentalBooking.Status.ACTIVE:
            raise InvalidRentalStateTransitionError(
                f"Cannot extend booking from status {booking.status}."
            )

        if new_end_date <= booking.rental_end:
            raise ValueError("New end date must be after current rental end date.")

        extended_start = booking.rental_end + timedelta(days=1)
        extension_range = get_occupied_datetime_range(extended_start, new_end_date)

        # Check asset reservation conflict
        if booking.asset.is_serialized:
            conflict = (
                AssetReservation.objects.filter(
                    asset=booking.asset,
                    occupied_range__overlap=extension_range,
                )
                .filter(
                    Q(status=AssetReservation.Status.CONFIRMED)
                    | Q(
                        status=AssetReservation.Status.TENTATIVE,
                        expires_at__gt=timezone.now(),
                    )
                )
                .exclude(id=booking.reservation_id)
                .exists()
            )
            if conflict:
                raise AssetUnavailableError(
                    "Asset is already reserved by another customer for the extended window."
                )
        else:
            reserved = (
                AssetReservation.objects.filter(
                    asset=booking.asset,
                    occupied_range__overlap=extension_range,
                )
                .filter(
                    Q(status=AssetReservation.Status.CONFIRMED)
                    | Q(
                        status=AssetReservation.Status.TENTATIVE,
                        expires_at__gt=timezone.now(),
                    )
                )
                .exclude(id=booking.reservation_id)
                .aggregate(total=Sum("reserved_quantity"))["total"]
                or 0
            )
            if reserved + booking.quantity > booking.asset.quantity_available:
                raise AssetUnavailableError(
                    "No units available in this pool for the requested extension."
                )

        extension_days = (new_end_date - booking.rental_end).days
        unit_price = int(
            booking.policy_snapshot.get("daily_price_paise", booking.asset.daily_price_paise)
        )
        price_delta = extension_days * unit_price * booking.quantity

        extension = RentalExtension.objects.create(
            rental_booking=booking,
            previous_end=booking.rental_end,
            new_end=new_end_date,
            price_delta_paise=price_delta,
            status=RentalExtension.Status.PENDING,
        )

        return extension


def approve_extension(
    *,
    extension_id: UUID | str,
    partner: Any,
) -> RentalExtension:
    """Approve and apply an extension revision."""
    with transaction.atomic():
        extension = RentalExtension.objects.select_for_update().get(id=extension_id)
        booking = extension.rental_booking

        if booking.asset.partner != partner:
            raise RentalAuthorizationError("Only the owning vendor can approve an extension.")

        if extension.status != RentalExtension.Status.PENDING:
            raise InvalidRentalStateTransitionError(
                f"Cannot approve extension from status {extension.status}."
            )

        # Approval is not fulfilment: the occupied range changes only after the
        # provider capture completes through confirm_extension_payment.
        extension.status = RentalExtension.Status.APPROVED
        extension.approved_at = timezone.now()
        extension.save(update_fields=("status", "approved_at"))

        return extension


def confirm_extension_payment(
    *,
    extension_id: UUID | str,
    payment_attempt: PaymentAttempt,
    customer: Any,
) -> RentalExtension:
    """Customer confirms payment for an extension, updating reservation and booking."""
    with transaction.atomic():
        extension = RentalExtension.objects.select_for_update().get(id=extension_id)
        booking = extension.rental_booking

        if booking.customer != customer:
            raise RentalAuthorizationError("Only the booking customer can pay for an extension.")

        if extension.status != RentalExtension.Status.APPROVED:
            raise InvalidRentalStateTransitionError(
                f"Cannot pay for extension in status {extension.status}."
            )
        if payment_attempt.status != PaymentAttempt.Status.CAPTURED:
            raise InvalidRentalStateTransitionError("Extension payment has not been captured.")
        if payment_attempt.purpose != PaymentAttempt.Purpose.A7_EXTENSION:
            raise ValueError("Payment purpose does not match a rental extension.")
        allocation = payment_attempt.rental_allocations.filter(
            rental_booking_line__rental_booking=booking,
            rental_booking_line__line_type=RentalBookingLine.LineType.EXTENSION,
        ).first()
        if allocation is None or allocation.amount_paise != extension.price_delta_paise:
            raise ValueError("Extension payment is not allocated to this booking revision.")

        if booking.rental_end == extension.new_end:
            return extension

        # Extend reservation occupied_range
        new_range = get_occupied_datetime_range(booking.rental_start, extension.new_end)
        if booking.reservation:
            booking.reservation.occupied_range = new_range
            booking.reservation.save(update_fields=("occupied_range",))

        # Add extension booking line
        booking.rental_end = extension.new_end
        booking.status = RentalBooking.Status.ACTIVE
        booking.save(update_fields=("rental_end", "status", "updated_at"))

        extension.status = RentalExtension.Status.APPROVED
        extension.approved_at = timezone.now()
        extension.save(update_fields=("status", "approved_at"))

        _emit_rental_event(
            booking.id,
            "rental_booking.extended",
            {
                "extension_id": str(extension.id),
                "new_end": str(extension.new_end),
                "price_delta_paise": extension.price_delta_paise,
            },
        )

        return extension


@transaction.atomic
def initiate_rental_extension_payment(
    *, extension_id: UUID | str, customer: Any, idempotency_key: str
) -> PaymentAttempt:
    extension = (
        RentalExtension.objects.select_for_update()
        .select_related("rental_booking__customer", "rental_booking__reservation")
        .get(id=extension_id)
    )
    booking = extension.rental_booking
    if booking.customer != customer:
        raise RentalAuthorizationError("Only the booking customer can pay for an extension.")
    if extension.status != RentalExtension.Status.APPROVED:
        raise InvalidRentalStateTransitionError(
            "The vendor must approve the extension before payment."
        )
    key = f"{idempotency_key}:A7_EXTENSION:{extension.id}"
    existing = (
        PaymentAttempt.objects.filter(
            purpose=PaymentAttempt.Purpose.A7_EXTENSION,
            rental_allocations__rental_booking_line__description=f"Extension {extension.id}",
        )
        .exclude(status__in=(PaymentAttempt.Status.FAILED, PaymentAttempt.Status.EXPIRED))
        .first()
    )
    if existing is not None:
        return existing
    line = RentalBookingLine.objects.create(
        rental_booking=booking,
        line_type=RentalBookingLine.LineType.EXTENSION,
        amount_paise=extension.price_delta_paise,
        description=f"Extension {extension.id}",
    )
    attempt = initiate_standalone_payment_attempt(
        purpose=PaymentAttempt.Purpose.A7_EXTENSION,
        amount_paise=extension.price_delta_paise,
        idempotency_key=key,
    )
    RentalPaymentAllocation.objects.create(
        payment_attempt=attempt,
        rental_booking_line=line,
        amount_paise=line.amount_paise,
    )
    return attempt


def complete_rental_extension(*, payment_attempt_id: UUID | str) -> RentalExtension | None:
    attempt = PaymentAttempt.objects.get(id=payment_attempt_id)
    allocation = (
        attempt.rental_allocations.select_related("rental_booking_line__rental_booking__customer")
        .filter(rental_booking_line__line_type=RentalBookingLine.LineType.EXTENSION)
        .first()
    )
    if allocation is None:
        return None
    description = allocation.rental_booking_line.description
    if not description.startswith("Extension "):
        return None
    extension = RentalExtension.objects.get(id=description.removeprefix("Extension "))
    return confirm_extension_payment(
        extension_id=extension.id,
        payment_attempt=attempt,
        customer=extension.rental_booking.customer,
    )


def reject_extension(
    *,
    extension_id: UUID | str,
    partner: Any,
) -> RentalExtension:
    """Reject a pending extension revision. No side effects to reverse — nothing was applied yet."""
    with transaction.atomic():
        extension = RentalExtension.objects.select_for_update().get(id=extension_id)
        booking = extension.rental_booking

        if booking.asset.partner != partner:
            raise RentalAuthorizationError("Only the owning vendor can reject an extension.")

        if extension.status != RentalExtension.Status.PENDING:
            raise InvalidRentalStateTransitionError(
                f"Cannot reject extension from status {extension.status}."
            )

        extension.status = RentalExtension.Status.REJECTED
        extension.save(update_fields=("status",))

        return extension


def initiate_return(
    *,
    booking_id: UUID | str,
    partner: Any,
) -> RentalBooking:
    """Initiate return process when customer is ready or return is underway."""
    with transaction.atomic():
        booking = RentalBooking.objects.select_for_update().get(id=booking_id)

        if booking.asset.partner != partner:
            raise RentalAuthorizationError("Only the owning vendor can initiate a return.")

        if booking.status not in (RentalBooking.Status.ACTIVE, RentalBooking.Status.HANDED_OVER):
            raise InvalidRentalStateTransitionError(
                f"Cannot initiate return from status {booking.status}."
            )

        booking.status = RentalBooking.Status.RETURN_PENDING
        booking.save(update_fields=("status", "updated_at"))
        return booking


def record_return_inspection(
    *,
    booking_id: UUID | str,
    partner: Any,
    photo_urls: list[str],
    condition_notes: str = "",
    damage_found: bool = False,
    damage_estimated_paise: int = 0,
    damage_details: dict[str, Any] | None = None,
    late_days: int = 0,
) -> RentalReturnInspection:
    """Record inbound return inspection and apply §4.5 Settlement Matrix."""
    with transaction.atomic():
        booking = RentalBooking.objects.select_for_update().get(id=booking_id)

        if booking.asset.partner != partner:
            raise RentalAuthorizationError("Only owning vendor can record inspection.")

        if booking.status not in (
            RentalBooking.Status.ACTIVE,
            RentalBooking.Status.RETURN_PENDING,
            RentalBooking.Status.RETURNED,
        ):
            raise InvalidRentalStateTransitionError(
                f"Cannot inspect booking from status {booking.status}."
            )

        booking.status = RentalBooking.Status.RETURNED

        # Late fee calculation
        config = getattr(booking.asset.variant, "a7_configurations", None)
        active_config = config.filter(status="ACTIVE").first() if config else None
        per_day_late_fee = int(
            booking.policy_snapshot.get("late_fee_per_day_paise")
            or booking.policy_snapshot.get("daily_price_paise", booking.asset.daily_price_paise)
        )
        late_fee_paise = late_days * per_day_late_fee

        inspection = RentalReturnInspection.objects.create(
            rental_booking=booking,
            partner=partner,
            condition_notes=condition_notes,
            photo_urls=photo_urls,
            damage_found=damage_found,
            damage_estimated_paise=damage_estimated_paise,
            damage_details=damage_details or {},
            late_days=late_days,
            late_fee_paise=late_fee_paise,
            settlement_matrix_outcome={
                "late_fee_paise": late_fee_paise,
                "damage_estimated_paise": damage_estimated_paise,
                "total_deduction_paise": late_fee_paise + damage_estimated_paise,
            },
            returned_at=timezone.now(),
        )

        booking.status = RentalBooking.Status.INSPECTED
        booking.save(update_fields=("status", "updated_at"))

        # Apply settlement matrix (§4.5)
        _apply_settlement_matrix(booking, inspection, active_config)

        return inspection


def _apply_settlement_matrix(  # noqa: PLR0915
    booking: RentalBooking,
    inspection: RentalReturnInspection,
    config: Any,
) -> None:
    """Internal helper to apply settlement logic on inspected booking."""
    deposit = getattr(booking, "deposit", None)
    if not deposit or deposit.status != RentalDeposit.Status.HELD:
        booking.status = RentalBooking.Status.COMPLETED
        booking.save(update_fields=("status", "updated_at"))
        _settle_vendor_earnings(booking)
        _emit_rental_event(
            booking.id, "rental_booking.returned", {"inspection_id": str(inspection.id)}
        )
        _emit_rental_event(
            booking.id, "rental_booking.settled", {"consumed_paise": 0, "refunded_paise": 0}
        )
        return

    # §4.5 Settlement photo evidence rule:
    # If damage is claimed, photos MUST exist in both handover and return inspection.
    has_damage = inspection.damage_found or inspection.damage_estimated_paise > 0
    if has_damage:
        handover = getattr(booking, "handover", None)
        handover_photos = (handover.photo_urls if handover else []) or []
        inspection_photos = inspection.photo_urls or []
        if not handover_photos or not inspection_photos:
            deposit.status = RentalDeposit.Status.DISPUTED
            deposit.save(update_fields=("status", "updated_at"))

            booking.status = RentalBooking.Status.DISPUTED
            booking.save(update_fields=("status", "updated_at"))

            OperationsCase.objects.create(
                kind=OperationsCase.Kind.RENTAL_DEPOSIT_DISPUTE,
                owner_team=OperationsCase.Team.QUALITY_SUPPORT,
                rental_booking=booking,
                summary=f"Damage claim on Rental #{str(booking.id)[:8]} lacks photo evidence",
                detail=(
                    f"Vendor reported ₹{inspection.damage_estimated_paise / 100:.2f} damage, but "
                    f"handover photos ({len(handover_photos)}) or "
                    f"return photos ({len(inspection_photos)}) are missing. "
                    f"Photo evidence is strictly required for damage claims."
                ),
                due_at=timezone.now() + timedelta(hours=24),
            )
            _emit_rental_event(
                booking.id, "rental_booking.returned", {"inspection_id": str(inspection.id)}
            )
            _emit_rental_event(
                booking.id, "rental_booking.disputed", {"reason": "missing_photo_evidence"}
            )
            return

    total_deduction = inspection.late_fee_paise + inspection.damage_estimated_paise
    minor_damage_cap = int(
        booking.policy_snapshot.get(
            "minor_damage_cap_paise",
            config.minor_damage_cap_paise if config else 0,
        )
    )

    if total_deduction == 0:
        dep_id = (
            PaymentAttempt.objects.filter(
                purpose=PaymentAttempt.Purpose.A7_DEPOSIT_HOLD,
                rental_allocations__rental_booking_line__rental_booking=booking,
                status__in=(
                    PaymentAttempt.Status.CAPTURED,
                    PaymentAttempt.Status.PARTIALLY_REFUNDED,
                ),
            )
            .values_list("id", flat=True)
            .first()
        )
        deposit_attempt = (
            PaymentAttempt.objects.select_for_update().filter(id=dep_id).first()
            if dep_id
            else None
        )
        if deposit.amount_paise and deposit_attempt:
            request_standalone_refund(
                payment_attempt_id=deposit_attempt.id,
                amount_paise=deposit.amount_paise,
                reason_code="rental_clean_return",
                idempotency_key=f"rental-deposit-clean:{booking.id}",
                requested_by_id=booking.customer_id,
            )
        # Case: Normal return, on time, no damage -> Full deposit released
        deposit.status = RentalDeposit.Status.RELEASED
        deposit.refunded_amount_paise = deposit.amount_paise
        deposit.save(update_fields=("status", "refunded_amount_paise", "updated_at"))

        RentalDepositTransaction.objects.create(
            rental_deposit=deposit,
            kind=RentalDepositTransaction.Kind.REFUND,
            amount_paise=deposit.amount_paise,
            reason="Clean return: full deposit released",
        )

        booking.status = RentalBooking.Status.SETTLED
        booking.save(update_fields=("status", "updated_at"))
        booking.status = RentalBooking.Status.COMPLETED
        booking.save(update_fields=("status", "updated_at"))
        _settle_vendor_earnings(booking)

        _emit_rental_event(
            booking.id, "rental_booking.returned", {"inspection_id": str(inspection.id)}
        )
        _emit_rental_event(
            booking.id,
            "rental_booking.settled",
            {"consumed_paise": 0, "refunded_paise": deposit.amount_paise},
        )

    elif inspection.damage_estimated_paise <= minor_damage_cap:
        # Case: Minor damage / late return within cap -> Auto-approved partial/full consumption
        consumed = min(total_deduction, deposit.amount_paise)
        refunded = deposit.amount_paise - consumed
        excess_paise = max(0, total_deduction - deposit.amount_paise)

        deposit.consumed_amount_paise = consumed
        deposit.refunded_amount_paise = refunded
        deposit.status = (
            RentalDeposit.Status.FULLY_CONSUMED
            if refunded == 0
            else RentalDeposit.Status.PARTIALLY_CONSUMED
        )
        deposit.save(
            update_fields=("status", "consumed_amount_paise", "refunded_amount_paise", "updated_at")
        )

        RentalDepositTransaction.objects.create(
            rental_deposit=deposit,
            kind=RentalDepositTransaction.Kind.CONSUMPTION,
            amount_paise=consumed,
            reason=f"Settlement: damage/late fee deduction (₹{consumed / 100:.2f})",
        )
        if refunded > 0:
            dep_id = (
                PaymentAttempt.objects.filter(
                    purpose=PaymentAttempt.Purpose.A7_DEPOSIT_HOLD,
                    rental_allocations__rental_booking_line__rental_booking=booking,
                    status__in=(
                        PaymentAttempt.Status.CAPTURED,
                        PaymentAttempt.Status.PARTIALLY_REFUNDED,
                    ),
                )
                .values_list("id", flat=True)
                .first()
            )
            deposit_attempt = (
                PaymentAttempt.objects.select_for_update().filter(id=dep_id).first()
                if dep_id
                else None
            )
            if deposit_attempt:
                request_standalone_refund(
                    payment_attempt_id=deposit_attempt.id,
                    amount_paise=refunded,
                    reason_code="rental_deposit_remainder",
                    idempotency_key=f"rental-deposit-remainder:{booking.id}",
                    requested_by_id=booking.customer_id,
                )
            RentalDepositTransaction.objects.create(
                rental_deposit=deposit,
                kind=RentalDepositTransaction.Kind.REFUND,
                amount_paise=refunded,
                reason=f"Settlement: remaining deposit refund (₹{refunded / 100:.2f})",
            )

        # M3-A7-12: If total deduction exceeds deposit hold, capture 100% and create
        # excess damage PaymentAttempt against customer (purpose=A7_DAMAGE_SETTLEMENT)
        if excess_paise > 0:
            recovery_line = RentalBookingLine.objects.create(
                rental_booking=booking,
                line_type=RentalBookingLine.LineType.DAMAGE_SETTLEMENT,
                amount_paise=excess_paise,
                description=f"Damage settlement {inspection.id}",
            )
            recovery_attempt = initiate_standalone_payment_attempt(
                purpose=PaymentAttempt.Purpose.A7_DAMAGE_SETTLEMENT,
                amount_paise=excess_paise,
                idempotency_key=f"rental-damage:{inspection.id}",
            )
            RentalPaymentAllocation.objects.create(
                payment_attempt=recovery_attempt,
                rental_booking_line=recovery_line,
                amount_paise=excess_paise,
            )

        booking.status = RentalBooking.Status.SETTLED
        booking.save(update_fields=("status", "updated_at"))
        booking.status = (
            RentalBooking.Status.RECOVERY_REQUIRED
            if excess_paise > 0
            else RentalBooking.Status.COMPLETED
        )
        booking.save(update_fields=("status", "updated_at"))
        _settle_vendor_earnings(booking, extra_damage_paise=consumed)

        _emit_rental_event(
            booking.id, "rental_booking.returned", {"inspection_id": str(inspection.id)}
        )
        _emit_rental_event(
            booking.id,
            "rental_booking.settled",
            {
                "consumed_paise": consumed,
                "refunded_paise": refunded,
                "excess_damage_paise": excess_paise,
            },
        )

    else:
        # Case: Major damage above cap -> Requires Operations case and maker-checker approval
        deposit.status = RentalDeposit.Status.DISPUTED
        deposit.save(update_fields=("status", "updated_at"))

        booking.status = RentalBooking.Status.DISPUTED
        booking.save(update_fields=("status", "updated_at"))

        OperationsCase.objects.create(
            kind=OperationsCase.Kind.RENTAL_DEPOSIT_DISPUTE,
            owner_team=OperationsCase.Team.QUALITY_SUPPORT,
            rental_booking=booking,
            summary=f"Major damage claim on Rental #{str(booking.id)[:8]} exceeding cap",
            detail=(
                f"Vendor reported ₹{inspection.damage_estimated_paise / 100:.2f} damage "
                f"(cap: ₹{minor_damage_cap / 100:.2f}). Evidence photos attached."
            ),
            due_at=timezone.now() + timedelta(hours=24),
        )

        _emit_rental_event(
            booking.id, "rental_booking.returned", {"inspection_id": str(inspection.id)}
        )
        _emit_rental_event(
            booking.id,
            "rental_booking.disputed",
            {
                "reason": "major_damage_exceeds_cap",
                "claimed_paise": inspection.damage_estimated_paise,
            },
        )


def _settle_vendor_earnings(booking: RentalBooking, extra_damage_paise: int = 0) -> None:
    """Credit vendor in PartnerLedgerEntry upon rental completion."""
    # Base rental lines
    base_rent = sum(
        line.amount_paise
        for line in booking.lines.filter(
            line_type__in=(
                RentalBookingLine.LineType.BASE_RENTAL,
                RentalBookingLine.LineType.EXTENSION,
            )
        )
    )
    # Commission (e.g. 10% platform commission)
    commission = base_rent * 1000 // 10000
    net = base_rent - commission + extra_damage_paise
    gross = base_rent + extra_damage_paise

    PartnerLedgerEntry.objects.get_or_create(
        idempotency_key=f"rental-earning:{booking.id}",
        defaults={
            "partner": booking.asset.partner,
            "rental_booking": booking,
            "kind": PartnerLedgerEntry.Kind.EARNING,
            "status": PartnerLedgerEntry.Status.AVAILABLE,
            "gross_paise": gross,
            "commission_paise": commission,
            "net_paise": net,
            "reason": f"Settlement for Rental Booking #{str(booking.id)[:8]}",
            "calculation_snapshot": {
                "base_rent": base_rent,
                "commission": commission,
                "extra_damage_passed_to_vendor": extra_damage_paise,
            },
        },
    )


@transaction.atomic
def complete_rental_damage_settlement(*, payment_attempt_id: UUID | str) -> RentalBooking | None:
    attempt = PaymentAttempt.objects.select_for_update().get(id=payment_attempt_id)
    if attempt.status != PaymentAttempt.Status.CAPTURED:
        return None
    allocation = (
        attempt.rental_allocations.select_related(
            "rental_booking_line__rental_booking__asset__partner"
        )
        .filter(rental_booking_line__line_type=RentalBookingLine.LineType.DAMAGE_SETTLEMENT)
        .first()
    )
    if allocation is None:
        return None
    booking = RentalBooking.objects.select_for_update().get(
        id=allocation.rental_booking_line.rental_booking_id
    )
    PartnerLedgerEntry.objects.get_or_create(
        idempotency_key=f"rental-damage-recovery:{attempt.id}",
        defaults={
            "partner": booking.asset.partner,
            "rental_booking": booking,
            "kind": PartnerLedgerEntry.Kind.ADJUSTMENT,
            "status": PartnerLedgerEntry.Status.AVAILABLE,
            "gross_paise": attempt.amount_paise,
            "commission_paise": 0,
            "net_paise": attempt.amount_paise,
            "reason": f"Captured excess damage settlement for rental {booking.id}",
            "calculation_snapshot": {"payment_attempt_id": str(attempt.id)},
        },
    )
    booking.status = RentalBooking.Status.COMPLETED
    booking.save(update_fields=("status", "updated_at"))
    _emit_rental_event(
        booking.id,
        "rental_booking.damage_recovery_captured",
        {"payment_attempt_id": str(attempt.id), "amount_paise": attempt.amount_paise},
    )
    return booking


def dispute_deposit(
    *,
    booking_id: UUID | str,
    customer: Any,
    reason: str,
) -> OperationsCase:
    """Customer contests deposit deduction -> opens RENTAL_DEPOSIT_DISPUTE case."""
    with transaction.atomic():
        booking = RentalBooking.objects.select_for_update().get(id=booking_id)

        if booking.customer != customer:
            raise RentalAuthorizationError("Only the customer can dispute their rental deposit.")
        if (
            booking.status != RentalBooking.Status.DISPUTED
            or booking.deposit.status != RentalDeposit.Status.DISPUTED
        ):
            raise InvalidRentalStateTransitionError(
                "A deposit can be contested only after an evidence-backed deduction is proposed."
            )

        deposit = booking.deposit
        deposit.status = RentalDeposit.Status.DISPUTED
        deposit.save(update_fields=("status", "updated_at"))

        booking.status = RentalBooking.Status.DISPUTED
        booking.save(update_fields=("status", "updated_at"))

        case, _ = OperationsCase.objects.get_or_create(
            kind=OperationsCase.Kind.RENTAL_DEPOSIT_DISPUTE,
            rental_booking=booking,
            status__in=(OperationsCase.Status.OPEN, OperationsCase.Status.IN_PROGRESS),
            defaults={
                "owner_team": OperationsCase.Team.QUALITY_SUPPORT,
                "summary": (
                    f"Customer contested deposit deduction on Rental #{str(booking.id)[:8]}"
                ),
                "detail": f"Customer dispute reason: {reason}",
                "due_at": timezone.now() + timedelta(hours=24),
            },
        )
        return case


def operations_reassign_asset(
    *,
    booking_id: UUID | str,
    new_asset_id: UUID | str,
    operator: Any,
) -> RentalBooking:
    """Operations reassigns an unavailable asset to an equivalent asset pre-handover."""
    if not getattr(operator, "is_staff", False):
        raise RentalAuthorizationError("Operations staff privileges required.")
    with transaction.atomic():
        booking = RentalBooking.objects.select_for_update().get(id=booking_id)

        if booking.status in (RentalBooking.Status.HANDED_OVER, RentalBooking.Status.COMPLETED):
            raise InvalidRentalStateTransitionError("Cannot reassign an asset after handover.")

        new_asset = RentalAsset.objects.select_for_update().get(id=new_asset_id)
        old_asset = booking.asset
        if new_asset.current_status != RentalAsset.Status.ACTIVE:
            raise AssetUnavailableError("Replacement asset is not active.")
        if (
            new_asset.partner_id != old_asset.partner_id
            or new_asset.variant_id != old_asset.variant_id
            or new_asset.daily_price_paise != old_asset.daily_price_paise
            or new_asset.deposit_paise != old_asset.deposit_paise
            or new_asset.condition_grade != old_asset.condition_grade
        ):
            raise ValueError(
                "Replacement must be an equivalent asset from the same vendor and price group."
            )
        occupied = get_occupied_datetime_range(booking.rental_start, booking.rental_end)
        if not new_asset.is_serialized:
            reserved = (
                AssetReservation.objects.filter(
                    asset=new_asset,
                    occupied_range__overlap=occupied,
                )
                .filter(
                    Q(status=AssetReservation.Status.CONFIRMED)
                    | Q(
                        status=AssetReservation.Status.TENTATIVE,
                        expires_at__gt=timezone.now(),
                    )
                )
                .aggregate(total=Sum("reserved_quantity"))["total"]
                or 0
            )
            if reserved + booking.quantity > new_asset.quantity_available:
                raise AssetUnavailableError("Replacement pool does not have the booked quantity.")

        # Release old reservation
        if booking.reservation:
            booking.reservation.status = AssetReservation.Status.RELEASED
            booking.reservation.released_at = timezone.now()
            booking.reservation.save(update_fields=("status", "released_at"))

        # Create new reservation
        new_res = AssetReservation.objects.create(
            asset=new_asset,
            is_serialized=new_asset.is_serialized,
            reserved_quantity=booking.quantity,
            occupied_range=occupied,
            status=AssetReservation.Status.CONFIRMED,
            expires_at=timezone.now() + timedelta(days=365),
        )

        booking.asset = new_asset
        booking.reservation = new_res
        booking.status = RentalBooking.Status.CONFIRMED
        booking.save(update_fields=("asset", "reservation", "status", "updated_at"))

        _emit_rental_event(
            booking.id,
            "rental_booking.asset_reassigned",
            {
                "booking_id": str(booking.id),
                "old_asset_id": str(old_asset.id),
                "new_asset_id": str(new_asset.id),
                "customer_id": str(booking.customer_id),
            },
        )
        request_notification(
            recipient_id=booking.customer_id,
            purpose="rental.asset_reassigned",
            channel=NotificationIntent.Channel.IN_APP,
            template_code="rental_asset_reassigned_customer",
            context={"booking_id": str(booking.id)},
            idempotency_key=f"rental-reassigned:{booking.id}:{new_asset.id}",
        )

        return booking


def operations_resolve_dispute(
    *,
    case_id: UUID | str,
    refund_customer_paise: int,
    vendor_payout_paise: int,
    resolution_note: str,
    operator: Any,
) -> bool:
    """Operations resolves deposit dispute, applying manual split and closing case."""
    if not getattr(operator, "is_staff", False):
        raise RentalAuthorizationError("Operations staff privileges required.")
    with transaction.atomic():
        try:
            case = OperationsCase.objects.select_for_update().get(id=case_id)
        except OperationsCase.DoesNotExist:
            raise RentalAuthorizationError("Operations case was not found.") from None
        booking = case.rental_booking
        if not booking:
            raise ValueError(f"Case {case_id} is not associated with a rental booking.")

        deposit = getattr(booking, "deposit", None)
        if not deposit:
            raise ValueError(f"Rental booking {booking.id} has no deposit record.")

        if refund_customer_paise < 0 or vendor_payout_paise < 0:
            raise ValueError("Settlement amounts cannot be negative.")
        if refund_customer_paise + vendor_payout_paise != deposit.authorized_amount_paise:
            raise ValueError("Customer refund and vendor payout must equal the authorized deposit.")
        if vendor_payout_paise > 0 and (
            not getattr(booking, "handover", None)
            or not booking.handover.photo_urls
            or not getattr(booking, "return_inspection", None)
            or not booking.return_inspection.photo_urls
        ):
            raise InvalidRentalStateTransitionError(
                "Vendor deposit consumption requires handover and return photo evidence."
            )
        proposal: dict[str, Any] = {
            "refund_customer_paise": refund_customer_paise,
            "vendor_payout_paise": vendor_payout_paise,
            "resolution_note": resolution_note,
        }
        if not propose_or_approve_settlement(case=case, operator=operator, proposal=proposal):
            return False

        if refund_customer_paise > 0:
            dep_id = (
                PaymentAttempt.objects.filter(
                    purpose=PaymentAttempt.Purpose.A7_DEPOSIT_HOLD,
                    rental_allocations__rental_booking_line__rental_booking=booking,
                    status__in=(
                        PaymentAttempt.Status.CAPTURED,
                        PaymentAttempt.Status.PARTIALLY_REFUNDED,
                    ),
                )
                .values_list("id", flat=True)
                .first()
            )
            deposit_attempt = (
                PaymentAttempt.objects.select_for_update().filter(id=dep_id).first()
                if dep_id
                else None
            )
            if deposit_attempt is None:
                raise ValueError("Captured rental deposit payment was not found.")
            request_standalone_refund(
                payment_attempt_id=deposit_attempt.id,
                amount_paise=refund_customer_paise,
                reason_code="rental_ops_settlement",
                idempotency_key=f"rental-ops-refund:{case.id}",
                requested_by_id=operator.id,
            )

        deposit.status = RentalDeposit.Status.RESOLVED
        deposit.refunded_amount_paise = refund_customer_paise
        deposit.consumed_amount_paise = vendor_payout_paise
        deposit.save(
            update_fields=("status", "refunded_amount_paise", "consumed_amount_paise", "updated_at")
        )

        if refund_customer_paise > 0:
            RentalDepositTransaction.objects.create(
                rental_deposit=deposit,
                kind=RentalDepositTransaction.Kind.REFUND,
                amount_paise=refund_customer_paise,
                reason=f"Ops resolution: refund to customer. Note: {resolution_note}",
            )

        if vendor_payout_paise > 0:
            RentalDepositTransaction.objects.create(
                rental_deposit=deposit,
                kind=RentalDepositTransaction.Kind.CONSUMPTION,
                amount_paise=vendor_payout_paise,
                reason=f"Ops resolution: payout to vendor. Note: {resolution_note}",
            )

        booking.status = RentalBooking.Status.COMPLETED
        booking.save(update_fields=("status", "updated_at"))

        case.status = OperationsCase.Status.RESOLVED
        case.resolution = "SPLIT_SETTLED"
        case.resolution_note = resolution_note
        case.resolved_at = timezone.now()
        case.save(update_fields=("status", "resolution", "resolution_note", "resolved_at"))
        return True


def cancel_rental_booking(
    *,
    booking_id: UUID | str,
    customer: Any,
    reason: str = "",
) -> RentalBooking:
    """Cancel a rental booking before handover under the cancellation policy.

    - >= 1 day (24h) before start_date: Free cancellation (100% refund, 100% deposit release).
    - < 1 day before start_date: Late cancellation retains 1 day's rental fee as cancellation fee;
      releases 100% of deposit hold.
    - Releases the asset reservation hold immediately.
    """
    with transaction.atomic():
        booking = RentalBooking.objects.select_for_update().get(id=booking_id)

        if booking.customer != customer:
            raise RentalAuthorizationError("Only the booking customer can cancel this rental.")

        if booking.status not in (
            RentalBooking.Status.HELD,
            RentalBooking.Status.PAYMENT_PENDING,
            RentalBooking.Status.CONFIRMED,
        ):
            raise InvalidRentalStateTransitionError(
                f"Cannot cancel rental booking from status {booking.status}."
            )

        today = timezone.localdate()
        days_until_start = (booking.rental_start - today).days

        cancellation_fee_paise = (
            0
            if days_until_start >= 1
            else int(
                booking.policy_snapshot.get("daily_price_paise", booking.asset.daily_price_paise)
            )
            * booking.quantity
        )

        price_id = (
            PaymentAttempt.objects.filter(
                purpose=PaymentAttempt.Purpose.A7_RENTAL_BOOKING,
                rental_allocations__rental_booking_line__rental_booking=booking,
                status__in=(
                    PaymentAttempt.Status.CAPTURED,
                    PaymentAttempt.Status.PARTIALLY_REFUNDED,
                ),
            )
            .values_list("id", flat=True)
            .first()
        )
        price_attempt = (
            PaymentAttempt.objects.select_for_update().filter(id=price_id).first()
            if price_id
            else None
        )
        dep_id = (
            PaymentAttempt.objects.filter(
                purpose=PaymentAttempt.Purpose.A7_DEPOSIT_HOLD,
                rental_allocations__rental_booking_line__rental_booking=booking,
                status__in=(
                    PaymentAttempt.Status.CAPTURED,
                    PaymentAttempt.Status.PARTIALLY_REFUNDED,
                ),
            )
            .values_list("id", flat=True)
            .first()
        )
        deposit_attempt = (
            PaymentAttempt.objects.select_for_update().filter(id=dep_id).first()
            if dep_id
            else None
        )
        refundable_price = max(
            0, (price_attempt.amount_paise if price_attempt else 0) - cancellation_fee_paise
        )
        if refundable_price and price_attempt:
            request_standalone_refund(
                payment_attempt_id=price_attempt.id,
                amount_paise=refundable_price,
                reason_code="rental_customer_cancellation",
                idempotency_key=f"rental-cancel-price:{booking.id}",
                requested_by_id=customer.id,
            )
        if deposit_attempt:
            request_standalone_refund(
                payment_attempt_id=deposit_attempt.id,
                amount_paise=deposit_attempt.amount_paise,
                reason_code="rental_deposit_release",
                idempotency_key=f"rental-cancel-deposit:{booking.id}",
                requested_by_id=customer.id,
            )

        # Release reservation hold
        if booking.reservation:
            booking.reservation.status = AssetReservation.Status.RELEASED
            booking.reservation.released_at = timezone.now()
            booking.reservation.save(update_fields=("status", "released_at"))

        # Release deposit hold if authorized or held
        deposit = getattr(booking, "deposit", None)
        if deposit and deposit.status in (
            RentalDeposit.Status.REQUIRED,
            RentalDeposit.Status.AUTHORIZED,
            RentalDeposit.Status.HELD,
        ):
            refunded_deposit = deposit.amount_paise if deposit_attempt else 0
            deposit.status = RentalDeposit.Status.RELEASED
            deposit.refunded_amount_paise = refunded_deposit
            deposit.save(update_fields=("status", "refunded_amount_paise", "updated_at"))

            if refunded_deposit:
                RentalDepositTransaction.objects.create(
                    rental_deposit=deposit,
                    kind=RentalDepositTransaction.Kind.REFUND,
                    amount_paise=refunded_deposit,
                    reason=f"Rental cancelled: deposit hold released. {reason}".strip(),
                )

        booking.status = RentalBooking.Status.CANCELLED
        booking.cancellation_reason = reason
        booking.save(update_fields=("status", "cancellation_reason", "updated_at"))

        _emit_rental_event(
            booking.id,
            "rental_booking.cancelled",
            {
                "booking_id": str(booking.id),
                "cancellation_fee_paise": cancellation_fee_paise,
                "reason": reason,
                "days_until_start": days_until_start,
            },
        )

        return booking
