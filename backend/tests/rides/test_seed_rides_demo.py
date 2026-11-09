"""`seed_rides_demo`: development only, placeholder cards, never overwrites a live price."""

import uuid

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from pytest_django.fixtures import SettingsWrapper

from apps.locations.models import ServiceArea
from apps.rides.management.commands.seed_rides_demo import AREA_SLUG
from apps.rides.models import RideRateCard, VehicleType

pytestmark = pytest.mark.django_db


@pytest.fixture
def area() -> ServiceArea:
    return ServiceArea.objects.get_or_create(
        slug=AREA_SLUG, defaults={"name": "Gachibowli", "timezone": "Asia/Kolkata"}
    )[0]


def seed() -> None:
    call_command("seed_rides_demo", "--i-understand-this-is-dev-only")


@pytest.mark.usefixtures("area")
def test_refused_without_debug(settings: SettingsWrapper) -> None:
    settings.DEBUG = False
    with pytest.raises(CommandError, match="DEBUG"):
        seed()


@pytest.mark.usefixtures("area")
def test_refused_without_the_flag(settings: SettingsWrapper) -> None:
    settings.DEBUG = True
    with pytest.raises(CommandError, match="i-understand"):
        call_command("seed_rides_demo")


def test_refused_when_the_area_is_missing(settings: SettingsWrapper) -> None:
    settings.DEBUG = True
    ServiceArea.objects.filter(slug=AREA_SLUG).delete()
    with pytest.raises(CommandError, match=AREA_SLUG):
        seed()


def test_creates_one_active_card_per_vehicle(settings: SettingsWrapper, area: ServiceArea) -> None:
    settings.DEBUG = True
    seed()
    active = RideRateCard.objects.filter(service_area=area, is_active=True)
    assert sorted(active.values_list("vehicle_type", flat=True)) == ["AUTO", "BIKE", "CAB"]


def test_running_twice_changes_nothing(settings: SettingsWrapper, area: ServiceArea) -> None:
    settings.DEBUG = True
    seed()
    seed()
    assert RideRateCard.objects.filter(service_area=area).count() == 3


def test_a_live_price_is_never_overwritten(settings: SettingsWrapper, area: ServiceArea) -> None:
    settings.DEBUG = True
    RideRateCard.objects.create(
        service_area=area,
        vehicle_type=VehicleType.BIKE,
        base_fare_paise=4200,
        included_distance_m=0,
        per_km_paise=0,
        per_minute_paise=0,
        minimum_fare_paise=0,
        free_waiting_minutes=0,
        waiting_per_minute_paise=0,
    )
    seed()
    bike = RideRateCard.objects.get(service_area=area, vehicle_type=VehicleType.BIKE)
    assert bike.base_fare_paise == 4200


def test_a_retired_card_gets_the_next_version(settings: SettingsWrapper, area: ServiceArea) -> None:
    settings.DEBUG = True
    RideRateCard.objects.create(
        service_area=area,
        vehicle_type=VehicleType.CAB,
        base_fare_paise=1,
        included_distance_m=0,
        per_km_paise=0,
        per_minute_paise=0,
        minimum_fare_paise=0,
        free_waiting_minutes=0,
        waiting_per_minute_paise=0,
        is_active=False,
        version=4,
    )
    seed()
    assert RideRateCard.objects.get(vehicle_type=VehicleType.CAB, is_active=True).version == 5


@pytest.mark.usefixtures("area")
def test_other_areas_are_untouched(settings: SettingsWrapper) -> None:
    settings.DEBUG = True
    other = ServiceArea.objects.create(
        slug=f"other-{uuid.uuid4().hex[:6]}", name="Other", timezone="Asia/Kolkata"
    )
    seed()
    assert not RideRateCard.objects.filter(service_area=other).exists()
