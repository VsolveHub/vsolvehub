"""Database rules on the rides tables: a bug in a service must not be able to write these rows."""

import uuid
from typing import Any

import pytest
from django.db import IntegrityError, transaction

from apps.locations.models import ServiceArea
from apps.rides.models import RideRateCard, VehicleType

pytestmark = pytest.mark.django_db


def make_area() -> ServiceArea:
    return ServiceArea.objects.create(
        slug=f"area-{uuid.uuid4().hex[:6]}", name="Madhapur", timezone="Asia/Kolkata"
    )


def make_card(area: ServiceArea, **overrides: Any) -> RideRateCard:
    fields: dict[str, Any] = {
        "service_area": area,
        "vehicle_type": VehicleType.BIKE,
        "base_fare_paise": 2000,
        "included_distance_m": 2000,
        "per_km_paise": 800,
        "per_minute_paise": 100,
        "minimum_fare_paise": 3000,
        "free_waiting_minutes": 3,
        "waiting_per_minute_paise": 100,
    }
    fields.update(overrides)
    return RideRateCard.objects.create(**fields)


def test_only_one_active_rate_card_per_area_and_vehicle_type() -> None:
    area = make_area()
    make_card(area)

    with pytest.raises(IntegrityError), transaction.atomic():
        make_card(area, version=2)


def test_new_version_allowed_once_the_old_card_is_inactive() -> None:
    area = make_area()
    old = make_card(area)
    old.is_active = False
    old.save()

    new = make_card(area, version=2)

    assert new.is_active
    assert RideRateCard.objects.filter(service_area=area, is_active=True).get() == new


def test_each_vehicle_type_has_its_own_active_card() -> None:
    area = make_area()
    for vehicle_type in VehicleType.values:
        make_card(area, vehicle_type=vehicle_type)

    assert RideRateCard.objects.filter(service_area=area, is_active=True).count() == 3


def test_version_cannot_repeat_for_the_same_area_and_vehicle_type() -> None:
    area = make_area()
    make_card(area, is_active=False)

    with pytest.raises(IntegrityError), transaction.atomic():
        make_card(area, is_active=False)


def test_version_starts_at_one() -> None:
    with pytest.raises(IntegrityError), transaction.atomic():
        make_card(make_area(), version=0)


@pytest.mark.parametrize(
    "field",
    [
        "base_fare_paise",
        "per_km_paise",
        "per_minute_paise",
        "minimum_fare_paise",
        "waiting_per_minute_paise",
    ],
)
def test_money_is_never_negative(field: str) -> None:
    with pytest.raises(IntegrityError), transaction.atomic():
        make_card(make_area(), **{field: -1})
