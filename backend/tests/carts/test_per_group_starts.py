"""One start time per visit, not one per cart.

The behaviour these pin is the reason the contract broke: with a single
`preferred_start` the planner derived every unit by cascading one clock forward,
so "electrician on Monday, salon on Friday" could not be expressed at all.
"""

from datetime import datetime, time, timedelta
from http import HTTPStatus
from typing import cast
from zoneinfo import ZoneInfo

import pytest
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from apps.catalog.models import ServiceVariant
from apps.identity.models import User
from apps.locations.models import ServiceArea
from apps.partners.models import (
    PartnerApplication,
    PartnerAvailabilityRule,
    PartnerProfile,
    PartnerService,
    PartnerServiceArea,
)

pytestmark = pytest.mark.django_db

TWO_VISITS = 2
ZONE = ZoneInfo("Asia/Kolkata")


def _day_at(*, days_ahead: int, hour: int) -> datetime:
    local_date = timezone.now().astimezone(ZONE).date() + timedelta(days=days_ahead)
    return datetime.combine(local_date, time(hour), tzinfo=ZONE)


def _address_payload() -> dict[str, object]:
    return {
        "label": "Home",
        "line1": "1 Vsolve Street",
        "line2": "",
        "landmark": "Near the park",
        "locality": "Khajaguda",
        "city": "Hyderabad",
        "state": "Telangana",
        "postal_code": "500032",
        "country_code": "IN",
        "latitude": "17.414053",
        "longitude": "78.353554",
        "source": "MANUAL",
        "is_default": True,
    }


def _customer_context() -> tuple[APIClient, User, str, int]:
    call_command("seed_technician_catalog")
    customer = User.objects.create_user(phone_number="+919876543210")
    client = APIClient()
    client.force_authenticate(customer)
    cart = client.get("/api/v1/cart/")
    address = client.post("/api/v1/addresses/", _address_payload(), format="json")
    assert address.status_code == HTTPStatus.CREATED
    return client, customer, address.json()["id"], cart.json()["version"]


def _add_item(client: APIClient, *, slug: str, cart_version: int) -> dict[str, object]:
    variant = ServiceVariant.objects.get(service__slug=slug)
    response = client.post(
        "/api/v1/cart/items/",
        {
            "expected_cart_version": cart_version,
            "variant_id": str(variant.id),
            "quantity": 1,
            "scope": {"quantity": 1},
        },
        format="json",
    )
    assert response.status_code == HTTPStatus.CREATED, response.json()
    return response.json()


def _partner(*, suffix: str, variant_slugs: tuple[str, ...], weekdays: tuple[int, ...]) -> None:
    area = ServiceArea.objects.get(slug="hyderabad-500032")
    user = User.objects.create_user(phone_number=f"+91987654{int(suffix):04d}")
    partner = PartnerProfile.objects.create(user=user, display_name=f"Partner {suffix}")
    PartnerApplication.objects.create(partner=partner, status=PartnerApplication.Status.APPROVED)
    for variant in ServiceVariant.objects.filter(service__slug__in=variant_slugs):
        PartnerService.objects.create(partner=partner, variant=variant)
    PartnerServiceArea.objects.create(partner=partner, service_area=area)
    for weekday in weekdays:
        PartnerAvailabilityRule.objects.create(
            partner=partner,
            service_area=area,
            weekday=weekday,
            starts_at=time(8),
            ends_at=time(20),
        )


def _groups(client: APIClient, *, address_id: str, cart_version: int) -> list[dict[str, object]]:
    response = client.post(
        "/api/v1/cart/scheduling-groups/",
        {"address_id": address_id, "expected_cart_version": cart_version},
        format="json",
    )
    assert response.status_code == HTTPStatus.OK, response.json()
    return cast(list[dict[str, object]], response.json()["groups"])


