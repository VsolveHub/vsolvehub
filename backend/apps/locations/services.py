"""Transactional address changes and serviceability decisions."""

import re
import uuid
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.db import transaction
from django.db.models import QuerySet
from django.utils import timezone

from apps.catalog.models import Service, ServiceVariant
from apps.identity.models import User
from apps.locations.exceptions import AddressArchivedApiError
from apps.locations.models import (
    Address,
    ServiceArea,
    ServiceAreaOperatingException,
)

INDIA_POSTAL_CODE_PATTERN = re.compile(r"^\d{6}$")


def normalize_postal_code(value: str) -> str:
    postal_code = re.sub(r"\s+", "", value).upper()
    if not INDIA_POSTAL_CODE_PATTERN.fullmatch(postal_code):
        raise ValueError("Enter a valid six-digit Indian postal code.")
    return postal_code


@transaction.atomic
def create_address(*, customer: User, values: dict[str, object]) -> Address:
    values["postal_code"] = normalize_postal_code(str(values["postal_code"]))
    if (
        bool(values.get("is_default"))
        or not Address.objects.filter(
            customer=customer,
            archived_at__isnull=True,
        ).exists()
    ):
        Address.objects.filter(
            customer=customer,
            archived_at__isnull=True,
            is_default=True,
        ).update(is_default=False)
        values["is_default"] = True
    return Address.objects.create(customer=customer, confirmed_at=timezone.now(), **values)


@transaction.atomic
def update_address(*, address: Address, values: dict[str, object]) -> Address:
    locked = Address.objects.select_for_update().get(pk=address.pk)
    if locked.archived_at is not None:
        raise AddressArchivedApiError
    if "postal_code" in values:
        values["postal_code"] = normalize_postal_code(str(values["postal_code"]))
    if values.get("is_default") is True:
        Address.objects.filter(
            customer=locked.customer,
            archived_at__isnull=True,
            is_default=True,
        ).exclude(pk=locked.pk).update(is_default=False)
    for field, value in values.items():
        setattr(locked, field, value)
    locked.confirmed_at = timezone.now()
    locked.save(update_fields=(*values.keys(), "confirmed_at", "updated_at"))
    return locked


@transaction.atomic
def archive_address(*, address: Address) -> None:
    locked = Address.objects.select_for_update().get(pk=address.pk)
    if locked.archived_at is not None:
        return
    was_default = locked.is_default
    locked.archived_at = timezone.now()
    locked.is_default = False
    locked.save(update_fields=("archived_at", "is_default", "updated_at"))
    if was_default:
        replacement = (
            Address.objects.filter(customer=locked.customer, archived_at__isnull=True)
            .order_by("-updated_at")
            .first()
        )
        if replacement is not None:
            replacement.is_default = True
            replacement.save(update_fields=("is_default", "updated_at"))


@dataclass(frozen=True, slots=True)
class ServiceabilityDecision:
    is_serviceable: bool
    reason_code: str | None
    service_area: ServiceArea | None


def check_serviceability(
    *,
    postal_code: str,
    variant_id: uuid.UUID | None = None,
    requested_start: datetime | None = None,
    duration_minutes: int | None = None,
) -> ServiceabilityDecision:
    normalized = normalize_postal_code(postal_code)
    areas = ServiceArea.objects.filter(
        is_active=True,
        postal_code_links__postal_code__code=normalized,
        postal_code_links__postal_code__is_active=True,
    ).distinct()
    if not areas.exists():
        return ServiceabilityDecision(False, "OUTSIDE_SERVICE_AREA", None)

    if variant_id is not None:
        variant_exists = ServiceVariant.objects.filter(
            pk=variant_id,
            is_active=True,
            service__status=Service.Status.ACTIVE,
        ).exists()
        if not variant_exists:
            return ServiceabilityDecision(False, "SERVICE_NOT_BOOKABLE", None)
        areas = areas.filter(service_links__variant_id=variant_id, service_links__is_active=True)
        if not areas.exists():
            return ServiceabilityDecision(False, "SERVICE_NOT_AVAILABLE_IN_AREA", None)

    if requested_start is None:
        return ServiceabilityDecision(True, None, areas.order_by("name").first())

    duration = duration_minutes or 60
    for area in areas.prefetch_related("operating_windows", "operating_exceptions"):
        if _area_is_open(area=area, start=requested_start, duration_minutes=duration):
            return ServiceabilityDecision(True, None, area)
    return ServiceabilityDecision(False, "OUTSIDE_OPERATING_HOURS", areas.order_by("name").first())


def _area_is_open(*, area: ServiceArea, start: datetime, duration_minutes: int) -> bool:
    local_start = start.astimezone(ZoneInfo(area.timezone))
    local_end = local_start + timedelta(minutes=duration_minutes)
    candidate_dates = (local_start.date() - timedelta(days=1), local_start.date())
    for window_date in candidate_dates:
        ranges = operating_ranges_for_date(area=area, local_date=window_date)
        for opens_at, closes_at in ranges:
            if opens_at <= local_start and local_end <= closes_at:
                return True
    return False


def operating_ranges_for_date(
    *, area: ServiceArea, local_date: date
) -> list[tuple[datetime, datetime]]:
    exception = _exception_for_date(area.operating_exceptions.all(), local_date)
    if exception is not None:
        if exception.is_closed or exception.opens_at is None or exception.closes_at is None:
            return []
        return [
            _localized_range(
                area=area,
                local_date=local_date,
                opens_at=exception.opens_at,
                closes_at=exception.closes_at,
                closes_next_day=exception.closes_next_day,
            ),
        ]

    return [
        _localized_range(
            area=area,
            local_date=local_date,
            opens_at=window.opens_at,
            closes_at=window.closes_at,
            closes_next_day=window.closes_next_day,
        )
        for window in area.operating_windows.all()
        if window.weekday == local_date.weekday()
    ]


def _exception_for_date(
    exceptions: QuerySet[ServiceAreaOperatingException] | list[ServiceAreaOperatingException],
    local_date: date,
) -> ServiceAreaOperatingException | None:
    return next((item for item in exceptions if item.date == local_date), None)


def _localized_range(
    *,
    area: ServiceArea,
    local_date: date,
    opens_at: time,
    closes_at: time,
    closes_next_day: bool,
) -> tuple[datetime, datetime]:
    zone = ZoneInfo(area.timezone)
    opens = datetime.combine(local_date, opens_at, tzinfo=zone)
    close_date = local_date + timedelta(days=1) if closes_next_day else local_date
    closes = datetime.combine(close_date, closes_at, tzinfo=zone)
    return opens, closes
