"""A9 stay enquiry-first services. Fail-closed on capability + ACTIVE A9VariantConfiguration."""

from __future__ import annotations

from datetime import date
from typing import Any
from uuid import UUID

from django.db import transaction
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
    return StayEnquiry.objects.create(
        property=prop,
        unit=unit,
        customer=customer,
        check_in=check_in,
        check_out=check_out,
        guest_count=guest_count,
        message=message,
        status=StayEnquiry.Status.SUBMITTED,
    )


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


def public_properties():
    return Property.objects.filter(
        moderation_status=Property.ModerationStatus.APPROVED
    ).prefetch_related("units").select_related("host", "variant")
