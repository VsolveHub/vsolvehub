"""Shared rental fixtures. A test module's own ``rental_world`` still wins."""

import pytest
from django.contrib.auth import get_user_model

from apps.catalog.models import (
    A7VariantConfiguration,
    Category,
    Service,
    ServiceVariant,
    Subcategory,
)
from apps.identity.models import Role, UserRole
from apps.partners.models import PartnerApplication, PartnerCapability, PartnerProfile
from tests.helpers import force_role_client

User = get_user_model()


@pytest.fixture
def rental_world(db):  # noqa: ARG001
    category = Category.objects.create(slug="rental-shared", name="Rental Shared")
    sub = Subcategory.objects.create(category=category, slug="tools-shared", name="Tools")
    service = Service.objects.create(
        subcategory=sub, slug="drill-shared", name="Drill", status=Service.Status.ACTIVE
    )
    variant = ServiceVariant.objects.create(
        service=service,
        code="drill-rental-shared",
        name="Drill rental",
        pricing_strategy=ServiceVariant.PricingStrategy.FIXED,
        booking_archetype=ServiceVariant.BookingArchetype.A7_RENTAL,
        required_skill_code="rental",
        tax_category_code="rental",
    )
    A7VariantConfiguration.objects.create(
        variant=variant,
        version=1,
        status=A7VariantConfiguration.Status.ACTIVE,
        default_deposit_paise=0,
    )
    owner = User.objects.create(phone_number="+919911120001", full_name="Owner")
    partner = PartnerProfile.objects.create(
        user=owner, display_name="Owner Co", default_location_text="Madhapur, Hyderabad"
    )
    PartnerApplication.objects.create(partner=partner, status=PartnerApplication.Status.APPROVED)
    PartnerCapability.objects.create(
        partner=partner,
        variant=variant,
        archetype=ServiceVariant.BookingArchetype.A7_RENTAL,
        status=PartnerCapability.Status.APPROVED,
    )
    customer = User.objects.create(phone_number="+919911120002", full_name="Customer")
    return {"variant": variant, "partner": partner, "owner": owner, "customer": customer}


def role_client(user, code):
    role, _ = Role.objects.get_or_create(code=code, defaults={"name": code.title()})
    UserRole.objects.get_or_create(user=user, role=role, revoked_at=None)
    return force_role_client(user=user, role_code=code)
