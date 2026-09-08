"""Read-side selectors for Stays & Accommodations (A9_STAY)."""

import datetime
import uuid
from typing import Any, cast

from django.db.models import Count, Q
from django.utils import timezone
from psycopg.types.range import Range

from apps.catalog.models import A9VariantConfiguration, ServiceQuestion, ServiceVariant
from apps.stays.models import (
    Property,
    StayReservation,
    Unit,
    UnitPricingRule,
    UnitReservation,
    UnitType,
)


def _host_is_verified(property_obj: Property) -> bool:
    application = getattr(property_obj.partner, "application", None)
    return bool(application and application.status == "APPROVED")


def _effective_pricing_rule(
    unit_type: UnitType,
    *,
    duration_mode: str,
    on_date: datetime.date,
) -> UnitPricingRule | None:
    """Return only the explicitly configured rate for this mode and effective date."""
    return cast(
        UnitPricingRule | None,
        (
            unit_type.pricing_rules.filter(
                duration_mode=duration_mode,
                is_active=True,
                effective_from__lte=on_date,
            )
            .filter(Q(effective_to__isnull=True) | Q(effective_to__gte=on_date))
            .order_by("-effective_from", "id")
            .first()
        ),
    )


def browse_stays(  # noqa: PLR0912, PLR0915, PLR0917
    locality: str = "",
    property_type: str = "",
    sharing_type: str = "",
    furnishing_status: str = "",
    is_ac: bool | None = None,
    food_included: bool | None = None,
    min_price_paise: int | None = None,
    max_price_paise: int | None = None,
    duration_mode: str = UnitPricingRule.DurationMode.MONTHLY,
    start_date: datetime.date | None = None,
    end_date: datetime.date | None = None,
    bhk: str = "",
    unit_type_id: uuid.UUID | str | None = None,
    subcategory_slug: str = "",
    service_slug: str = "",
) -> list[dict[str, Any]]:
    """Return flat list of de-duplicated UnitType cards across properties with
    available counts (§5.1a).
    """
    queryset = (
        UnitType.objects.filter(
            is_active=True,
            property__is_active=True,
            property__policies__is_active=True,
            variant__is_active=True,
            variant__service__status="ACTIVE",
            variant__service__subcategory__is_active=True,
            variant__service__subcategory__category__is_active=True,
        )
        .filter(variant__a9_configurations__status=A9VariantConfiguration.Status.ACTIVE)
        .select_related(
            "property", "property__address", "property__partner", "property__partner__user"
        )
        .prefetch_related("pricing_rules", "units", "property__media")
        .distinct()
    )

    if locality:
        queryset = queryset.filter(
            Q(property__locality__icontains=locality)
            | Q(property__address__city__icontains=locality)
            | Q(property__address__line1__icontains=locality)
        )

    if property_type:
        queryset = queryset.filter(property__property_type=property_type)

    if subcategory_slug:
        queryset = queryset.filter(variant__service__subcategory__slug=subcategory_slug)

    if service_slug:
        service_q = Q(variant__service__slug=service_slug) | Q(variant__code=service_slug)
        if "ac" in service_slug and "non-ac" not in service_slug:
            service_q |= Q(is_ac=True)
        elif "non-ac" in service_slug:
            service_q |= Q(is_ac=False)
        queryset = queryset.filter(service_q)

    if sharing_type:
        queryset = queryset.filter(sharing_type=sharing_type)

    if furnishing_status:
        queryset = queryset.filter(furnishing_status=furnishing_status)

    if is_ac is not None:
        queryset = queryset.filter(is_ac=is_ac)

    if food_included is not None:
        queryset = queryset.filter(food_included=food_included)

    if bhk and bhk.lower() != "all":
        queryset = queryset.filter(bhk__icontains=bhk)

    if unit_type_id:
        queryset = queryset.filter(id=unit_type_id)

    results = []
    for ut in queryset:
        pricing_date = start_date or timezone.localdate()
        rule = _effective_pricing_rule(
            ut,
            duration_mode=duration_mode,
            on_date=pricing_date,
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
            rule = _effective_pricing_rule(ut, duration_mode=alt_mode, on_date=pricing_date)

        if not rule:
            continue

        price_paise = rule.base_rate_paise
        deposit_paise = rule.deposit_paise
        maintenance_paise = rule.maintenance_paise
        daily_rule = _effective_pricing_rule(
            ut, duration_mode=UnitPricingRule.DurationMode.NIGHTLY, on_date=pricing_date
        ) or _effective_pricing_rule(
            ut, duration_mode=UnitPricingRule.DurationMode.DAILY, on_date=pricing_date
        )
        monthly_rule = _effective_pricing_rule(
            ut, duration_mode=UnitPricingRule.DurationMode.MONTHLY, on_date=pricing_date
        )
        daily_rate_paise = (
            daily_rule.base_rate_paise
            if daily_rule
            else (
                round(price_paise / 30)
                if rule.duration_mode == UnitPricingRule.DurationMode.MONTHLY
                else price_paise
            )
        )
        monthly_rate_paise = (
            monthly_rule.base_rate_paise
            if monthly_rule
            else (
                price_paise * 30
                if rule.duration_mode
                in (UnitPricingRule.DurationMode.DAILY, UnitPricingRule.DurationMode.NIGHTLY)
                else price_paise
            )
        )

        if min_price_paise is not None and price_paise < min_price_paise:
            continue
        if max_price_paise is not None and price_paise > max_price_paise:
            continue

        # Count total and available units
        active_units = ut.units.filter(current_status=Unit.Status.ACTIVE)
        total_units_count = active_units.count()

        occupied_range = None
        if start_date and end_date and start_date < end_date:
            policy = ut.property.get_active_policy(start_date)
            if policy is None:
                continue
            occupied_range = Range(
                timezone.make_aware(datetime.datetime.combine(start_date, policy.check_in_time)),
                timezone.make_aware(datetime.datetime.combine(end_date, policy.check_out_time)),
                "[)",
            )

        if occupied_range:
            unavailable_units_count = (
                active_units.filter(
                    reservations__occupied_range__overlap=occupied_range,
                )
                .filter(
                    Q(reservations__status=UnitReservation.Status.CONFIRMED)
                    | Q(
                        reservations__status=UnitReservation.Status.TENTATIVE,
                        reservations__expires_at__gt=timezone.now(),
                    )
                )
                .distinct()
                .count()
            )
            available_count = max(0, total_units_count - unavailable_units_count)
        else:
            # Advisory count: unreserved currently
            now = timezone.now()
            today_range = Range(now, now + datetime.timedelta(days=1), "[)")
            busy_count = (
                active_units.filter(
                    reservations__occupied_range__overlap=today_range,
                )
                .filter(
                    Q(reservations__status=UnitReservation.Status.CONFIRMED)
                    | Q(
                        reservations__status=UnitReservation.Status.TENTATIVE,
                        reservations__expires_at__gt=timezone.now(),
                    )
                )
                .distinct()
                .count()
            )
            available_count = max(0, total_units_count - busy_count)

        primary_photo = ut.property.media.filter(is_primary=True).first()
        image_url = ut.image_url or (primary_photo.url if primary_photo else "")

        results.append(
            {
                "unit_type_id": str(ut.id),
                "property_id": str(ut.property.id),
                "property_title": ut.property.title,
                "property_type": ut.property.property_type,
                "property_type_display": ut.property.get_property_type_display(),
                "locality": ut.property.locality,
                "rating": float(ut.property.rating),
                "reviews_count": ut.property.reviews_count,
                "unit_name": ut.name,
                "sharing_type": ut.sharing_type,
                "sharing_display": ut.get_sharing_type_display(),
                "sharing_count": ut.sharing_count,
                "is_ac": ut.is_ac,
                "bathroom_type": ut.bathroom_type,
                "furnishing_status": ut.furnishing_status,
                "furnishing_display": ut.get_furnishing_status_display(),
                "food_included": ut.food_included,
                "bhk": ut.bhk,
                "bathrooms": ut.bathrooms,
                "built_up_sqft": ut.built_up_sqft,
                "facing": ut.facing,
                "floor": ut.floor,
                "amenities": ut.amenities,
                "image_url": image_url,
                "price_paise": price_paise,
                "price_per_month": price_paise // 100,
                "daily_rate_paise": daily_rate_paise,
                "monthly_rate_paise": monthly_rate_paise,
                "deposit_paise": deposit_paise,
                "maintenance_paise": maintenance_paise,
                "duration_mode": rule.duration_mode if rule else duration_mode,
                "supported_duration_modes": list(
                    ut.pricing_rules.filter(is_active=True)
                    .values_list("duration_mode", flat=True)
                    .distinct()
                ),
                "total_units": total_units_count,
                "units_available": available_count,
                "host_name": getattr(ut.property.partner.user, "full_name", "") or "Verified Host",
                "host_verified": _host_is_verified(ut.property),
            }
        )

    return results


def get_property_detail(
    property_id: uuid.UUID | str,
    *,
    start_date: datetime.date | None = None,
    end_date: datetime.date | None = None,
    duration_mode: str = UnitPricingRule.DurationMode.MONTHLY,
) -> dict[str, Any] | None:
    """Return full detail of a property, its policy, photo gallery, and available UnitTypes."""
    try:
        prop = (
            Property.objects.filter(is_active=True)
            .select_related("address", "partner", "partner__user")
            .prefetch_related(
                "media", "unit_types", "unit_types__pricing_rules", "unit_types__units"
            )
            .get(id=property_id)
        )
    except Property.DoesNotExist:
        return None

    policy = prop.get_active_policy(start_date)
    if policy is None:
        return None
    media_list = [
        {"id": str(m.id), "url": m.url, "caption": m.caption, "is_primary": m.is_primary}
        for m in prop.media.all()
    ]

    occupied_range = None
    if start_date and end_date:
        if start_date >= end_date:
            return None
        check_in = policy.check_in_time
        check_out = policy.check_out_time
        occupied_range = Range(
            timezone.make_aware(datetime.datetime.combine(start_date, check_in)),
            timezone.make_aware(datetime.datetime.combine(end_date, check_out)),
            "[)",
        )

    unit_types_data = []
    for ut in (
        prop.unit_types.filter(
            is_active=True,
            variant__is_active=True,
            variant__service__status="ACTIVE",
            variant__service__subcategory__is_active=True,
            variant__service__subcategory__category__is_active=True,
        )
        .filter(variant__a9_configurations__status=A9VariantConfiguration.Status.ACTIVE)
        .distinct()
    ):
        rule = _effective_pricing_rule(
            ut,
            duration_mode=duration_mode,
            on_date=start_date or timezone.localdate(),
        )
        if rule is None:
            continue
        active_units = ut.units.filter(current_status=Unit.Status.ACTIVE)
        base_rate = rule.base_rate_paise
        deposit_rate = rule.deposit_paise
        maintenance_rate = rule.maintenance_paise
        selected_duration_mode = rule.duration_mode
        unavailable = 0
        if occupied_range is not None:
            unavailable = (
                active_units.filter(
                    reservations__occupied_range__overlap=occupied_range,
                )
                .filter(
                    Q(reservations__status=UnitReservation.Status.CONFIRMED)
                    | Q(
                        reservations__status=UnitReservation.Status.TENTATIVE,
                        reservations__expires_at__gt=timezone.now(),
                    )
                )
                .distinct()
                .count()
            )
        avail_count = max(0, active_units.count() - unavailable)
        if selected_duration_mode == UnitPricingRule.DurationMode.MONTHLY:
            daily_paise = base_rate // 30
            monthly_paise = base_rate
        elif selected_duration_mode == UnitPricingRule.DurationMode.WEEKLY:
            daily_paise = base_rate // 7
            monthly_paise = 0
        else:
            daily_paise = base_rate
            monthly_paise = 0

        unit_types_data.append(
            {
                "id": str(ut.id),
                "name": ut.name,
                "description": ut.description,
                "sharing_type": ut.sharing_type,
                "sharing_display": ut.get_sharing_type_display(),
                "sharing_count": ut.sharing_count,
                "is_ac": ut.is_ac,
                "bathroom_type": ut.bathroom_type,
                "furnishing_status": ut.furnishing_status,
                "furnishing_display": ut.get_furnishing_status_display(),
                "food_included": ut.food_included,
                "bhk": ut.bhk,
                "bathrooms": ut.bathrooms,
                "built_up_sqft": ut.built_up_sqft,
                "facing": ut.facing,
                "floor": ut.floor,
                "amenities": ut.amenities,
                "image_url": ut.image_url,
                "pricing": {
                    "daily_paise": daily_paise,
                    "monthly_paise": monthly_paise,
                    "deposit_paise": deposit_rate,
                    "maintenance_paise": maintenance_rate,
                    "duration_mode": selected_duration_mode,
                },
                "units_available": avail_count,
                "available_count": avail_count,
                "base_rate_paise": base_rate,
                "deposit_paise": deposit_rate,
                "maintenance_paise": maintenance_rate,
                "duration_mode": selected_duration_mode,
            }
        )

    return {
        "id": str(prop.id),
        "title": prop.title,
        "property_type": prop.property_type,
        "property_type_display": prop.get_property_type_display(),
        "description": prop.description,
        "locality": prop.locality,
        "address": {
            "line1": prop.address.line1 if prop.address else "",
            "city": prop.address.city if prop.address else "Hyderabad",
            "pincode": prop.address.postal_code if prop.address else "500084",
            "latitude": float(prop.address.latitude) if prop.address else None,
            "longitude": float(prop.address.longitude) if prop.address else None,
        }
        if prop.address
        else None,
        "rating": float(prop.rating),
        "reviews_count": prop.reviews_count,
        "host": {
            "name": getattr(prop.partner.user, "full_name", "") or "Verified Host",
            "phone_verified": bool(getattr(prop.partner.user, "phone_number", "")),
            "id_verified": _host_is_verified(prop),
            "member_since": prop.partner.created_at.strftime("%b %Y"),
        },
        "policy": {
            "check_in_time": str(policy.check_in_time) if policy else "12:00:00",
            "check_out_time": str(policy.check_out_time) if policy else "11:00:00",
            "max_guests_per_unit": policy.max_guests_per_unit if policy else 2,
            "id_verification_required": policy.id_verification_required if policy else True,
            "cancellation_policy": policy.cancellation_policy if policy else "MODERATE",
            "notice_period_days": policy.notice_period_days if policy else 30,
            "house_rules": policy.house_rules
            if policy
            else ["No smoking inside", "Visitors allowed till 9 PM"],
        }
        if policy
        else None,
        "media": media_list,
        "unit_types": unit_types_data,
    }


def get_partner_properties(partner: Any) -> list[dict[str, Any]]:
    """List host properties with unit counts and active reservations."""
    properties = (
        Property.objects.filter(partner=partner)
        .prefetch_related("unit_types", "units", "media")
        .annotate(
            computed_units_count=Count("units", distinct=True),
        )
    )

    data = []
    for prop in properties:
        active_res_count = StayReservation.objects.filter(
            unit__property=prop,
            status__in=(
                StayReservation.Status.CONFIRMED,
                StayReservation.Status.CHECKED_IN,
                StayReservation.Status.IN_STAY,
            ),
        ).count()

        primary_photo = prop.media.filter(is_primary=True).first()
        has_pricing = UnitPricingRule.objects.filter(
            unit_type__property=prop,
            is_active=True,
        ).exists()

        data.append(
            {
                "id": str(prop.id),
                "title": prop.title,
                "property_type": prop.property_type,
                "property_type_display": prop.get_property_type_display(),
                "locality": prop.locality,
                "rating": float(prop.rating),
                "total_units": getattr(prop, "computed_units_count", 0),
                "active_guests": active_res_count,
                "image_url": primary_photo.url if primary_photo else "",
                "is_active": prop.is_active,
                "has_pricing": has_pricing,
            }
        )
    return data


def get_stay_filter_definitions(service_slug: str | None = None) -> list[dict[str, Any]]:
    """Return filter definitions driven by catalog.ServiceQuestion metadata (§5.1)."""
    questions_qs = ServiceQuestion.objects.filter(
        variant__booking_archetype=ServiceVariant.BookingArchetype.A9_STAY,
        is_active=True,
    ).prefetch_related("options")

    if service_slug:
        questions_qs = questions_qs.filter(variant__service__slug=service_slug)

    seen_codes: set[str] = set()
    filters: list[dict[str, Any]] = []

    for q in questions_qs:
        if q.code in seen_codes:
            continue
        seen_codes.add(q.code)
        options = [
            {
                "code": opt.code,
                "label": opt.label,
                "description": opt.description,
            }
            for opt in q.options.filter(is_active=True).order_by("display_order")
        ]
        filters.append(
            {
                "code": q.code,
                "prompt": q.prompt,
                "kind": q.kind,
                "is_required": q.is_required,
                "display_order": q.display_order,
                "options": options,
            }
        )

    if not filters:
        filters = [
            {
                "code": "sharing_type",
                "prompt": "Sharing Type",
                "kind": "SINGLE_CHOICE",
                "is_required": False,
                "display_order": 1,
                "options": [
                    {"code": c[0], "label": c[1], "description": ""}
                    for c in UnitType.SharingType.choices
                ],
            },
            {
                "code": "furnishing_status",
                "prompt": "Furnishing Status",
                "kind": "SINGLE_CHOICE",
                "is_required": False,
                "display_order": 2,
                "options": [
                    {"code": c[0], "label": c[1], "description": ""}
                    for c in UnitType.FurnishingStatus.choices
                ],
            },
            {
                "code": "bathroom_type",
                "prompt": "Bathroom Type",
                "kind": "SINGLE_CHOICE",
                "is_required": False,
                "display_order": 3,
                "options": [
                    {"code": c[0], "label": c[1], "description": ""}
                    for c in UnitType.BathroomType.choices
                ],
            },
            {
                "code": "is_ac",
                "prompt": "Air Conditioning (AC)",
                "kind": "BOOLEAN",
                "is_required": False,
                "display_order": 4,
                "options": [],
            },
            {
                "code": "food_included",
                "prompt": "Food Included",
                "kind": "BOOLEAN",
                "is_required": False,
                "display_order": 5,
                "options": [],
            },
        ]

    return filters
