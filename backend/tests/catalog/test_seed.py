from io import StringIO

import pytest
from django.core.management import call_command

from apps.catalog.models import Category, Service, ServiceVariant
from apps.locations.models import ServiceArea, ServiceAreaService
from apps.pricing.models import ServiceRate

pytestmark = pytest.mark.django_db
TECHNICIAN_SERVICE_COUNT = 19
AC_GAS_FILLING_RATE_PAISE = 299_900
DEFAULT_DURATION_MINUTES = 60
AC_GAS_DURATION_MINUTES = 90


def test_technician_seed_is_complete_and_idempotent() -> None:
    output = StringIO()

    call_command("seed_technician_catalog", with_development_area=True, stdout=output)
    call_command("seed_technician_catalog", with_development_area=True, stdout=output)

    assert Category.objects.filter(slug="technician", is_active=True).count() == 1
    assert Service.objects.filter(status=Service.Status.ACTIVE).count() == TECHNICIAN_SERVICE_COUNT
    assert ServiceVariant.objects.filter(is_active=True).count() == TECHNICIAN_SERVICE_COUNT
    assert ServiceRate.objects.filter(is_active=True).count() == TECHNICIAN_SERVICE_COUNT
    assert ServiceArea.objects.filter(slug="west-hyderabad-development").count() == 1
    assert ServiceAreaService.objects.count() == TECHNICIAN_SERVICE_COUNT

    gas_rate = ServiceRate.objects.get(variant__service__slug="ac-gas-filling")
    assert gas_rate.amount_paise == AC_GAS_FILLING_RATE_PAISE
    assert gas_rate.variant.minimum_duration_minutes == DEFAULT_DURATION_MINUTES
    assert gas_rate.variant.recommended_duration_minutes == AC_GAS_DURATION_MINUTES