def _plan(
    client: APIClient,
    *,
    address_id: str,
    cart_version: int,
    starts: list[dict[str, object]],
    key: str = "per-group",
) -> object:
    return client.post(
        "/api/v1/fulfilment-plan-sets/",
        {
            "address_id": address_id,
            "expected_cart_version": cart_version,
            "preferred_starts": starts,
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY=key,
    )


def test_two_visits_keep_the_two_times_the_customer_chose() -> None:
    """The headline behaviour: days apart, not cascaded off one clock."""
    client, _customer, address_id, version = _customer_context()
    first = _add_item(client, slug="switch-socket-repair", cart_version=version)
    second = _add_item(client, slug="tap-repair", cart_version=int(first["version"]))
    cart_version = int(second["version"])
    monday = _day_at(days_ahead=1, hour=10)
    friday = _day_at(days_ahead=4, hour=15)
    _partner(
        suffix="11",
        variant_slugs=("switch-socket-repair",),
        weekdays=(monday.weekday(), friday.weekday()),
    )
    _partner(
        suffix="12",
        variant_slugs=("tap-repair",),
        weekdays=(monday.weekday(), friday.weekday()),
    )

    groups = _groups(client, address_id=address_id, cart_version=cart_version)
    assert len(groups) == TWO_VISITS
    chosen = {
        str(groups[0]["key"]): monday,
        str(groups[1]["key"]): friday,
    }

    response = _plan(
        client,
        address_id=address_id,
        cart_version=cart_version,
        starts=[
            {"group_key": key, "starts_at": value.isoformat()} for key, value in chosen.items()
        ],
    )

    assert response.status_code == HTTPStatus.CREATED, response.json()
    plan = response.json()["plans"][0]
    assert {unit["starts_at"] for unit in plan["units"]} == {
        monday.isoformat(),
        friday.isoformat(),
    }


def test_a_missing_group_is_refused_rather_than_defaulted() -> None:
    client, _customer, address_id, version = _customer_context()
    first = _add_item(client, slug="switch-socket-repair", cart_version=version)
    second = _add_item(client, slug="tap-repair", cart_version=int(first["version"]))
    cart_version = int(second["version"])
    groups = _groups(client, address_id=address_id, cart_version=cart_version)

    response = _plan(
        client,
        address_id=address_id,
        cart_version=cart_version,
        starts=[
            {"group_key": groups[0]["key"], "starts_at": _day_at(days_ahead=1, hour=10).isoformat()}
        ],
    )

    assert response.status_code == HTTPStatus.CONFLICT
    assert response.json()["error"]["code"] == "scheduling_groups_changed"


def test_an_unknown_group_key_is_refused() -> None:
    client, _customer, address_id, version = _customer_context()
    item = _add_item(client, slug="switch-socket-repair", cart_version=version)

    response = _plan(
        client,
        address_id=address_id,
        cart_version=int(item["version"]),
        starts=[
            {
                "group_key": "0" * 32,
                "starts_at": _day_at(days_ahead=1, hour=10).isoformat(),
            }
        ],
    )

    assert response.status_code == HTTPStatus.CONFLICT
    assert response.json()["error"]["code"] == "scheduling_groups_changed"


def test_one_visit_may_not_be_given_two_times() -> None:
    client, _customer, address_id, version = _customer_context()
    item = _add_item(client, slug="switch-socket-repair", cart_version=version)
    groups = _groups(client, address_id=address_id, cart_version=int(item["version"]))

    response = _plan(
        client,
        address_id=address_id,
        cart_version=int(item["version"]),
        starts=[
            {
                "group_key": groups[0]["key"],
                "starts_at": _day_at(days_ahead=1, hour=10).isoformat(),
            },
            {
                "group_key": groups[0]["key"],
                "starts_at": _day_at(days_ahead=2, hour=10).isoformat(),
            },
        ],
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST


def test_no_starts_at_all_is_refused() -> None:
    client, _customer, address_id, version = _customer_context()
    item = _add_item(client, slug="switch-socket-repair", cart_version=version)

    response = _plan(
        client,
        address_id=address_id,
        cart_version=int(item["version"]),
        starts=[],
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST


def test_editing_the_cart_invalidates_the_chosen_times() -> None:
    """Group keys are membership-derived, so a new item makes them unrecognisable."""
    client, _customer, address_id, version = _customer_context()
    first = _add_item(client, slug="switch-socket-repair", cart_version=version)
    groups = _groups(client, address_id=address_id, cart_version=int(first["version"]))
    second = _add_item(client, slug="fan-installation", cart_version=int(first["version"]))

    response = _plan(
        client,
        address_id=address_id,
        cart_version=int(second["version"]),
        starts=[
            {"group_key": groups[0]["key"], "starts_at": _day_at(days_ahead=1, hour=10).isoformat()}
        ],
    )

    assert response.status_code == HTTPStatus.CONFLICT
    assert response.json()["error"]["code"] == "scheduling_groups_changed"


def test_one_visit_of_two_services_takes_a_single_time() -> None:
    client, _customer, address_id, version = _customer_context()
    first = _add_item(client, slug="switch-socket-repair", cart_version=version)
    second = _add_item(client, slug="fan-installation", cart_version=int(first["version"]))
    cart_version = int(second["version"])
    monday = _day_at(days_ahead=1, hour=10)
    _partner(
        suffix="11",
        variant_slugs=("switch-socket-repair", "fan-installation"),
        weekdays=(monday.weekday(),),
    )

    groups = _groups(client, address_id=address_id, cart_version=cart_version)
    assert len(groups) == 1

    response = _plan(
        client,
        address_id=address_id,
        cart_version=cart_version,
        starts=[{"group_key": groups[0]["key"], "starts_at": monday.isoformat()}],
    )

    assert response.status_code == HTTPStatus.CREATED, response.json()
    recommended = response.json()["plans"][0]
    assert recommended["visit_count"] == 1
    assert recommended["units"][0]["starts_at"] == monday.isoformat()
