from __future__ import annotations

import jsonschema
from jsonschema.exceptions import ValidationError as JsonSchemaValidationError

"""A7 rental domain services. Fail-closed on capability + ACTIVE A7VariantConfiguration."""


from datetime import date
from typing import Any
from uuid import UUID

from django.conf import settings
from django.db import models, transaction

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
    overlapping_reservations,
)


class RentalStateError(ValueError):
    pass


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
    structured_fields: dict | None = None,
    media: list[dict] | None = None,
    image_urls: list[str] | None = None,
) -> RentalAsset:
    _require_rental_capability(partner)
    config = _require_active_a7(variant_id)
    if daily_rate_paise <= 0:
        raise RentalStateError("Daily rate must be positive paise.")
    if config.asset_schema and structured_fields:
        try:
            jsonschema.validate(instance=structured_fields, schema=config.asset_schema)
        except JsonSchemaValidationError as e:
            raise RentalStateError(f"Invalid structured fields: {e.message}")
    deposit = deposit_paise if deposit_paise > 0 else config.default_deposit_paise
    asset = RentalAsset.objects.create(
        partner=partner,
        variant_id=_as_uuid(variant_id),
        title=title.strip(),
        description=description,
        location_text=location_text,
        asset_identifier=asset_identifier,
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
                active_cfg = v.a7_configurations.filter(status=A7VariantConfiguration.Status.ACTIVE).first()
                if active_cfg:
                    svc_data["variants"].append({
                        "id": v.id,
                        "name": v.name,
                        "code": v.code,
                        "asset_schema": active_cfg.asset_schema or {},
                        "default_deposit_paise": active_cfg.default_deposit_paise,
                    })
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
    hold_deposit_for_demo: bool = False,
) -> RentalBooking:
    # OLX-style rentals: pickup only. Ignore any client-supplied delivery mode.
    mode = "PICKUP"
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
    if overlapping_reservations(asset.id, start_date, end_date).exists():
        raise RentalStateError("Asset is not available for those dates.")

    reservation = AssetReservation.objects.create(
        asset=asset,
        status=AssetReservation.Status.CONFIRMED,
        start_date=start_date,
        end_date=end_date,
    )
    needs_deposit = asset.deposit_paise > 0 and not hold_deposit_for_demo
    deposit = RentalDeposit.objects.create(
        amount_paise=asset.deposit_paise,
        status=(
            RentalDeposit.Status.HELD
            if hold_deposit_for_demo or asset.deposit_paise == 0
            else RentalDeposit.Status.REQUESTED
        ),
        provider_note="" if not hold_deposit_for_demo else "Seed hold without a live capture.",
    )
    price = asset.daily_rate_paise * days
    booking = RentalBooking.objects.create(
        customer=customer,
        asset=asset,
        reservation=reservation,
        deposit=deposit,
        status=(
            RentalBooking.Status.PENDING_PAYMENT
            if needs_deposit
            else RentalBooking.Status.CONFIRMED
        ),
        start_date=start_date,
        end_date=end_date,
        price_paise=price,
        pickup_or_delivery_mode=mode,
        notes=notes,
    )
    RentalBookingLine.objects.create(
        booking=booking,
        asset=asset,
        quantity=1,
        unit_price_paise=asset.daily_rate_paise,
        deposit_paise=asset.deposit_paise,
    )
    if needs_deposit:
        attempt = PaymentAttempt.objects.create(
            purpose=PaymentAttempt.Purpose.A7_RENTAL_DEPOSIT,
            idempotency_key=f"a7-deposit:{booking.id}",
            provider=settings.PAYMENT_PROVIDER,
            amount_paise=asset.deposit_paise,
            currency="INR",
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
    deposit = RentalDeposit.objects.select_for_update().get(
        payment_attempt_id=payment_attempt_id
    )
    if deposit.status == RentalDeposit.Status.HELD:
        return
    deposit.status = RentalDeposit.Status.HELD
    deposit.provider_note = ""
    deposit.save(update_fields=("status", "provider_note", "updated_at"))
    booking = RentalBooking.objects.select_for_update().get(deposit_id=deposit.id)
    if booking.status == RentalBooking.Status.PENDING_PAYMENT:
        booking.status = RentalBooking.Status.CONFIRMED
        booking.save(update_fields=("status", "updated_at"))


def handover_booking(*, booking: RentalBooking, partner: Any) -> RentalBooking:
    _require_rental_capability(partner)
    if booking.asset.partner_id != partner.id:
        raise PermissionError("Not your booking.")
    if booking.status != RentalBooking.Status.CONFIRMED:
        raise RentalStateError("Booking must be CONFIRMED to handover.")
    booking.status = RentalBooking.Status.HANDOVER
    booking.save(update_fields=("status", "updated_at"))
    return booking


def return_booking(*, booking: RentalBooking, partner: Any) -> RentalBooking:
    _require_rental_capability(partner)
    if booking.asset.partner_id != partner.id:
        raise PermissionError("Not your booking.")
    if booking.status != RentalBooking.Status.HANDOVER:
        raise RentalStateError("Booking must be HANDOVER to mark returned.")
    booking.status = RentalBooking.Status.RETURNED
    booking.save(update_fields=("status", "updated_at"))
    return booking


def release_deposit(*, booking: RentalBooking, partner: Any) -> RentalDeposit:
    _require_rental_capability(partner)
    if booking.asset.partner_id != partner.id:
        raise PermissionError("Not your booking.")
    if booking.status != RentalBooking.Status.RETURNED:
        raise RentalStateError("Deposit release requires RETURNED status.")
    deposit = booking.deposit
    if deposit.status not in (RentalDeposit.Status.HELD, RentalDeposit.Status.AUTHORIZED):
        raise RentalStateError("Deposit is not held.")
    deposit.status = RentalDeposit.Status.RELEASED
    deposit.save(update_fields=("status", "updated_at"))
    return deposit


def public_assets(
    *,
    query: str = "",
    location: str = "",
    min_daily_rate_paise: int | None = None,
    max_daily_rate_paise: int | None = None,
    max_deposit_paise: int | None = None,
    variant_code: str = "",
    start_date: date | None = None,
    end_date: date | None = None,
):
    qs = RentalAsset.objects.filter(
        moderation_status="APPROVED",
        current_status=RentalAsset.Status.ACTIVE,
    ).select_related("partner", "variant").prefetch_related("media")

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
    if variant_code:
        qs = qs.filter(
            models.Q(variant__code__icontains=variant_code)
            | models.Q(variant__service__slug__icontains=variant_code)
        )
    if min_daily_rate_paise is not None:
        qs = qs.filter(daily_rate_paise__gte=min_daily_rate_paise)
    if max_daily_rate_paise is not None:
        qs = qs.filter(daily_rate_paise__lte=max_daily_rate_paise)
    if max_deposit_paise is not None:
        qs = qs.filter(deposit_paise__lte=max_deposit_paise)
    if start_date is not None and end_date is not None and end_date > start_date:
        busy = AssetReservation.objects.filter(
            status=AssetReservation.Status.CONFIRMED,
            start_date__lt=end_date,
            end_date__gt=start_date,
        ).values("asset_id")
        qs = qs.exclude(id__in=busy)

    return qs
