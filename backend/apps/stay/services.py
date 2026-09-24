"""A9 stay enquiry-first services. Fail-closed on capability + ACTIVE A9VariantConfiguration."""

from __future__ import annotations

from datetime import date
from typing import Any
from uuid import UUID

from django.db import models, transaction
from django.utils import timezone

from apps.catalog.models import A9VariantConfiguration
from apps.stay.models import Property, StayEnquiry, StayModerationEvent, Unit


class StayStateError(ValueError):
    pass


def _as_uuid(value: UUID | str) -> UUID:
    return value if isinstance(value, UUID) else UUID(str(value))


def _require_stay_capability(partner: Any) -> None:
    if not partner.capabilities.filter(archetype="A9_STAY", status="APPROVED").exists():
        raise PermissionError("Partner does not have an approved A9 stay capability.")


def _require_active_a9(variant_id: UUID | str) -> A9VariantConfiguration:
    config = A9VariantConfiguration.objects.filter(
        variant_id=_as_uuid(variant_id),
        status=A9VariantConfiguration.Status.ACTIVE,
    ).first()
    if config is None:
        raise StayStateError("This stay category is not open yet.")
    return config


@transaction.atomic
def create_property(
    *,
    host: Any,
    variant_id: UUID | str,
    title: str,
    description: str = "",
    location_text: str = "",
    unit_name: str = "Standard room",
    nightly_rate_paise: int = 100000,
    sharing_count: int = 1,
) -> Property:
    _require_stay_capability(host)
    _require_active_a9(variant_id)
    if nightly_rate_paise <= 0:
        raise StayStateError("Nightly rate must be positive paise.")
    prop = Property.objects.create(
        host=host,
        variant_id=_as_uuid(variant_id),
        title=title.strip(),
        description=description,
        location_text=location_text,
        moderation_status=Property.ModerationStatus.DRAFT,
    )
    Unit.objects.create(
        property=prop,
        name=unit_name,
        sharing_count=sharing_count,
        nightly_rate_paise=nightly_rate_paise,
    )
    return prop


def submit_property(*, prop: Property, host: Any) -> Property:
    _require_stay_capability(host)
    if prop.host_id != host.id:
        raise PermissionError("Not your property.")
    _require_active_a9(prop.variant_id)
    if prop.moderation_status not in (
        Property.ModerationStatus.DRAFT,
        Property.ModerationStatus.REJECTED,
    ):
        raise StayStateError("Property cannot be submitted from this state.")
    prop.moderation_status = Property.ModerationStatus.PENDING
    prop.save(update_fields=("moderation_status", "updated_at"))
    StayModerationEvent.objects.create(
        property=prop,
        actor=host.user,
        action=StayModerationEvent.Action.SUBMITTED,
        reason="",
    )
    return prop


def moderate_property(*, prop: Property, actor: Any, action: str, reason: str) -> Property:
    reason = (reason or "").strip()
    if not reason:
        raise StayStateError("A moderation reason is required.")
    action = action.upper()
    if action == "APPROVE":
        prop.moderation_status = Property.ModerationStatus.APPROVED
        event = StayModerationEvent.Action.APPROVED
    elif action == "REJECT":
        prop.moderation_status = Property.ModerationStatus.REJECTED
        event = StayModerationEvent.Action.REJECTED
    elif action == "REMOVE":
        prop.moderation_status = Property.ModerationStatus.REMOVED
        event = StayModerationEvent.Action.REMOVED
    elif action == "REINSTATE":
        prop.moderation_status = Property.ModerationStatus.APPROVED
        event = StayModerationEvent.Action.REINSTATED
    else:
        raise StayStateError("Unknown moderation action.")
    prop.moderation_reason = reason
    prop.save(update_fields=("moderation_status", "moderation_reason", "updated_at"))
    StayModerationEvent.objects.create(property=prop, actor=actor, action=event, reason=reason)
    return prop


def create_enquiry(
    *,
    customer: Any,
    property_id: UUID | str,
    check_in: date,
    check_out: date,
    guest_count: int = 1,
    message: str = "",
    unit_id: UUID | str | None = None,
) -> StayEnquiry:
    prop = Property.objects.select_related("variant").get(id=_as_uuid(property_id))
    _require_active_a9(prop.variant_id)
    if prop.public_state != "PUBLISHED":
        raise StayStateError("Property is not open for enquiries.")
    if check_out <= check_in:
        raise StayStateError("Check-out must be after check-in.")
    unit = None
    if unit_id is not None:
        unit = Unit.objects.get(id=_as_uuid(unit_id), property=prop, is_active=True)
    elif prop.units.filter(is_active=True).exists():
        unit = prop.units.filter(is_active=True).first()

    nights = max(1, (check_out - check_in).days)
    nightly_rate_paise = unit.nightly_rate_paise if unit else 0
    total_quote_paise = nights * nightly_rate_paise

    return StayEnquiry.objects.create(
        property=prop,
        unit=unit,
        customer=customer,
        check_in=check_in,
        check_out=check_out,
        guest_count=guest_count,
        nights=nights,
        total_quote_paise=total_quote_paise,
        message=message,
        status=StayEnquiry.Status.SUBMITTED,
    )


