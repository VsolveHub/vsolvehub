from datetime import timedelta
from http import HTTPStatus

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.catalog.models import (
    Category,
    Service,
    ServicePolicy,
    ServiceQuestion,
    ServiceQuestionOption,
    ServiceVariant,
    Subcategory,
)
from apps.pricing.models import PricingPolicy, ServiceRate, TaskRate

pytestmark = pytest.mark.django_db
CURRENT_RATE_PAISE = 19_900


def _service(*, slug: str = "switch-socket-repair") -> tuple[Service, ServiceVariant]:
    category = Category.objects.create(
        slug="technician",
        name="Technician",
        icon_key="wrench",
    )
    subcategory = Subcategory.objects.create(
        category=category,
        slug="electrician",
        name="Electrician",
    )
    service = Service.objects.create(
        subcategory=subcategory,
        slug=slug,
        name="Switch / Socket Repair",
        short_description="Repair a faulty switch or socket.",
        description="A verified electrician repairs the selected electrical point.",
        status=Service.Status.ACTIVE,
    )
    variant = ServiceVariant.objects.create(
        service=service,
        code="standard",
        name="Standard repair",
        pricing_strategy=ServiceVariant.PricingStrategy.DURATION,
        booking_archetype=ServiceVariant.BookingArchetype.A1_TASK_VISIT,
        required_skill_code="electrician",
        tax_category_code="technician-repair",
    )
    TaskRate.objects.create(
        variant=variant,
        task_code=slug,
        unit_price_paise=CURRENT_RATE_PAISE,
        base_duration_minutes=10,
        marginal_duration_minutes=30,
    )
    PricingPolicy.objects.create(
        code="m1-technician",
        version=1,
        minimum_service_subtotal_paise=CURRENT_RATE_PAISE,
        gst_rate_basis_points=1_800,
        platform_fee_mode=PricingPolicy.PlatformFeeMode.FIXED,
        platform_fee_value=2_900,
        commission_basis_points=1_800,
        commission_floor_paise=0,
        commission_cap_paise=100_000,
    )
    return service, variant


def test_public_catalog_uses_current_effective_rate() -> None:
    service, variant = _service()
    now = timezone.now()
    ServiceRate.objects.create(
        variant=variant,
        amount_paise=CURRENT_RATE_PAISE,
        effective_from=now - timedelta(days=1),
    )
    ServiceRate.objects.create(
        variant=variant,
        amount_paise=29_900,
        effective_from=now + timedelta(days=1),
    )

    categories = APIClient().get("/api/v1/categories/")
    services = APIClient().get("/api/v1/categories/technician/services/")
    detail = APIClient().get(f"/api/v1/services/{service.slug}/")

    assert categories.status_code == HTTPStatus.OK
    assert categories.json()[0]["slug"] == "technician"
    assert categories.json()[0]["subcategories"][0]["slug"] == "electrician"
    assert services.status_code == HTTPStatus.OK
    assert services.json()[0]["starting_price"] == {
        "amount_paise": CURRENT_RATE_PAISE,
        "currency": "INR",
    }
    assert detail.status_code == HTTPStatus.OK
    variant_payload = detail.json()["variants"][0]
    assert variant_payload["starting_price"]["amount_paise"] == CURRENT_RATE_PAISE
    assert variant_payload["fulfilment_archetype"] == "A1_TASK_VISIT"
    assert variant_payload["minimum_service_subtotal"]["amount_paise"] == CURRENT_RATE_PAISE
    assert variant_payload["task_lines"] == [
        {
            "code": "switch-socket-repair",
            "label": "Switch / Socket Repair",
            "unit_price": {"amount_paise": CURRENT_RATE_PAISE, "currency": "INR"},
            "marginal_duration_minutes": 30,
        }
    ]
    assert "pricing_strategy" not in variant_payload
    assert "recommended_duration_minutes" not in variant_payload


def test_configuration_contains_questions_options_and_policies() -> None:
    service, variant = _service()
    ServiceRate.objects.create(variant=variant, amount_paise=19_900)
    question = ServiceQuestion.objects.create(
        variant=variant,
        code="work-type",
        prompt="What do you need?",
        kind=ServiceQuestion.Kind.SINGLE_CHOICE,
        is_required=True,
    )
    ServiceQuestionOption.objects.create(
        question=question,
        code="repair",
        label="Repair a switch or socket",
    )
    ServicePolicy.objects.create(
        service=service,
        kind=ServicePolicy.Kind.INCLUDED,
        text="Verified electrician",
    )

    response = APIClient().get(f"/api/v1/services/{service.slug}/configuration/")

    assert response.status_code == HTTPStatus.OK
    payload = response.json()
    assert payload["variants"][0]["questions"][0]["code"] == "work-type"
    assert payload["variants"][0]["questions"][0]["options"][0]["code"] == "repair"
    assert payload["policies"][0]["text"] == "Verified electrician"


def test_service_without_current_rate_is_not_bookable_or_listed() -> None:
    service, variant = _service()
    ServiceRate.objects.create(
        variant=variant,
        amount_paise=19_900,
        effective_from=timezone.now() + timedelta(days=1),
    )

    listing = APIClient().get("/api/v1/categories/technician/services/")
    detail = APIClient().get(f"/api/v1/services/{service.slug}/")

    assert listing.status_code == HTTPStatus.OK
    assert listing.json() == []
    assert detail.status_code == HTTPStatus.NOT_FOUND


def test_inactive_catalog_records_are_not_exposed() -> None:
    service, variant = _service()
    ServiceRate.objects.create(variant=variant, amount_paise=19_900)
    service.status = Service.Status.PAUSED
    service.save(update_fields=("status",))

    response = APIClient().get("/api/v1/categories/technician/services/")

    assert response.status_code == HTTPStatus.OK
    assert response.json() == []
