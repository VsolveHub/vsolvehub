"""A7 rental domain services. Fail-closed on capability + ACTIVE A7VariantConfiguration."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any
from urllib.parse import urlparse
from uuid import UUID

import jsonschema
from django.conf import settings
from django.db import models, transaction
from django.utils import timezone
from jsonschema.exceptions import ValidationError as JsonSchemaValidationError

from apps.catalog.models import A7VariantConfiguration, Category, Service, Subcategory
from apps.commerce.models import PaymentAttempt
from apps.rental.models import (
    AssetReservation,
    RentalAsset,
    RentalAssetMedia,
    RentalBooking,
    RentalBookingLine,
    RentalDeposit,
    RentalModerationEvent,
    RentalPhotoUpload,
    overlapping_reservations,
    overlapping_reserved_quantity,
)


class RentalStateError(ValueError):
    def __init__(self, message: str, *, code: str = "rental_state_invalid") -> None:
        super().__init__(message)
        self.code = code


def ensure_customer_handover_pin(*, user: Any) -> str:
    """DEPRECATED: PIN is now generated per-booking.

    Returns a dummy or existing PIN for backward compatibility.
    New code should use booking.handover_pin_hash directly.
    """
    existing = (getattr(user, "rental_handover_pin_hash", "") or "").strip()
    if existing and len(existing) == 4 and existing.isdigit():
        return existing
    return "0000"


def verify_handover_pin(*, booking: Any, pin: str) -> bool:
    import secrets

    expected = (getattr(booking, "handover_pin_hash", "") or "").strip()
    provided = str(pin or "").strip()
    if not expected or not provided:
        return False
    return secrets.compare_digest(expected, provided)


def _as_uuid(value: UUID | str) -> UUID:
    return value if isinstance(value, UUID) else UUID(str(value))


def _require_rental_capability(partner: Any) -> None:
    if not partner.capabilities.filter(archetype="A7_RENTAL", status="APPROVED").exists():
        raise PermissionError("Partner does not have an approved A7 rental capability.")


def _require_active_a7(variant_id: UUID | str) -> A7VariantConfiguration:
    config = A7VariantConfiguration.objects.filter(
        variant_id=_as_uuid(variant_id),
        status=A7VariantConfiguration.Status.ACTIVE,
    ).first()
    if config is None:
        raise RentalStateError("This rental category is not open yet.")
    return config


_RENTAL_PHOTO_TYPES = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
_RENTAL_PHOTO_MAX_BYTES = 8 * 1024 * 1024


def store_rental_photo(
    *,
    partner: Any,
    upload: Any,
) -> RentalPhotoUpload:
    _require_rental_capability(partner)
    content_type = (getattr(upload, "content_type", "") or "").split(";")[0].strip().lower()
    if content_type not in _RENTAL_PHOTO_TYPES:
        raise RentalStateError("Photo must be a JPEG, PNG, or WebP image.")
    size = int(getattr(upload, "size", 0) or 0)
    if size <= 0:
        raise RentalStateError("Photo file is empty.")
    if size > _RENTAL_PHOTO_MAX_BYTES:
        raise RentalStateError("Photo must be 8 MB or smaller.")
    return RentalPhotoUpload.objects.create(
        partner=partner,
        stored_file=upload,
        original_name=str(getattr(upload, "name", "photo"))[:180],
        content_type=content_type,
        size_bytes=size,
    )


def partner_owns_rental_photo(*, partner: Any, url: str) -> bool:
    path = urlparse(url).path
    media_prefix = settings.MEDIA_URL.rstrip("/") + "/"
    if not path.startswith(media_prefix + "rental-ads/"):
        return False
    stored_name = path[len(media_prefix) :] if path.startswith(media_prefix) else path.lstrip("/")
    return RentalPhotoUpload.objects.filter(partner=partner, stored_file=stored_name).exists()


def create_asset(
    *,
    partner: Any,
    variant_id: UUID | str,
    title: str,
    daily_rate_paise: int,
    deposit_paise: int = 0,
    description: str = "",
    location_text: str = "",
    asset_identifier: str = "",
    quantity_available: int = 1,
    structured_fields: dict | None = None,
    media: list[dict] | None = None,
    image_urls: list[str] | None = None,
) -> RentalAsset:
    _require_rental_capability(partner)
    config = _require_active_a7(variant_id)
    if daily_rate_paise <= 0:
        raise RentalStateError("Daily rate must be positive paise.")
    if quantity_available < 1:
        raise RentalStateError("Quantity must be at least 1.")
    if config.asset_schema and structured_fields:
        try:
            jsonschema.validate(instance=structured_fields, schema=config.asset_schema)
        except JsonSchemaValidationError as e:
            raise RentalStateError(f"Invalid structured fields: {e.message}")
    deposit = deposit_paise if deposit_paise > 0 else config.default_deposit_paise
    # Prefer explicit location; otherwise fall back to partner registered address.
    location = (location_text or "").strip() or (
        getattr(partner, "default_location_text", "") or ""
    )
    asset = RentalAsset.objects.create(
        partner=partner,
        variant_id=_as_uuid(variant_id),
        title=title.strip(),
        description=description,
        location_text=location,
        asset_identifier=asset_identifier,
        quantity_available=quantity_available,
        daily_rate_paise=daily_rate_paise,
        deposit_paise=deposit,
        moderation_status="DRAFT",
        structured_fields=structured_fields or {},
    )
    items: list[dict] = list(media or [])
    if image_urls:
        for idx, u in enumerate(image_urls):
            items.append({"url": u, "caption": "", "display_order": idx})
    for idx, item in enumerate(items):
        url = item.get("url") or item.get("image_url", "")
        if url:
            RentalAssetMedia.objects.create(
                asset=asset,
                url=url,
                caption=item.get("caption", ""),
                display_order=item.get("display_order", item.get("sort_order", idx)),
            )
    return asset


def attach_asset_media(
    *,
    asset: RentalAsset,
    partner: Any,
    url: str,
    caption: str = "",
    display_order: int = 0,
) -> RentalAssetMedia:
    _require_rental_capability(partner)
    if asset.partner_id != partner.id:
        raise PermissionError("Not your asset.")
    if not url:
        raise RentalStateError("Image URL is required.")
    return RentalAssetMedia.objects.create(
        asset=asset,
        url=url,
        caption=caption,
        display_order=display_order,
    )


def get_rental_taxonomy() -> list[dict[str, Any]]:
    category = Category.objects.filter(slug="rental-services").first()
    if not category:
        return []
    result = []
    subcategories = Subcategory.objects.filter(category=category).prefetch_related(
        "services__variants__a7_configurations"
    )
    for sub in subcategories:
        sub_data: dict[str, Any] = {
            "id": sub.id,
            "name": sub.name,
            "slug": sub.slug,
            "services": [],
        }
        for svc in sub.services.filter(status=Service.Status.ACTIVE):
            svc_data: dict[str, Any] = {
                "id": svc.id,
                "name": svc.name,
                "slug": svc.slug,
                "variants": [],
            }
            for v in svc.variants.filter(is_active=True, booking_archetype="A7_RENTAL"):
                active_cfg = v.a7_configurations.filter(
                    status=A7VariantConfiguration.Status.ACTIVE
                ).first()
                if active_cfg:
                    svc_data["variants"].append(
                        {
                            "id": v.id,
                            "name": v.name,
                            "code": v.code,
                            "asset_schema": active_cfg.asset_schema or {},
                            "default_deposit_paise": active_cfg.default_deposit_paise,
                        }
                    )
            if svc_data["variants"]:
                sub_data["services"].append(svc_data)
        if sub_data["services"]:
            result.append(sub_data)
    return result


def submit_asset(*, asset: RentalAsset, partner: Any) -> RentalAsset:
    _require_rental_capability(partner)
    if asset.partner_id != partner.id:
        raise PermissionError("Not your asset.")
    _require_active_a7(asset.variant_id)
    if asset.moderation_status not in ("DRAFT", "REJECTED"):
        raise RentalStateError("Asset cannot be submitted from this state.")
    asset.moderation_status = "PENDING"
    asset.save(update_fields=("moderation_status", "updated_at"))
    RentalModerationEvent.objects.create(
        asset=asset, actor=partner.user, action=RentalModerationEvent.Action.SUBMITTED, reason=""
    )
    return asset


def moderate_asset(
    *,
    asset: RentalAsset,
    actor: Any,
    action: str,
    reason: str,
) -> RentalAsset:
    reason = (reason or "").strip()
    if not reason:
        raise RentalStateError("A moderation reason is required.")
    action = action.upper()
    if action == "APPROVE":
        asset.moderation_status = "APPROVED"
        asset.current_status = RentalAsset.Status.ACTIVE
        event = RentalModerationEvent.Action.APPROVED
    elif action == "REJECT":
        asset.moderation_status = "REJECTED"
        event = RentalModerationEvent.Action.REJECTED
    elif action == "REMOVE":
        asset.moderation_status = "REMOVED"
        event = RentalModerationEvent.Action.REMOVED
    elif action == "REINSTATE":
        asset.moderation_status = "APPROVED"
        asset.current_status = RentalAsset.Status.ACTIVE
        event = RentalModerationEvent.Action.REINSTATED
    else:
        raise RentalStateError("Unknown moderation action.")
    asset.moderation_reason = reason
    asset.save(
        update_fields=("moderation_status", "current_status", "moderation_reason", "updated_at")
    )
    RentalModerationEvent.objects.create(asset=asset, actor=actor, action=event, reason=reason)
    return asset


@transaction.atomic
def create_booking(
    *,
    customer: Any,
    asset_id: UUID | str,
    start_date: date,
    end_date: date,
    mode: str = "PICKUP",
    notes: str = "",
    quantity: int = 1,
    hold_deposit_for_demo: bool = False,
) -> RentalBooking:
    # OLX-style rentals: pickup only. Ignore any client-supplied delivery mode.
    mode = "PICKUP"
    if quantity < 1:
        raise RentalStateError("Quantity must be at least 1.")
    asset = (
        RentalAsset.objects.select_for_update()
        .select_related("partner", "variant")
        .get(id=_as_uuid(asset_id))
    )
    _require_active_a7(asset.variant_id)
    if asset.public_state != "PUBLISHED":
        raise RentalStateError("Asset is not available to book.")
    if end_date <= start_date:
        raise RentalStateError("End date must be after start date.")
    days = (end_date - start_date).days
    config = _require_active_a7(asset.variant_id)
    if days < config.min_rental_days:
        raise RentalStateError(f"Minimum rental is {config.min_rental_days} day(s).")
    stock = int(asset.quantity_available or 0)
    if stock < 1:
        raise RentalStateError(
            "Out of stock for those dates.",
            code="out_of_stock",
        )
    # Serialize against concurrent holds on the same asset/date window.
    list(overlapping_reservations(asset.id, start_date, end_date).select_for_update())
    overlapping = overlapping_reserved_quantity(asset.id, start_date, end_date)
    remaining = stock - overlapping
    if remaining <= 0:
        raise RentalStateError(
            "Out of stock for those dates.",
            code="out_of_stock",
        )
    if quantity > remaining:
        raise RentalStateError(
            "Not enough quantity available for those dates.",
            code="insufficient_quantity",
        )

    import secrets

    handover_pin = f"{secrets.randbelow(10000):04d}"

    reservation = AssetReservation.objects.create(
        asset=asset,
        status=AssetReservation.Status.CONFIRMED,
        start_date=start_date,
        end_date=end_date,
    )
    needs_deposit = asset.deposit_paise > 0 and not hold_deposit_for_demo
    deposit = RentalDeposit.objects.create(
        amount_paise=asset.deposit_paise * quantity,
        status=(
            RentalDeposit.Status.HELD
            if hold_deposit_for_demo or asset.deposit_paise == 0
            else RentalDeposit.Status.REQUESTED
        ),
        provider_note="" if not hold_deposit_for_demo else "Seed hold without a live capture.",
    )
    price = asset.daily_rate_paise * days * quantity
    # Always charge rental fee + deposit in one attempt when money is due.
    amount_due = price + (asset.deposit_paise * quantity if asset.deposit_paise > 0 else 0)
    needs_payment = amount_due > 0 and not hold_deposit_for_demo
    booking = RentalBooking.objects.create(
        customer=customer,
        asset=asset,
        reservation=reservation,
        deposit=deposit,
        status=(
            RentalBooking.Status.PENDING_PAYMENT
            if needs_payment
            else RentalBooking.Status.CONFIRMED
        ),
        start_date=start_date,
        end_date=end_date,
        price_paise=price,
        pickup_or_delivery_mode=mode,
        notes=notes,
        handover_pin_hash=handover_pin,
    )
    RentalBookingLine.objects.create(
        booking=booking,
        asset=asset,
        quantity=quantity,
        unit_price_paise=asset.daily_rate_paise,
        deposit_paise=asset.deposit_paise * quantity,
    )
    if needs_payment:
        from apps.commerce.services.payments import initiate_standalone_payment_attempt

        attempt = initiate_standalone_payment_attempt(
            purpose=PaymentAttempt.Purpose.A7_RENTAL_BOOKING,
            amount_paise=amount_due,
            idempotency_key=f"a7-booking:{booking.id}",
            expires_at=timezone.now() + timedelta(seconds=settings.M1_PAYMENT_WINDOW_SECONDS),
        )
        deposit.payment_attempt = attempt
        deposit.save(update_fields=("payment_attempt", "updated_at"))
    return booking


def mark_deposit_held(*, payment_attempt_id: UUID) -> None:
    """Capture callback. Replay is a no-op once the deposit is already held.

    Lock the deposit row alone, then the booking in a second statement.
    `RentalBooking.deposit` is a reverse OneToOne from this side, so
    `select_related("booking")` under `select_for_update()` becomes a left
    outer join — and PostgreSQL refuses `FOR UPDATE` on that nullable side.
    """
    deposit = RentalDeposit.objects.select_for_update().get(payment_attempt_id=payment_attempt_id)
    if deposit.status == RentalDeposit.Status.HELD:
        return
    deposit.status = RentalDeposit.Status.HELD
    deposit.provider_note = ""
    deposit.save(update_fields=("status", "provider_note", "updated_at"))
    booking = RentalBooking.objects.select_for_update().get(deposit_id=deposit.id)
    if booking.status == RentalBooking.Status.PENDING_PAYMENT:
        booking.status = RentalBooking.Status.CONFIRMED
        booking.save(update_fields=("status", "updated_at"))


def handover_booking(*, booking: RentalBooking, partner: Any, pin: str = "") -> RentalBooking:
    _require_rental_capability(partner)
    if booking.asset.partner_id != partner.id:
        raise PermissionError("Not your booking.")
    if booking.status != RentalBooking.Status.CONFIRMED:
        raise RentalStateError("Booking must be CONFIRMED to handover.")
    if not verify_handover_pin(booking=booking, pin=pin):
        raise RentalStateError(
            "Incorrect handover PIN.",
            code="handover_pin_invalid",
        )
    booking.status = RentalBooking.Status.HANDOVER
    booking.save(update_fields=("status", "updated_at"))
    return booking


def _refund_deposit_residual(
    *,
    deposit: RentalDeposit,
    residual_paise: int,
    reason_code: str,
) -> None:
    """Gateway-refund the unconsumed deposit share of a captured A7 attempt.

    Mirrors ``cancel_booking`` captured/settling fail-closed behaviour, but
    refunds an explicit residual so the rental-fee portion of a combined
    fee+deposit charge is retained after a completed rental.
    """
    from apps.commerce.models import PaymentAttempt
    from apps.commerce.services import _request_automatic_refund
    from apps.commerce.services.base import PAYMENT_FINAL_STATES

    if residual_paise <= 0:
        return
    attempt = deposit.payment_attempt
    if attempt is None:
        return
    if attempt.status in PAYMENT_FINAL_STATES:
        _request_automatic_refund(
            attempt=attempt,
            reason_code=reason_code,
            amount_paise=residual_paise,
        )
        return
    if attempt.status != PaymentAttempt.Status.FAILED:
        raise RentalStateError(
            "Payment is still settling with the provider. Try again shortly, "
            "or contact support if this persists."
        )


def _record_deposit_consume_claim(
    *,
    booking: RentalBooking,
    partner: Any,
    consume_paise: int,
    reason: str,
) -> None:
    """Ledger ADJUSTMENT claiming withheld deposit (minimal Ops-visible claim)."""
    if consume_paise <= 0:
        return
    from apps.payouts.services import record_adjustment

    actor = getattr(partner, "user", None)
    if actor is None:
        return
    record_adjustment(
        partner_id=booking.asset.partner_id,
        corrects_id=None,
        net_paise=consume_paise,
        reason=f"Rental deposit consumed ({booking.id}): {reason}"[:240],
        actor=actor,
        idempotency_key=f"rental-deposit-consume:{booking.deposit_id}",
    )


@transaction.atomic
def dispute_deposit(
    *,
    booking: RentalBooking,
    partner: Any,
    reason: str,
    consume_paise: int = 0,
) -> RentalBooking:
    """Partner raises a deposit dispute after return (before or instead of full release).

    ``consume_paise`` is optional partial consume (proposal 0025):
    - omitted / default ``0`` → dispute without consuming any deposit (RELEASED)
    - ``0 < consume_paise < held`` → PARTIALLY_CONSUMED
    - ``consume_paise == held`` → FULLY_CONSUMED

    Blank/omit must NOT silently full-consume; callers must pass an explicit
    amount ``>= 0``. There is no implicit "None means full" path.

    Residual ``amount - consume`` is gateway-refunded when a captured payment
    exists. Consumed paise is recorded as a partner ledger ADJUSTMENT claim.
    """
    _require_rental_capability(partner)
    if booking.asset.partner_id != partner.id:
        raise PermissionError("Not your booking.")

    booking = (
        RentalBooking.objects.select_for_update(of=("self",))
        .select_related("deposit", "asset")
        .get(id=booking.id)
    )
    if booking.status != RentalBooking.Status.RETURNED:
        raise RentalStateError("Deposit dispute requires RETURNED status.")
    deposit = RentalDeposit.objects.select_for_update(of=("self",)).get(id=booking.deposit_id)
    if deposit.status not in (RentalDeposit.Status.HELD, RentalDeposit.Status.AUTHORIZED):
        raise RentalStateError("Deposit is not held.")
    note = (reason or "").strip()
    if not note:
        raise RentalStateError("A dispute reason is required.")
    amount = deposit.amount_paise
    consume = int(consume_paise)
    if consume < 0 or consume > amount:
        raise RentalStateError("Consumed amount must be between 0 and the held deposit.")

    _refund_deposit_residual(
        deposit=deposit,
        residual_paise=amount - consume,
        reason_code="rental_deposit_dispute_residual",
    )
    _record_deposit_consume_claim(
        booking=booking,
        partner=partner,
        consume_paise=consume,
        reason=note,
    )

    deposit.consumed_paise = consume
    if consume <= 0:
        deposit.status = RentalDeposit.Status.RELEASED
    elif consume >= amount:
        deposit.status = RentalDeposit.Status.FULLY_CONSUMED
    else:
        deposit.status = RentalDeposit.Status.PARTIALLY_CONSUMED
    deposit.provider_note = note[:240]
    deposit.save(update_fields=("consumed_paise", "status", "provider_note", "updated_at"))
    booking.status = RentalBooking.Status.DISPUTED
    booking.save(update_fields=("status", "updated_at"))
    return booking


@transaction.atomic
def return_booking(*, booking: RentalBooking, partner: Any) -> RentalBooking:
    from apps.foundation.models import OutboxEvent

    _require_rental_capability(partner)
    if booking.asset.partner_id != partner.id:
        raise PermissionError("Not your booking.")
    booking = (
        RentalBooking.objects.select_for_update(of=("self",))
        .select_related("reservation")
        .get(id=booking.id)
    )
    if booking.status != RentalBooking.Status.HANDOVER:
        raise RentalStateError("Booking must be HANDOVER to mark returned.")
    booking.status = RentalBooking.Status.RETURNED
    booking.save(update_fields=("status", "updated_at"))

    reservation = AssetReservation.objects.select_for_update().get(id=booking.reservation_id)
    if reservation.status != AssetReservation.Status.RELEASED:
        reservation.status = AssetReservation.Status.RELEASED
        reservation.save(update_fields=("status", "updated_at"))

    OutboxEvent.objects.create(
        aggregate_type="rental_booking",
        aggregate_id=booking.id,
        event_type="customer.fulfilment.completed",
        idempotency_key=f"rental-completed:{booking.id}",
        payload={
            "event_version": 1,
            "customer_id": str(booking.customer_id),
            "source_type": "RENTAL_COMPLETED",
            "source_id": str(booking.id),
            "completed_at": timezone.now().isoformat(),
        },
    )
    return booking


@transaction.atomic
def release_deposit(*, booking: RentalBooking, partner: Any) -> RentalDeposit:
    """Release a held deposit after return and refund the deposit residual.

    The combined A7 payment covers rental fee + deposit; only
    ``deposit.amount_paise`` is refunded (reason ``rental_deposit_released``).
    """
    _require_rental_capability(partner)
    if booking.asset.partner_id != partner.id:
        raise PermissionError("Not your booking.")

    booking = (
        RentalBooking.objects.select_for_update(of=("self",))
        .select_related("deposit")
        .get(id=booking.id)
    )
    if booking.status != RentalBooking.Status.RETURNED:
        raise RentalStateError("Deposit release requires RETURNED status.")
    deposit = RentalDeposit.objects.select_for_update(of=("self",)).get(id=booking.deposit_id)
    if deposit.status not in (RentalDeposit.Status.HELD, RentalDeposit.Status.AUTHORIZED):
        raise RentalStateError("Deposit is not held.")

    _refund_deposit_residual(
        deposit=deposit,
        residual_paise=deposit.amount_paise,
        reason_code="rental_deposit_released",
    )

    deposit.status = RentalDeposit.Status.RELEASED
    deposit.save(update_fields=("status", "updated_at"))
    return deposit


@transaction.atomic
def cancel_booking(
    *,
    booking: RentalBooking,
    customer: Any = None,
    partner: Any = None,
    is_ops: bool = False,
    reason: str = "",
) -> RentalBooking:
    """Customer, Partner or Ops cancels a rental booking before equipment handover.

    Allowed only on PENDING_PAYMENT or CONFIRMED bookings. The booking is
    refused once it reaches HANDOVER — at that point the equipment has left
    the partner's hands and a cancel would be operationally contradictory.

    When a captured payment exists, a full automatic refund is requested and
    any held deposit is marked RELEASED. Uncaptured pending attempts are left
    alone (nothing settled to reverse).
    """
    from apps.commerce.models import PaymentAttempt
    from apps.commerce.services import _request_automatic_refund
    from apps.commerce.services.base import PAYMENT_FINAL_STATES

    if not is_ops:
        if customer is not None:
            if booking.customer_id != getattr(customer, "id", None):
                raise PermissionError("Not your booking.")
        elif partner is not None:
            _require_rental_capability(partner)
            if booking.asset.partner_id != getattr(partner, "id", None):
                raise PermissionError("Not your booking.")
        else:
            raise PermissionError("Must provide customer, partner, or is_ops=True.")
    cancellable = (
        RentalBooking.Status.PENDING_PAYMENT,
        RentalBooking.Status.CONFIRMED,
    )
    if booking.status not in cancellable:
        raise RentalStateError(
            "Booking cannot be cancelled after handover. Contact support for return."
        )

    # Lock the booking row alone. `deposit.payment_attempt` is nullable, so
    # `select_related("deposit__payment_attempt")` under `select_for_update()`
    # becomes a left outer join — PostgreSQL refuses FOR UPDATE on that side
    # (same trap as `mark_deposit_held`). Load the attempt in a follow-up.
    booking = (
        RentalBooking.objects.select_for_update(of=("self",))
        .select_related("deposit", "reservation")
        .get(id=booking.id)
    )
    if booking.status not in cancellable:
        raise RentalStateError(
            "Booking cannot be cancelled after handover. Contact support for return."
        )

    deposit = RentalDeposit.objects.select_for_update(of=("self",)).get(id=booking.deposit_id)
    attempt = deposit.payment_attempt
    if attempt is not None and attempt.status in PAYMENT_FINAL_STATES:
        _request_automatic_refund(attempt=attempt, reason_code="customer_cancelled_rental")
    elif (
        attempt is not None
        and attempt.status not in PAYMENT_FINAL_STATES
        and attempt.status != PaymentAttempt.Status.FAILED
        and booking.status == RentalBooking.Status.CONFIRMED
        and deposit.status in (RentalDeposit.Status.HELD, RentalDeposit.Status.AUTHORIZED)
    ):
        # Confirmed with money notionally held but provider not in a refundable
        # terminal state — refuse rather than promise a refund we cannot start.
        raise RentalStateError(
            "Payment is still settling with the provider. Try again shortly, "
            "or contact support if this persists."
        )

    if deposit.status in (RentalDeposit.Status.HELD, RentalDeposit.Status.AUTHORIZED):
        deposit.status = RentalDeposit.Status.RELEASED
        deposit.save(update_fields=("status", "updated_at"))

    booking.status = RentalBooking.Status.CANCELLED
    booking.save(update_fields=("status", "updated_at"))

    reservation = AssetReservation.objects.select_for_update().get(id=booking.reservation_id)
    if reservation.status != AssetReservation.Status.RELEASED:
        reservation.status = AssetReservation.Status.RELEASED
        reservation.save(update_fields=("status", "updated_at"))

    return booking


@transaction.atomic
def repair_ghost_asset_holds(*, asset_id: UUID | str | None = None) -> int:
    """Release AssetReservations still CONFIRMED/TENTATIVE under terminal bookings.

    Historical cancel/return paths could leave a ghost hold that blocked stock.
    Repairs CANCELLED and RETURNED bookings whose reservation was never RELEASED.
    Returns the number of reservation rows repaired.
    """
    qs = AssetReservation.objects.select_for_update().filter(
        status__in=(AssetReservation.Status.TENTATIVE, AssetReservation.Status.CONFIRMED),
        booking__status__in=(
            RentalBooking.Status.CANCELLED,
            RentalBooking.Status.RETURNED,
        ),
    )
    if asset_id is not None:
        qs = qs.filter(asset_id=_as_uuid(asset_id))
    repaired = 0
    for reservation in qs:
        reservation.status = AssetReservation.Status.RELEASED
        reservation.save(update_fields=("status", "updated_at"))
        repaired += 1
    return repaired


def public_assets(
    *,
    query: str = "",
    location: str = "",
    min_daily_rate_paise: int | None = None,
    max_daily_rate_paise: int | None = None,
    max_deposit_paise: int | None = None,
    variant_code: str = "",
    category_slug: str = "",
    start_date: date | None = None,
    end_date: date | None = None,
):
    qs = (
        RentalAsset.objects.filter(
            moderation_status="APPROVED",
            current_status=RentalAsset.Status.ACTIVE,
        )
        .select_related("partner", "variant")
        .prefetch_related("media")
    )

    if query:
        q = query.strip()
        qs = qs.filter(
            models.Q(title__icontains=q)
            | models.Q(description__icontains=q)
            | models.Q(location_text__icontains=q)
            | models.Q(partner__display_name__icontains=q)
        )
    if location:
        qs = qs.filter(location_text__icontains=location.strip())
    if category_slug:
        qs = qs.filter(variant__service__subcategory__category__slug__iexact=category_slug.strip())
    if variant_code:
        qs = qs.filter(
            models.Q(variant__code__iexact=variant_code)
            | models.Q(variant__service__slug__iexact=variant_code)
            | models.Q(variant__service__subcategory__slug__iexact=variant_code)
        )
    if min_daily_rate_paise is not None:
        qs = qs.filter(daily_rate_paise__gte=min_daily_rate_paise)
    if max_daily_rate_paise is not None:
        qs = qs.filter(daily_rate_paise__lte=max_daily_rate_paise)
    if max_deposit_paise is not None:
        qs = qs.filter(deposit_paise__lte=max_deposit_paise)
    # Fail-closed: never browse zero-stock assets.
    qs = qs.filter(quantity_available__gte=1)
    if start_date is not None and end_date is not None and end_date > start_date:
        # Hide only when overlapping reserved quantity already fills stock.
        from django.db.models import F, IntegerField, OuterRef, Subquery, Sum, Value
        from django.db.models.functions import Coalesce

        reserved = (
            RentalBookingLine.objects.filter(
                asset_id=OuterRef("pk"),
                booking__reservation__status__in=(
                    AssetReservation.Status.TENTATIVE,
                    AssetReservation.Status.CONFIRMED,
                ),
                booking__reservation__start_date__lt=end_date,
                booking__reservation__end_date__gt=start_date,
            )
            .exclude(
                booking__status__in=(
                    RentalBooking.Status.CANCELLED,
                    RentalBooking.Status.RETURNED,
                )
            )
            .values("asset_id")
            .annotate(q=Sum("quantity"))
            .values("q")[:1]
        )
        qs = qs.annotate(
            reserved_qty=Coalesce(
                Subquery(reserved, output_field=IntegerField()),
                Value(0),
            )
        ).filter(reserved_qty__lt=F("quantity_available"))

    return qs


def initiate_rental_booking_payment(*, booking: RentalBooking) -> Any:
    from apps.commerce.services.payments import initiate_standalone_payment_attempt

    asset = booking.asset
    days = (booking.end_date - booking.start_date).days
    line = booking.lines.order_by("id").first()
    quantity = int(line.quantity) if line is not None else 1
    rental_fee = asset.daily_rate_paise * days * quantity
    deposit_amount = asset.deposit_paise * quantity
    amount_paise = rental_fee + deposit_amount

    attempt = initiate_standalone_payment_attempt(
        purpose=PaymentAttempt.Purpose.A7_RENTAL_BOOKING,
        amount_paise=amount_paise,
        idempotency_key=f"a7-booking:{booking.id}",
        expires_at=timezone.now() + timedelta(seconds=settings.M1_PAYMENT_WINDOW_SECONDS),
    )
    if booking.deposit:
        booking.deposit.payment_attempt = attempt
        booking.deposit.save(update_fields=("payment_attempt", "updated_at"))
    return attempt


@transaction.atomic
def release_booking_for_expired_payment(*, payment_attempt_id: UUID) -> None:
    """Free the asset hold when an unpaid rental payment attempt times out.

    Abandoned Razorpay checkouts used to leave CONFIRMED reservations forever
    (``expires_at`` was never set on standalone A7 attempts), so default
    browse→book dates kept failing with "not available for those dates".
    """
    deposit = (
        RentalDeposit.objects.select_for_update()
        .filter(payment_attempt_id=payment_attempt_id)
        .first()
    )
    if deposit is None:
        return
    try:
        booking = (
            RentalBooking.objects.select_for_update()
            .select_related("reservation")
            .get(deposit_id=deposit.id)
        )
    except RentalBooking.DoesNotExist:
        return
    if booking.status != RentalBooking.Status.PENDING_PAYMENT:
        return

    booking.status = RentalBooking.Status.CANCELLED
    booking.save(update_fields=("status", "updated_at"))

    reservation = AssetReservation.objects.select_for_update().get(id=booking.reservation_id)
    if reservation.status != AssetReservation.Status.RELEASED:
        reservation.status = AssetReservation.Status.RELEASED
        reservation.save(update_fields=("status", "updated_at"))


def complete_rental_booking_payment(*, payment_attempt_id: UUID) -> None:
    deposit = RentalDeposit.objects.select_for_update().get(payment_attempt_id=payment_attempt_id)
    if deposit.status == RentalDeposit.Status.HELD:
        return
    deposit.status = RentalDeposit.Status.HELD
    deposit.provider_note = ""
    deposit.save(update_fields=("status", "provider_note", "updated_at"))

    booking = RentalBooking.objects.select_for_update().get(deposit_id=deposit.id)
    if booking.status == RentalBooking.Status.PENDING_PAYMENT:
        booking.status = RentalBooking.Status.CONFIRMED
        booking.save(update_fields=("status", "updated_at"))

    reservation = AssetReservation.objects.select_for_update().get(id=booking.reservation_id)
    if reservation.status != AssetReservation.Status.CONFIRMED:
        reservation.status = AssetReservation.Status.CONFIRMED
        reservation.save(update_fields=("status", "updated_at"))


def cancel_booking_on_refund(*, payment_attempt_id: UUID) -> None:
    """Cancel rental capacity after a full gateway refund — never requests another refund."""
    try:
        booking = (
            RentalBooking.objects.select_for_update(of=("self",))
            .select_related("deposit", "reservation")
            .get(deposit__payment_attempt_id=payment_attempt_id)
        )
    except RentalBooking.DoesNotExist:
        return

    if booking.status in (
        RentalBooking.Status.CANCELLED,
        RentalBooking.Status.RETURNED,
        RentalBooking.Status.DISPUTED,
    ):
        return

    # Fail-closed after handover: equipment has left the partner; Ops must intervene.
    if booking.status not in (
        RentalBooking.Status.PENDING_PAYMENT,
        RentalBooking.Status.CONFIRMED,
    ):
        from apps.commerce.models import FinancialException, PaymentAttempt
        from apps.commerce.services.base import _open_exception

        attempt = PaymentAttempt.objects.filter(id=payment_attempt_id).first()
        _open_exception(
            kind=FinancialException.Kind.REFUND_FAILED,
            code="rental_booking_not_cancellable_after_refund",
            attempt=attempt,
            context={"booking_id": str(booking.id), "status": booking.status},
        )
        return

    booking.status = RentalBooking.Status.CANCELLED
    booking.save(update_fields=("status", "updated_at"))

    deposit = RentalDeposit.objects.select_for_update(of=("self",)).get(id=booking.deposit_id)
    if deposit.status in (RentalDeposit.Status.HELD, RentalDeposit.Status.AUTHORIZED):
        deposit.status = RentalDeposit.Status.RELEASED
        deposit.save(update_fields=("status", "updated_at"))

    reservation = AssetReservation.objects.select_for_update().get(id=booking.reservation_id)
    if reservation.status != AssetReservation.Status.RELEASED:
        reservation.status = AssetReservation.Status.RELEASED
        reservation.save(update_fields=("status", "updated_at"))
