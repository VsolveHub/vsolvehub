"""Shared fixtures for the quick job post and job seeker tests."""

import uuid
from typing import Any

import pytest
from django.contrib.auth import get_user_model

from apps.catalog.models import (
    A10VariantConfiguration,
    Category,
    Service,
    ServiceVariant,
    Subcategory,
)
from apps.listings.jobs import JOBS_VARIANT_CODE
from apps.partners.models import PartnerApplication, PartnerProfile

User = get_user_model()


@pytest.fixture
def jobs_variant(db):  # noqa: ARG001
    category, _ = Category.objects.get_or_create(
        slug="career-jobs", defaults={"name": "Career Opportunity or Job Opportunities"}
    )
    sub = Subcategory.objects.create(
        category=category, slug=f"hiring-{uuid.uuid4().hex[:6]}", name="Hiring partners"
    )
    service = Service.objects.create(
        subcategory=sub,
        slug=f"hiring-{uuid.uuid4().hex[:6]}",
        name="Job listings",
        status=Service.Status.ACTIVE,
    )
    variant = ServiceVariant.objects.create(
        service=service,
        code=JOBS_VARIANT_CODE,
        name="Job listing",
        pricing_strategy=ServiceVariant.PricingStrategy.FIXED,
        booking_archetype=ServiceVariant.BookingArchetype.A10_LISTING,
        required_skill_code="career-jobs",
        tax_category_code="listing",
    )
    A10VariantConfiguration.objects.create(
        variant=variant, version=1, status=A10VariantConfiguration.Status.ACTIVE
    )
    return variant


@pytest.fixture
def employer(jobs_variant):  # noqa: ARG001
    manager: Any = User.objects
    user = manager.create_user(phone_number=f"+9198{uuid.uuid4().int % 10**8:08d}")
    profile = PartnerProfile.objects.create(user=user, display_name="Sri Lakshmi Jewellers")
    PartnerApplication.objects.create(
        partner=profile,
        status=PartnerApplication.Status.APPROVED,
        track=PartnerApplication.Track.EMPLOYER,
    )
    return profile
