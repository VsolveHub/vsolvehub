from dataclasses import dataclass

import pytest
from rest_framework.test import APIClient

from apps.catalog.models import Category, Service, ServiceVariant, Subcategory
from apps.identity.models import Role, User, UserRole
from apps.locations.models import ServiceArea, ServiceAreaService
from apps.partners.models import Skill


@dataclass(frozen=True, slots=True)
class PartnerSetup:
    user: User
    client: APIClient
    skill: Skill
    variant: ServiceVariant
    service_area: ServiceArea


@pytest.fixture
def partner_setup() -> PartnerSetup:
    user = User.objects.create_user(phone_number="+919876543210", full_name="Ravi Kumar")
    client = APIClient()
    client.force_authenticate(user=user)
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
    skill = Skill.objects.create(code="electrician", name="Electrician")
    service_area = ServiceArea.objects.create(
        slug="west-hyderabad",
        name="West Hyderabad",
    )
    ServiceAreaService.objects.create(service_area=service_area, variant=variant)
    return PartnerSetup(
        user=user,
        client=client,
        skill=skill,
        variant=variant,
        service_area=service_area,
    )


@pytest.fixture
def operations_user() -> User:
    user = User.objects.create_user(phone_number="+919900000001", full_name="Operations Reviewer")
    role = Role.objects.create(code="operations", name="Operations", is_system=True)
    UserRole.objects.create(user=user, role=role)
    return user


def application_payload(setup: PartnerSetup, *, expected_version: int | None = None) -> dict:
    payload: dict[str, object] = {
        "display_name": "Ravi K.",
        "biography": "Residential electrical specialist.",
        "experience_years": 6,
        "skill_codes": [setup.skill.code],
        "service_variant_ids": [str(setup.variant.id)],
        "service_area_ids": [str(setup.service_area.id)],
        "consents": [
            {"purpose": "partner_terms", "document_version": "2026-07"},
            {"purpose": "privacy_notice", "document_version": "2026-07"},
        ],
        "device_identifier": "partner-browser",
    }
    if expected_version is not None:
        payload["expected_version"] = expected_version
    return payload
