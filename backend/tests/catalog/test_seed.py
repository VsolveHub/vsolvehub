from io import StringIO

import pytest
from django.core.management import call_command

from apps.catalog.models import (
    A1VariantConfiguration,
    Category,
    Service,
    ServiceVariant,
    Subcategory,
)
from apps.locations.models import ServiceArea, ServiceAreaService
from apps.pricing.models import CancellationPolicy, PricingPolicy, ServiceRate, TaskRate

pytestmark = pytest.mark.django_db
TECHNICIAN_SERVICE_COUNT = 6
FAN_INSTALLATION_RATE_PAISE = 24_900
FAN_INSTALLATION_DURATION_MINUTES = 60
FAN_INSTALLATION_BASE_DURATION_MINUTES = 20
MINIMUM_SERVICE_SUBTOTAL_PAISE = 4_900
GST_RATE_BASIS_POINTS = 1_800
PLATFORM_FEE_PAISE = 2_900


def test_technician_seed_is_complete_and_idempotent() -> None:
    output = StringIO()

    call_command("seed_technician_catalog", stdout=output)
    call_command("seed_technician_catalog", stdout=output)

    assert Category.objects.filter(slug="technician", is_active=True).count() == 1
    assert Service.objects.filter(status=Service.Status.ACTIVE).count() == TECHNICIAN_SERVICE_COUNT
    assert ServiceVariant.objects.filter(is_active=True).count() == TECHNICIAN_SERVICE_COUNT
    assert ServiceRate.objects.filter(is_active=True).count() == TECHNICIAN_SERVICE_COUNT
    assert TaskRate.objects.filter(is_active=True).count() == TECHNICIAN_SERVICE_COUNT
    assert ServiceArea.objects.filter(slug="hyderabad-500032", is_active=True).count() == 1
    assert ServiceAreaService.objects.count() == TECHNICIAN_SERVICE_COUNT

    fan_rate = ServiceRate.objects.get(variant__service__slug="fan-installation")
    assert fan_rate.amount_paise == FAN_INSTALLATION_RATE_PAISE
    assert fan_rate.variant.minimum_duration_minutes == FAN_INSTALLATION_DURATION_MINUTES
    assert fan_rate.variant.recommended_duration_minutes == FAN_INSTALLATION_DURATION_MINUTES
    task_rate = TaskRate.objects.get(variant__service__slug="fan-installation")
    assert task_rate.unit_price_paise == FAN_INSTALLATION_RATE_PAISE
    assert task_rate.base_duration_minutes == FAN_INSTALLATION_BASE_DURATION_MINUTES
    assert task_rate.marginal_duration_minutes == FAN_INSTALLATION_DURATION_MINUTES
    policy = PricingPolicy.objects.get(code="m1-technician", version=1)
    assert policy.minimum_service_subtotal_paise == MINIMUM_SERVICE_SUBTOTAL_PAISE
    assert policy.gst_rate_basis_points == GST_RATE_BASIS_POINTS
    assert policy.platform_fee_value == PLATFORM_FEE_PAISE
    assert policy.commission_basis_points == GST_RATE_BASIS_POINTS
    cancellation_policy = CancellationPolicy.objects.get(
        code="m1-scheduled-today",
        version=1,
    )
    assert list(cancellation_policy.bands.values_list("fee_paise", flat=True)) == [
        0,
        4_900,
        9_900,
        14_900,
    ]
    assert (
        A1VariantConfiguration.objects.filter(
            status=A1VariantConfiguration.Status.ACTIVE,
        ).count()
        == TECHNICIAN_SERVICE_COUNT
    )


def test_seed_preserves_but_deactivates_out_of_scope_legacy_catalog() -> None:
    category = Category.objects.create(slug="legacy", name="Legacy")
    # A legacy service is deliberately retained for post-cutover recovery, but cannot be sold in M1.
    subcategory = Subcategory.objects.create(category=category, slug="legacy", name="Legacy")
    legacy = Service.objects.create(
        subcategory=subcategory,
        slug="ac-gas-filling",
        name="AC Gas Filling",
        short_description="Legacy service",
        status=Service.Status.ACTIVE,
    )
    ServiceVariant.objects.create(
        service=legacy,
        code="standard",
        name="Standard",
        pricing_strategy=ServiceVariant.PricingStrategy.FIXED,
        required_skill_code="legacy",
        tax_category_code="legacy",
    )

    call_command("seed_technician_catalog")

    legacy.refresh_from_db()
    assert legacy.status == Service.Status.PAUSED
    assert legacy.variants.get(code="standard").is_active is False
