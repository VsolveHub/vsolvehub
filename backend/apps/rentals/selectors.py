"""Read-side selectors for Rental Services (A7_RENTAL)."""

from datetime import date, datetime, time
from typing import Any
from uuid import UUID

from django.db.models import Q, Sum
from django.utils import timezone
from psycopg.types.range import Range

from apps.catalog.models import A7VariantConfiguration, ServiceVariant
from apps.rentals.models import AssetReservation, RentalAsset, RentalBooking


def get_rental_variant_options() -> list[dict[str, Any]]:
    """Every active A7_RENTAL `ServiceVariant`, for the partner's "list a new item"
    picker (Category -> Subcategory -> Service -> Variant, §4.1a's reused taxonomy —
    no separate rental taxonomy is introduced here either)."""
    variants = (
        ServiceVariant.objects.filter(
            booking_archetype=ServiceVariant.BookingArchetype.A7_RENTAL,
            is_active=True,
            a7_configurations__status=A7VariantConfiguration.Status.ACTIVE,
        )
        .distinct()
        .select_related("service", "service__subcategory", "service__subcategory__category")
        .order_by(
            "service__subcategory__category__display_order",
            "service__subcategory__display_order",
            "service__display_order",
            "display_order",
        )
    )
    return [
        {
            "variant_id": variant.id,
            "variant_name": variant.name,
            "service_id": variant.service_id,
            "service_name": variant.service.name,
            "subcategory_name": variant.service.subcategory.name,
            "category_name": variant.service.subcategory.category.name,
        }
        for variant in variants
    ]


def get_occupied_datetime_range(start_date: date, end_date: date) -> Range[datetime]:
    """Builds a timezone-aware DateTime range [start 00:00, end+1 00:00)."""
    tz = timezone.get_current_timezone()
    start_dt = timezone.make_aware(datetime.combine(start_date, time.min), tz)
    # Day-granular: end date is inclusive for the day of rental, so range extends to next morning
    end_dt = timezone.make_aware(datetime.combine(end_date, time.max), tz)
    return Range(start_dt, end_dt, "[)")


def get_rental_listing_groups(
    *,
    service_slug: str | None = None,
    service_variant_id: UUID | str | None = None,
    asset_id: UUID | str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[dict[str, Any]]:
    """Query-time rollup for customer browse: de-duplicates identical vendor assets into cards.

    Mirroring catalog.selectors.public_categories count annotation, per M3 Phase D §4.1a & §11.
    Never persisted as a table.
    """
    qs = (
        RentalAsset.objects.filter(
            current_status=RentalAsset.Status.ACTIVE,
            variant__is_active=True,
            variant__service__status="ACTIVE",
            variant__service__subcategory__is_active=True,
            variant__service__subcategory__category__is_active=True,
            variant__a7_configurations__status=A7VariantConfiguration.Status.ACTIVE,
        )
        .select_related("partner", "partner__user", "variant", "variant__service", "pickup_address")
        .distinct()
    )

    if asset_id:
        qs = qs.filter(id=asset_id)
    if service_slug:
        slug_candidates = [service_slug]
        if not service_slug.startswith("rental-"):
            slug_candidates.append(f"rental-{service_slug}")
        else:
            slug_candidates.append(service_slug.replace("rental-", "", 1))
        qs = qs.filter(variant__service__slug__in=slug_candidates)
    if service_variant_id:
        qs = qs.filter(variant_id=UUID(str(service_variant_id)))

    # If date range provided, filter out booked serialized assets
    occupied = None
    if start_date and end_date:
        occupied = get_occupied_datetime_range(start_date, end_date)

    # Group in Python or SQL aggregate
    # Grouping key: (partner_id, variant_id, daily_price_paise, deposit_paise, condition_grade)
    groups: dict[tuple[UUID, UUID, int, int, str], dict[str, Any]] = {}

    for asset in qs:
        # Check availability if date range specified
        is_free = True
        available_units = 1
        if occupied:
            if asset.is_serialized:
                has_reservation = (
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
                    .exists()
                )
                if has_reservation:
                    is_free = False
            else:
                reserved_quantity = (
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
                available_units = max(0, asset.quantity_available - reserved_quantity)
                if available_units <= 0:
                    is_free = False
        else:
            available_units = asset.quantity_available if not asset.is_serialized else 1

        if not is_free:
            continue

        key = (
            asset.partner_id,
            asset.variant_id,
            asset.daily_price_paise,
            asset.deposit_paise,
            asset.condition_grade,
        )
        if key not in groups:
            # Primary media or fallback
            media_item = asset.media.filter(is_primary=True).first() or asset.media.first()
            image_url = media_item.url if media_item else asset.variant.image_url

            vendor_name = (
                getattr(getattr(asset.partner, "business_profile", None), "legal_name", None)
                or getattr(asset.partner.user, "full_name", "")
                or f"Partner #{str(asset.partner_id)[:8]}"
            )

            groups[key] = {
                "asset_id": str(asset.id),  # representative asset id for hold creation
                "partner_id": str(asset.partner_id),
                "vendor_name": vendor_name,
                "variant_id": str(asset.variant_id),
                "service_name": asset.variant.service.name,
                "title": asset.title,
                "description": asset.description or asset.variant.description,
                "daily_price_paise": asset.daily_price_paise,
                "deposit_paise": asset.deposit_paise,
                "condition_grade": asset.condition_grade,
                "image_url": image_url,
                "pickup_address": {
                    "line1": asset.pickup_address.line1,
                    "city": asset.pickup_address.city,
                    "postal_code": asset.pickup_address.postal_code,
                }
                if asset.pickup_address
                else None,
                "quantity_available": available_units,
            }
        else:
            groups[key]["quantity_available"] += available_units

    return list(groups.values())


def get_asset_detail(asset_id: UUID | str) -> RentalAsset | None:
    return (
        RentalAsset.objects.filter(id=asset_id)
        .select_related("partner", "partner__user", "variant", "variant__service", "pickup_address")
        .prefetch_related("media", "maintenance_periods", "service_areas")
        .first()
    )


def get_booking_detail(booking_id: UUID | str) -> RentalBooking | None:
    return (
        RentalBooking.objects.filter(id=booking_id)
        .select_related(
            "customer",
            "asset",
            "asset__partner",
            "asset__variant",
            "asset__variant__service",
            "reservation",
            "handover",
            "return_inspection",
            "deposit",
            "delivery_address",
        )
        .prefetch_related("lines", "extensions")
        .first()
    )