def calculate_stay_quote(
    *,
    property_id: UUID | str,
    check_in: date,
    check_out: date,
    unit_id: UUID | str | None = None,
) -> dict[str, Any]:
    prop = Property.objects.select_related("variant").get(id=_as_uuid(property_id))
    _require_active_a9(prop.variant_id)
    if prop.public_state != "PUBLISHED":
        raise StayStateError("Property is not open.")
    if check_out <= check_in:
        raise StayStateError("Check-out must be after check-in.")
    unit = None
    if unit_id is not None:
        unit = Unit.objects.get(id=_as_uuid(unit_id), property=prop, is_active=True)
    elif prop.units.filter(is_active=True).exists():
        unit = prop.units.filter(is_active=True).first()

    nights = max(1, (check_out - check_in).days)
    nightly_rate_paise = unit.nightly_rate_paise if unit else 0
    total_quote_paise = nights * nightly_rate_paise

    return {
        "property_id": prop.id,
        "unit_id": unit.id if unit else None,
        "unit_name": unit.name if unit else "Standard room",
        "nights": nights,
        "nightly_rate_paise": nightly_rate_paise,
        "total_quote_paise": total_quote_paise,
    }


def respond_enquiry(*, enquiry: StayEnquiry, host: Any, response: str, decline: bool = False) -> StayEnquiry:
    _require_stay_capability(host)
    if enquiry.property.host_id != host.id:
        raise PermissionError("Not your enquiry.")
    if enquiry.status != StayEnquiry.Status.SUBMITTED:
        raise StayStateError("Enquiry is not awaiting a response.")
    response = (response or "").strip()
    if not response:
        raise StayStateError("A response message is required.")
    enquiry.host_response = response
    enquiry.responded_at = timezone.now()
    enquiry.status = StayEnquiry.Status.DECLINED if decline else StayEnquiry.Status.RESPONDED
    enquiry.save(update_fields=("host_response", "responded_at", "status", "updated_at"))
    return enquiry


def public_properties(
    *,
    query: str = "",
    location: str = "",
    sharing_count: int | None = None,
    has_ac: bool | None = None,
    food_included: bool | None = None,
    min_price_paise: int | None = None,
    max_price_paise: int | None = None,
    variant_code: str = "",
    limit: int | None = None,
    offset: int = 0,
):
    qs = Property.objects.filter(
        moderation_status=Property.ModerationStatus.APPROVED
    ).prefetch_related("units").select_related("host", "variant")

    if query:
        q = query.strip()
        qs = qs.filter(
            models.Q(title__icontains=q)
            | models.Q(description__icontains=q)
            | models.Q(location_text__icontains=q)
            | models.Q(host__display_name__icontains=q)
        )
    if location:
        qs = qs.filter(location_text__icontains=location.strip())
    if variant_code:
        qs = qs.filter(
            models.Q(variant__code__icontains=variant_code)
            | models.Q(variant__service__slug__icontains=variant_code)
        )
    if sharing_count is not None:
        qs = qs.filter(units__sharing_count=sharing_count, units__is_active=True)
    if min_price_paise is not None:
        qs = qs.filter(units__nightly_rate_paise__gte=min_price_paise, units__is_active=True)
    if max_price_paise is not None:
        qs = qs.filter(units__nightly_rate_paise__lte=max_price_paise, units__is_active=True)
    if has_ac is True:
        qs = qs.filter(
            models.Q(structured_fields__ac=True)
            | models.Q(units__attributes__ac=True)
            | models.Q(title__icontains="ac")
            | models.Q(description__icontains="ac")
        )
    if food_included is True:
        qs = qs.filter(
            models.Q(structured_fields__food=True)
            | models.Q(units__attributes__food=True)
            | models.Q(title__icontains="food")
            | models.Q(title__icontains="meal")
            | models.Q(description__icontains="food")
            | models.Q(description__icontains="meal")
        )

    qs = qs.distinct().order_by("-created_at")
    if offset:
        qs = qs[offset:]
    if limit is not None:
        qs = qs[:limit]
    return qs
