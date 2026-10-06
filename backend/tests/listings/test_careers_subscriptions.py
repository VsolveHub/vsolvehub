"""Tests for Careers subscription tier updates, search ranking, and candidate contact locking."""

from datetime import timedelta
import uuid

import pytest
from django.utils import timezone
from rest_framework import status

from apps.catalog.models import (
    A10VariantConfiguration,
    Category,
    Service,
    ServiceVariant,
    Subcategory,
)
from apps.identity.models import Role, User, UserRole
from apps.listings.models import (
    Listing,
    VendorSubscription,
    VendorSubscriptionPlan,
)
from apps.listings.selectors import public_listings
from apps.listings.seekers import save_profile
from apps.listings.services import (
    create_listing,
    moderate_listing,
    publish_listing,
    submit_listing,
)
from apps.partners.models import PartnerApplication, PartnerCapability, PartnerProfile
from tests.helpers import force_role_client

pytestmark = pytest.mark.django_db


@pytest.fixture
def careers_setup():
    cat = Category.objects.create(slug=f"career-cat-{uuid.uuid4().hex[:6]}", name="Careers")
    sub = Subcategory.objects.create(category=cat, slug=f"it-{uuid.uuid4().hex[:6]}", name="IT")
    svc = Service.objects.create(
        subcategory=sub,
        slug=f"job-svc-{uuid.uuid4().hex[:6]}",
        name="Job Posting",
        status=Service.Status.ACTIVE,
    )
    variant = ServiceVariant.objects.create(
        service=svc,
        code=f"job-post-{uuid.uuid4().hex[:6]}",
        name="Job Post Variant",
        pricing_strategy=ServiceVariant.PricingStrategy.FIXED,
        booking_archetype=ServiceVariant.BookingArchetype.A10_LISTING,
        required_skill_code="listing",
        tax_category_code="listing",
    )
    A10VariantConfiguration.objects.create(
        variant=variant,
        version=1,
        status=A10VariantConfiguration.Status.ACTIVE,
        application_cooldown_hours=24,
    )

    employer_user = User.objects.create_user(phone_number=f"+9198{uuid.uuid4().int % 10**8:08d}")
    employer = PartnerProfile.objects.create(
        user=employer_user, display_name="TechCorp", default_location_text="Hitec City"
    )
    PartnerApplication.objects.create(partner=employer, status=PartnerApplication.Status.APPROVED)
    PartnerCapability.objects.create(
        partner=employer,
        variant=variant,
        archetype=ServiceVariant.BookingArchetype.A10_LISTING,
        status=PartnerCapability.Status.APPROVED,
    )

    ops_user = User.objects.create_user(
        phone_number=f"+9196{uuid.uuid4().int % 10**8:08d}", is_staff=True
    )

    return {
        "variant": variant,
        "employer": employer,
        "employer_user": employer_user,
        "ops_user": ops_user,
    }


def _auth_client(user: User, role_code: str):
    role, _ = Role.objects.get_or_create(code=role_code, defaults={"name": role_code.title()})
    UserRole.objects.get_or_create(user=user, role=role, revoked_at=None)
    return force_role_client(user=user, role_code=role_code)


def test_free_tier_unlimited_job_posts(careers_setup):
    employer = careers_setup["employer"]
    variant = careers_setup["variant"]
    ops_user = careers_setup["ops_user"]

    # Partner creates and publishes first listing
    l1 = create_listing(
        poster=employer,
        variant_id=variant.id,
        title="Frontend Engineer",
        description="React developer",
        attributes={"work_mode": "REMOTE", "job_type": "FULL_TIME", "experience_level": "MID"},
    )
    submit_listing(listing=l1, actor=employer.user)
    moderate_listing(listing=l1, actor=ops_user, action="APPROVE", reason="ok")
    publish_listing(listing=l1, actor=employer.user)
    assert l1.status == Listing.Status.PUBLISHED

    # Partner creates and publishes second listing without any subscription plan
    l2 = create_listing(
        poster=employer,
        variant_id=variant.id,
        title="Backend Engineer",
        description="Django developer",
        attributes={"work_mode": "REMOTE", "job_type": "FULL_TIME", "experience_level": "MID"},
    )
    submit_listing(listing=l2, actor=employer.user)
    moderate_listing(listing=l2, actor=ops_user, action="APPROVE", reason="ok")
    publish_listing(listing=l2, actor=employer.user)
    assert l2.status == Listing.Status.PUBLISHED

    # Both are active and published simultaneously
    active_count = Listing.objects.filter(poster=employer, status=Listing.Status.PUBLISHED).count()
    assert active_count == 2


