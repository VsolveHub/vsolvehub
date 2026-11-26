"""The tax categories the commercial policy form asks Operations to price.

Only services a customer can book count: a draft, paused or retired service, or one under a
hidden subcategory or category, is priced by no policy and must not demand a rate.
"""

from http import HTTPStatus
from typing import Any

import pytest

from apps.catalog.models import Category, Service, ServiceVariant, Subcategory
from tests.requirements.conftest import M2World

pytestmark = pytest.mark.django_db

URL = "/api/v1/operations/commercial-policies/tax-categories/"


def _service(
    slug: str,
    *,
    name: str | None = None,
    tax: str,
    status: str = Service.Status.ACTIVE,
    subcategory_active: bool = True,
    category_active: bool = True,
    archetype: str = ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT,
) -> Service:
    category = Category.objects.create(
        slug=f"cat-{slug}", name=f"Cat {slug}", is_active=category_active
    )
    subcategory = Subcategory.objects.create(
        category=category, slug=f"sub-{slug}", name=f"Sub {slug}", is_active=subcategory_active
    )
    service = Service.objects.create(
        subcategory=subcategory,
        slug=f"svc-{slug}",
        name=name or f"Service {slug}",
        short_description="Test service.",
        status=status,
    )
    ServiceVariant.objects.create(
        service=service,
        code=slug,
        name=f"Variant {slug}",
        pricing_strategy=ServiceVariant.PricingStrategy.DURATION,
        booking_archetype=archetype,
        required_skill_code="helper",
        tax_category_code=tax,
    )
    return service


def _rows(world: M2World) -> dict[str, dict[str, Any]]:
    response = world.operations_client.get(URL)
    assert response.status_code == HTTPStatus.OK
    return {row["code"]: row for row in response.json()}


def test_services_no_customer_can_book_do_not_ask_for_a_rate(world: M2World) -> None:
    _service("old-works", tax="old-works", status=Service.Status.RETIRED)
    _service("draft-works", tax="draft-works", status=Service.Status.DRAFT)
    _service("paused-works", tax="paused-works", status=Service.Status.PAUSED)
    _service("hidden-sub", tax="hidden-sub", subcategory_active=False)
    _service("hidden-cat", tax="hidden-cat", category_active=False)

    rows = _rows(world)

    assert not {"old-works", "draft-works", "paused-works", "hidden-sub", "hidden-cat"} & set(rows)
    # The world's two bookable services (an A3 and an A5) both use `labour`.
    assert rows["labour"]["crew_and_project_service_count"] == 2


def test_two_services_with_one_name_count_as_two(world: M2World) -> None:
    _service("tiling-a", name="Tiling", tax="tiles")
    _service("tiling-b", name="Tiling", tax="tiles")

    row = _rows(world)["tiles"]

    assert row["service_count"] == 2
    assert row["crew_and_project_service_count"] == 2
    assert row["example_services"] == ["Tiling"]
