"""The visit grouping the Customer picks slots against.

These tests pin the property the whole per-visit slot flow rests on: the grouping
is a function of the catalog's compatibility rules and nothing else. If it ever
starts depending on Partner availability again, the number of slot pickers on the
checkout screen becomes a thing that changes while the Customer is looking at it.
"""

import uuid
from datetime import time, timedelta
from http import HTTPStatus
from zoneinfo import ZoneInfo

import pytest
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from apps.carts.models import Cart, ServiceCompatibilityRule
from apps.carts.planning import scheduling_group_key, scheduling_groups
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

TWO_GROUPS = 2


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
    assert cart.status_code == HTTPStatus.OK
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


def _area() -> ServiceArea:
    return ServiceArea.objects.get(slug="hyderabad-500032")


def _partner(*, suffix: str, variant_slugs: tuple[str, ...], weekday: int) -> PartnerProfile:
    area = _area()
    user = User.objects.create_user(phone_number=f"+91987654{int(suffix):04d}")
    partner = PartnerProfile.objects.create(user=user, display_name=f"Partner {suffix}")
    PartnerApplication.objects.create(partner=partner, status=PartnerApplication.Status.APPROVED)
    for variant in ServiceVariant.objects.filter(service__slug__in=variant_slugs):
        PartnerService.objects.create(partner=partner, variant=variant)
    PartnerServiceArea.objects.create(partner=partner, service_area=area)
    PartnerAvailabilityRule.objects.create(
        partner=partner,
        service_area=area,
        weekday=weekday,
        starts_at=time(8),
        ends_at=time(20),
    )
    return partner


def test_same_partner_sequential_services_share_one_visit() -> None:
    client, customer, _address_id, version = _customer_context()
    first = _add_item(client, slug="switch-socket-repair", cart_version=version)
    _add_item(client, slug="fan-installation", cart_version=int(first["version"]))

    groups = scheduling_groups(cart=Cart.objects.get(customer=customer), area=_area())

    assert len(groups) == 1
    assert len(groups[0].cart_item_ids) == TWO_GROUPS
    assert groups[0].estimated_duration_minutes > 0
    assert groups[0].label


def test_services_without_a_sequential_rule_get_their_own_visit() -> None:
    """switch-socket-repair and tap-repair are PARALLEL_ALLOWED — two Partners, two visits."""
    client, customer, _address_id, version = _customer_context()
    first = _add_item(client, slug="switch-socket-repair", cart_version=version)
    _add_item(client, slug="tap-repair", cart_version=int(first["version"]))

    groups = scheduling_groups(cart=Cart.objects.get(customer=customer), area=_area())

    assert len(groups) == TWO_GROUPS
    assert all(len(group.cart_item_ids) == 1 for group in groups)


def test_grouping_ignores_partner_availability() -> None:
    """The load-bearing property.

    A Partner who is unavailable on the probed weekday must not split one visit
    into two. The planner still resolves staffing at the chosen start; the slot
    picker must not flicker because of it.
    """
    client, customer, _address_id, version = _customer_context()
    first = _add_item(client, slug="switch-socket-repair", cart_version=version)
    _add_item(client, slug="fan-installation", cart_version=int(first["version"]))
    cart = Cart.objects.get(customer=customer)

    with_no_partners = scheduling_groups(cart=cart, area=_area())

    tomorrow = (timezone.now().astimezone(ZoneInfo("Asia/Kolkata")) + timedelta(days=1)).weekday()
    _partner(
        suffix="11",
        variant_slugs=("switch-socket-repair", "fan-installation"),
        weekday=tomorrow,
    )
    with_a_partner = scheduling_groups(cart=cart, area=_area())

    assert [group.key for group in with_no_partners] == [group.key for group in with_a_partner]
    assert len(with_no_partners) == 1


def test_group_key_is_stable_across_probe_times() -> None:
    client, customer, _address_id, version = _customer_context()
    first = _add_item(client, slug="switch-socket-repair", cart_version=version)
    _add_item(client, slug="tap-repair", cart_version=int(first["version"]))
    cart = Cart.objects.get(customer=customer)
    now = timezone.now()

    early = scheduling_groups(cart=cart, area=_area(), at=now)
    late = scheduling_groups(cart=cart, area=_area(), at=now + timedelta(hours=18))

    assert [group.key for group in early] == [group.key for group in late]


def test_a_retired_rule_splits_the_visit() -> None:
    """Compatibility is effective-dated, so `at` genuinely changes the answer."""
    client, customer, _address_id, version = _customer_context()
    first = _add_item(client, slug="switch-socket-repair", cart_version=version)
    _add_item(client, slug="fan-installation", cart_version=int(first["version"]))
    cart = Cart.objects.get(customer=customer)
    assert len(scheduling_groups(cart=cart, area=_area())) == 1

    switch = ServiceVariant.objects.get(service__slug="switch-socket-repair")
    fan = ServiceVariant.objects.get(service__slug="fan-installation")
    rule = ServiceCompatibilityRule.objects.get(
        left_variant_id__in=(switch.id, fan.id),
        right_variant_id__in=(switch.id, fan.id),
    )
    rule.effective_to = timezone.now() - timedelta(minutes=1)
    rule.save(update_fields=("effective_to",))

    assert len(scheduling_groups(cart=cart, area=_area())) == TWO_GROUPS


def test_group_key_ignores_membership_order() -> None:
    left, right = uuid.uuid4(), uuid.uuid4()

    assert scheduling_group_key([left, right]) == scheduling_group_key([right, left])


def test_group_keys_differ_by_membership() -> None:
    left, right = uuid.uuid4(), uuid.uuid4()

    assert scheduling_group_key([left]) != scheduling_group_key([left, right])
