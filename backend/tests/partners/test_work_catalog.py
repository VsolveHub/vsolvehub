"""The one-read catalogue behind "Your work" (`GET /api/v1/partner/work-catalog/`).

The step used to walk the public catalog, one request per category and one per service. This
returns the same rows in one cacheable read, and leaves out the categories that are their own
way to join (stays, rentals, hiring, crew and project work).
"""

from http import HTTPStatus

import pytest
from rest_framework.test import APIClient

from apps.catalog.models import Category, Service, ServiceVariant, Subcategory
from apps.pricing.models import PricingPolicy, ServiceRate, TaskRate

pytestmark = pytest.mark.django_db

RATE_PAISE = 50_000
URL = "/api/v1/partner/work-catalog/"


@pytest.fixture(autouse=True)
def pricing_policy() -> None:
    PricingPolicy.objects.create(
        code="m1-technician",
        version=1,
        minimum_service_subtotal_paise=RATE_PAISE,
        gst_rate_basis_points=1_800,
        platform_fee_mode=PricingPolicy.PlatformFeeMode.FIXED,
        platform_fee_value=2_900,
        commission_basis_points=1_800,
        commission_floor_paise=0,
        commission_cap_paise=100_000,
    )


def _category(slug: str, name: str, *, display_order: int = 0, is_active: bool = True) -> Category:
    return Category.objects.create(
        slug=slug,
        name=name,
        icon_key="wrench",
        display_order=display_order,
        is_active=is_active,
    )


def _service(
    category: Category,
    *,
    slug: str,
    name: str,
    variants: list[tuple[str, str, str]],
    status: str = Service.Status.ACTIVE,
) -> Service:
    subcategory, _ = Subcategory.objects.get_or_create(
        category=category, slug=f"{category.slug}-sub", defaults={"name": category.name}
    )
    service = Service.objects.create(
        subcategory=subcategory, slug=slug, name=name, short_description=name, status=status
    )
    for order, (code, variant_name, skill) in enumerate(variants):
        variant = ServiceVariant.objects.create(
            service=service,
            code=code,
            name=variant_name,
            pricing_strategy=ServiceVariant.PricingStrategy.DURATION,
            booking_archetype=ServiceVariant.BookingArchetype.A1_TASK_VISIT,
            required_skill_code=skill,
            tax_category_code="technician-repair",
            display_order=order,
        )
        ServiceRate.objects.create(variant=variant, amount_paise=RATE_PAISE)
        TaskRate.objects.create(
            variant=variant,
            task_code=f"{slug}-{code}",
            unit_price_paise=RATE_PAISE,
            base_duration_minutes=10,
            marginal_duration_minutes=30,
        )
    return service


def test_lists_each_service_with_the_variants_under_it_in_one_public_read(
    django_assert_max_num_queries,
) -> None:
    technician = _category("technician", "Technician")
    _service(
        technician,
        slug="gas-stove-repair",
        name="Gas Stove Repair",
        variants=[
            ("2-burner", "2 burner", "gas-stove-technician"),
            ("3-burner", "3 burner", "gas-stove-technician"),
            ("4-burner", "4 burner and above", "gas-stove-technician"),
        ],
    )
    _service(
        technician,
        slug="door-repair",
        name="Door Repair",
        variants=[("standard", "Standard service", "carpenter")],
    )

    # An unauthenticated client: the catalogue is public data, like the catalog it reads.
    # A fixed handful of queries however many services there are (it was one per service).
    with django_assert_max_num_queries(8):
        response = APIClient().get(URL)

    assert response.status_code == HTTPStatus.OK
    assert response["Cache-Control"] == "public, max-age=300, stale-while-revalidate=600"
    [category] = response.json()
    assert category["slug"] == "technician"
    assert {service["name"] for service in category["services"]} == {
        "Gas Stove Repair",
        "Door Repair",
    }
    stove = next(s for s in category["services"] if s["slug"] == "gas-stove-repair")
    assert [variant["name"] for variant in stove["variants"]] == [
        "2 burner",
        "3 burner",
        "4 burner and above",
    ]
    assert {variant["required_skill_code"] for variant in stove["variants"]} == {
        "gas-stove-technician"
    }
    assert set(stove["variants"][0]) == {"id", "code", "name", "required_skill_code"}


def test_leaves_out_the_categories_that_are_their_own_way_to_join() -> None:
    for slug in (
        "career-jobs",
        "rental-services",
        "rooms-pg-hostel",
        "rooms-pg-hostel-hotels",
        "workforce-and-projects",
    ):
        _service(
            _category(slug, slug),
            slug=f"{slug}-service",
            name="Not a trade",
            variants=[("standard", "Standard", "")],
        )
    _service(
        _category("plumber", "Plumber"),
        slug="tap-repair",
        name="Tap Repair",
        variants=[("standard", "Standard service", "plumber")],
    )

    response = APIClient().get(URL)

    assert [category["slug"] for category in response.json()] == ["plumber"]


def test_keeps_a_trade_with_nothing_open_and_hides_paused_and_inactive_work() -> None:
    _category("events", "Events", display_order=2)
    plumber = _category("plumber", "Plumber", display_order=1)
    _service(
        plumber,
        slug="tap-repair",
        name="Tap Repair",
        variants=[("standard", "Standard service", "plumber")],
    )
    _service(
        plumber,
        slug="paused-service",
        name="Paused",
        variants=[("standard", "Standard service", "plumber")],
        status=Service.Status.PAUSED,
    )
    _service(
        _category("hidden", "Hidden", is_active=False),
        slug="hidden-service",
        name="Hidden",
        variants=[("standard", "Standard service", "")],
    )

    payload = APIClient().get(URL).json()

    # In display order, with the empty trade still listed so the step can say nothing is open.
    assert [category["slug"] for category in payload] == ["plumber", "events"]
    assert [service["slug"] for service in payload[0]["services"]] == ["tap-repair"]
    assert payload[1]["services"] == []


def test_a_service_with_no_active_variant_is_not_offered() -> None:
    plumber = _category("plumber", "Plumber")
    _service(
        plumber,
        slug="tap-repair",
        name="Tap Repair",
        variants=[("standard", "Standard service", "plumber")],
    )
    old = _service(
        plumber,
        slug="old-service",
        name="Old",
        variants=[("standard", "Standard service", "plumber")],
    )
    ServiceVariant.objects.filter(service=old).update(is_active=False)

    [category] = APIClient().get(URL).json()

    assert [service["slug"] for service in category["services"]] == ["tap-repair"]