def test_public_listings_orders_premium_first(careers_setup):
    employer = careers_setup["employer"]
    variant = careers_setup["variant"]
    ops_user = careers_setup["ops_user"]

    # Listing 1 is published earlier, not premium
    l1 = create_listing(
        poster=employer,
        variant_id=variant.id,
        title="Junior Developer",
        description="Junior Python",
        attributes={"work_mode": "REMOTE", "job_type": "FULL_TIME", "experience_level": "ENTRY"},
    )
    submit_listing(listing=l1, actor=employer.user)
    moderate_listing(listing=l1, actor=ops_user, action="APPROVE", reason="ok")
    publish_listing(listing=l1, actor=employer.user)

    # Listing 2 is premium
    l2 = create_listing(
        poster=employer,
        variant_id=variant.id,
        title="Senior Developer",
        description="Senior Python",
        attributes={"work_mode": "REMOTE", "job_type": "FULL_TIME", "experience_level": "SENIOR"},
    )
    submit_listing(listing=l2, actor=employer.user)
    moderate_listing(listing=l2, actor=ops_user, action="APPROVE", reason="ok")
    publish_listing(listing=l2, actor=employer.user)
    l2.is_premium = True
    l2.save(update_fields=("is_premium",))

    # Query public listings
    results = list(public_listings(variant_id=variant.id))
    assert len(results) >= 2
    # The premium listing must be ranked before non-premium
    assert results[0].id == l2.id
    assert results[1].id == l1.id


def test_candidate_contact_locked_without_plan_capability(careers_setup):
    employer = careers_setup["employer"]
    variant = careers_setup["variant"]
    ops_user = careers_setup["ops_user"]

    job = create_listing(
        poster=employer,
        variant_id=variant.id,
        title="Sales Executive",
        description="Looking for sales executive",
        attributes={
            "role": "Sales Executive",
            "skills": ["Sales", "Communication"],
            "city": "Hyderabad",
        },
    )
    submit_listing(listing=job, actor=employer.user)
    moderate_listing(listing=job, actor=ops_user, action="APPROVE", reason="ok")
    publish_listing(listing=job, actor=employer.user)

    # Create job seeker with open profile
    seeker_phone = "+919712345678"
    seeker_user = User.objects.create_user(phone_number=seeker_phone, full_name="Aarav Patel")
    save_profile(
        user=seeker_user,
        data={
            "full_name": "Aarav Patel",
            "roles": ["Sales Executive"],
            "skills": ["Sales", "Communication"],
            "experience_band": "1_3",
            "city": "Hyderabad",
            "area": "Madhapur",
            "languages": ["TELUGU", "ENGLISH"],
        },
    )

    client = _auth_client(employer.user, "partner")

    # 1. Without plan / CANDIDATE_CONTACT capability: contacts are locked
    resp = client.get(f"/api/v1/partner/jobs/{job.id}/matches")
    assert resp.status_code == status.HTTP_200_OK
    assert len(resp.data) == 1
    match = resp.data[0]
    assert match["is_contact_locked"] is True
    assert match["contact_phone"] == ""

    # 2. Employer subscribes to plan with CANDIDATE_CONTACT
    plan = VendorSubscriptionPlan.objects.create(
        service=variant.service,
        code=f"premium-careers-{uuid.uuid4().hex[:6]}",
        name="Careers Premium",
        price_paise=199900,
        duration_days=30,
        premium_capabilities=["CANDIDATE_CONTACT", "FEATURED_PLACEMENT"],
        is_active=True,
    )
    now = timezone.now()
    VendorSubscription.objects.create(
        vendor=employer,
        plan=plan,
        status=VendorSubscription.Status.ACTIVE,
        starts_at=now,
        ends_at=now + timedelta(days=30),
    )

    # 3. With active plan having CANDIDATE_CONTACT: contact info is unlocked
    resp_unlocked = client.get(f"/api/v1/partner/jobs/{job.id}/matches")
    assert resp_unlocked.status_code == status.HTTP_200_OK
    unlocked_match = resp_unlocked.data[0]
    assert unlocked_match["is_contact_locked"] is False
    assert unlocked_match["contact_phone"] == seeker_phone


def test_ops_vendor_subscription_plan_soft_delete(careers_setup):
    variant = careers_setup["variant"]
    ops_user = careers_setup["ops_user"]

    plan = VendorSubscriptionPlan.objects.create(
        service=variant.service,
        code=f"plan-to-retire-{uuid.uuid4().hex[:6]}",
        name="Retire Me Plan",
        price_paise=99900,
        duration_days=30,
        is_active=True,
    )

    client = _auth_client(ops_user, "operations")
    resp = client.delete(f"/api/v1/ops/career-subscription-plans/{plan.id}/")
    assert resp.status_code == status.HTTP_204_NO_CONTENT

    plan.refresh_from_db()
    assert plan.is_active is False
