from datetime import datetime, time, timedelta
from http import HTTPStatus
from zoneinfo import ZoneInfo

import pytest
from rest_framework.test import APIClient

from apps.catalog.models import Category, Service, ServiceVariant, Subcategory
from apps.locations.models import (
    PostalCode,
    ServiceArea,
    ServiceAreaOperatingWindow,
    ServiceAreaPostalCode,
    ServiceAreaService,
)

pytestmark = pytest.mark.django_db


def _area_and_variant() -> tuple[ServiceArea, ServiceVariant]:
    category = Category.objects.create(slug="technician", name="Technician")
    subcategory = Subcategory.objects.create(
        category=category,
        slug="electrician",
        name="Electrician",
    )
    service = Service.objects.create(
        subcategory=subcategory,
        slug="switch-repair",
        name="Switch Repair",
        short_description="Repair a switch.",
        status=Service.Status.ACTIVE,
    )
    variant = ServiceVariant.objects.create(
        service=service,
        code="standard",
        name="Standard",
        pricing_strategy=ServiceVariant.PricingStrategy.DURATION,
        required_skill_code="electrician",
        tax_category_code="technician-repair",
    )
    postal_code = PostalCode.objects.create(
        code="500032",
        city="Hyderabad",
        state="Telangana",
    )
    area = ServiceArea.objects.create(slug="west-hyderabad", name="West Hyderabad")
    ServiceAreaPostalCode.objects.create(service_area=area, postal_code=postal_code)
    ServiceAreaService.objects.create(service_area=area, variant=variant)
    return area, variant


def test_serviceability_checks_variant_and_complete_duration() -> None:
    area, variant = _area_and_variant()
    monday = datetime(2026, 8, 3, 10, 0, tzinfo=ZoneInfo("Asia/Kolkata"))
    ServiceAreaOperatingWindow.objects.create(
        service_area=area,
        weekday=monday.weekday(),
        opens_at=time(9, 0),
        closes_at=time(12, 0),
    )

    available = APIClient().post(
        "/api/v1/serviceability/check/",
        {
            "postal_code": "500032",
            "service_variant_id": str(variant.id),
            "requested_start": monday.isoformat(),
            "duration_minutes": 120,
        },
        format="json",
    )
    too_long = APIClient().post(
        "/api/v1/serviceability/check/",
        {
            "postal_code": "500032",
            "service_variant_id": str(variant.id),
            "requested_start": monday.isoformat(),
            "duration_minutes": 180,
        },
        format="json",
    )

    assert available.status_code == HTTPStatus.OK
    assert available.json()["is_serviceable"] is True
    assert available.json()["service_area"]["slug"] == "west-hyderabad"
    assert available.json()["server_now"]
    assert too_long.status_code == HTTPStatus.OK
    assert too_long.json()["is_serviceable"] is False
    assert too_long.json()["reason_code"] == "OUTSIDE_OPERATING_HOURS"


def test_midnight_spanning_operating_window() -> None:
    area, variant = _area_and_variant()
    start = datetime(2026, 8, 3, 23, 0, tzinfo=ZoneInfo("Asia/Kolkata"))
    ServiceAreaOperatingWindow.objects.create(
        service_area=area,
        weekday=start.weekday(),
        opens_at=time(22, 0),
        closes_at=time(2, 0),
        closes_next_day=True,
    )

    response = APIClient().post(
        "/api/v1/serviceability/check/",
        {
            "postal_code": "500032",
            "service_variant_id": str(variant.id),
            "requested_start": start.isoformat(),
            "duration_minutes": int(timedelta(hours=3).total_seconds() / 60),
        },
        format="json",
    )

    assert response.status_code == HTTPStatus.OK
    assert response.json()["is_serviceable"] is True


def test_serviceability_never_uses_location_fallback() -> None:
    response = APIClient().post(
        "/api/v1/serviceability/check/",
        {"postal_code": "500001"},
        format="json",
    )

    assert response.status_code == HTTPStatus.OK
    assert response.json()["is_serviceable"] is False
    assert response.json()["reason_code"] == "OUTSIDE_SERVICE_AREA"
    assert response.json()["service_area"] is None


def _pause(target: str) -> None:
    from apps.identity.models import User  # noqa: PLC0415 - test-local helper
    from apps.notifications.services import engage_kill_switch  # noqa: PLC0415

    operator = User.objects.create_user(phone_number="+919811100001")
    engage_kill_switch(scope="SERVICE_AREA", target=target, reason="Flooding", actor=operator)


def _check(variant: ServiceVariant) -> dict[str, object]:
    response = APIClient().post(
        "/api/v1/serviceability/check/",
        {"postal_code": "500032", "service_variant_id": str(variant.id)},
        format="json",
    )
    assert response.status_code == HTTPStatus.OK
    return dict(response.json())


def test_a_paused_area_takes_no_new_bookings_and_says_why() -> None:
    """Regression: the SERVICE_AREA kill switch had no reader, so pausing an area did nothing."""
    area, variant = _area_and_variant()
    _pause(area.slug)

    body = _check(variant)

    assert body["is_serviceable"] is False
    assert body["reason_code"] == "SERVICE_AREA_PAUSED"


def test_an_area_is_bookable_again_once_the_switch_is_turned_back_on() -> None:
    from apps.identity.models import User  # noqa: PLC0415
    from apps.notifications.services import release_kill_switch  # noqa: PLC0415

    area, variant = _area_and_variant()
    _pause(area.slug)
    release_kill_switch(
        scope="SERVICE_AREA",
        target=area.slug,
        actor=User.objects.create_user(phone_number="+919811100002"),
    )

    assert _check(variant)["is_serviceable"] is True


def test_pausing_another_area_leaves_this_one_open() -> None:
    _area, variant = _area_and_variant()
    _pause("some-other-area")

    assert _check(variant)["is_serviceable"] is True


def test_a_blank_target_pauses_every_area() -> None:
    _area, variant = _area_and_variant()
    _pause("")

    assert _check(variant)["reason_code"] == "SERVICE_AREA_PAUSED"
