"""Tests for Stays subscription tiers, publishing capacity gating, payment, and expiry."""

import uuid
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework import status

from apps.catalog.models import (
    A9VariantConfiguration,
    Category,
    Service,
    ServiceVariant,
    Subcategory,
)
from apps.commerce.models import PaymentAttempt
from apps.identity.models import Role, User, UserRole
from apps.partners.models import PartnerApplication, PartnerCapability, PartnerProfile
from apps.stay.models import Property, StaySubscription, StaySubscriptionPlan
from apps.stay.services import (
    StayPlanCapError,
    complete_stay_subscription_payment,
    create_property,
    expire_stay_subscriptions,
    set_property_listing,
    start_stay_subscription_purchase,
    submit_property,
)
from tests.helpers import force_role_client

pytestmark = pytest.mark.django_db

BASIC_PRICE_PAISE = 99900
PRO_PRICE_PAISE = 249900
BUSINESS_PRICE_PAISE = 499900
PATCHED_PRICE_PAISE = 549900
TWO_PROPERTIES = 2
FIVE_PROPERTIES = 5
MAX_PROPERTIES_CAP = 2


@pytest.fixture
def stays_sub_setup():
    cat = Category.objects.create(slug=f"stay-cat-{uuid.uuid4().hex[:6]}", name="Stays")
    sub = Subcategory.objects.create(
        category=cat, slug=f"coliving-{uuid.uuid4().hex[:6]}", name="Coliving"
    )
    svc = Service.objects.create(
        subcategory=sub,
        slug=f"stay-svc-{uuid.uuid4().hex[:6]}",
        name="Coliving PG",
        status=Service.Status.ACTIVE,
    )
    variant = ServiceVariant.objects.create(
        service=svc,
        code=f"coliving-var-{uuid.uuid4().hex[:6]}",
        name="Coliving Stay",
        pricing_strategy=ServiceVariant.PricingStrategy.FIXED,
        booking_archetype=ServiceVariant.BookingArchetype.A9_STAY,
        required_skill_code="stay",
        tax_category_code="stay",
    )
    A9VariantConfiguration.objects.create(
        variant=variant,
        version=1,
        status=A9VariantConfiguration.Status.ACTIVE,
        price_period=A9VariantConfiguration.PricePeriod.MONTH,
    )

    host_user = User.objects.create_user(phone_number=f"+9198{uuid.uuid4().int % 10**8:08d}")
    host = PartnerProfile.objects.create(
        user=host_user, display_name="Stay Host Co", default_location_text="Gachibowli"
    )
    PartnerApplication.objects.create(partner=host, status=PartnerApplication.Status.APPROVED)
    PartnerCapability.objects.create(
        partner=host,
        variant=variant,
        archetype=ServiceVariant.BookingArchetype.A9_STAY,
        status=PartnerCapability.Status.APPROVED,
    )

    ops_user = User.objects.create_user(
        phone_number=f"+9196{uuid.uuid4().int % 10**8:08d}", is_staff=True
    )

    basic_plan = StaySubscriptionPlan.objects.create(
        code="basic",
        name="Basic Host",
        price_paise=BASIC_PRICE_PAISE,
        duration_days=30,
        max_properties=TWO_PROPERTIES,
        capabilities=["STANDARD_SUPPORT"],
        is_active=True,
    )

    pro_plan = StaySubscriptionPlan.objects.create(
        code="pro",
        name="Pro Host",
        price_paise=PRO_PRICE_PAISE,
        duration_days=30,
        max_properties=FIVE_PROPERTIES,
        capabilities=["PRIORITY_SUPPORT", "FEATURED_PLACEMENT"],
        is_active=True,
    )

    return {
        "variant": variant,
        "host": host,
        "host_user": host_user,
        "ops_user": ops_user,
        "basic_plan": basic_plan,
        "pro_plan": pro_plan,
    }


def _auth_client(user: User, role_code: str):
    role, _ = Role.objects.get_or_create(code=role_code, defaults={"name": role_code.title()})
    UserRole.objects.get_or_create(user=user, role=role, revoked_at=None)
    return force_role_client(user=user, role_code=role_code)


def test_ops_stay_subscription_plan_crud(stays_sub_setup):
    ops_user = stays_sub_setup["ops_user"]
    client = _auth_client(ops_user, "operations")

    # List
    list_resp = client.get("/api/v1/ops/stay-subscription-plans")
    assert list_resp.status_code == status.HTTP_200_OK
    assert len(list_resp.data) >= TWO_PROPERTIES

    # Create
    create_payload = {
        "code": f"business-{uuid.uuid4().hex[:4]}",
        "name": "Business Tier",
        "price_paise": BUSINESS_PRICE_PAISE,
        "duration_days": 30,
        "max_properties": 99,
        "capabilities": ["UNLIMITED"],
        "is_active": True,
    }
    create_resp = client.post("/api/v1/ops/stay-subscription-plans", create_payload, format="json")
    assert create_resp.status_code == status.HTTP_201_CREATED
    plan_id = create_resp.data["id"]

    # Patch
    patch_resp = client.patch(
        f"/api/v1/ops/stay-subscription-plans/{plan_id}",
        {"price_paise": PATCHED_PRICE_PAISE},
        format="json",
    )
    assert patch_resp.status_code == status.HTTP_200_OK
    assert patch_resp.data["price_paise"] == PATCHED_PRICE_PAISE

    # Delete (soft-delete)
    del_resp = client.delete(f"/api/v1/ops/stay-subscription-plans/{plan_id}")
    assert del_resp.status_code == status.HTTP_204_NO_CONTENT
    plan = StaySubscriptionPlan.objects.get(id=plan_id)
    assert plan.is_active is False


def test_stay_property_capacity_gating(stays_sub_setup):
    host = stays_sub_setup["host"]
    variant = stays_sub_setup["variant"]
    basic_plan = stays_sub_setup["basic_plan"]

    # 1. Host has NO active subscription: submitting property fails closed
    p1 = create_property(
        host=host,
        variant_id=variant.id,
        title="Host Property 1",
        monthly_rate_paise=1500000,
    )
    with pytest.raises(StayPlanCapError, match="Active subscription plan required"):
        submit_property(prop=p1, host=host)

    # 2. Host purchases Basic plan (limit: 2)
    now = timezone.now()
    StaySubscription.objects.create(
        host=host,
        plan=basic_plan,
        status=StaySubscription.Status.ACTIVE,
        starts_at=now,
        ends_at=now + timedelta(days=30),
        grace_ends_at=now + timedelta(days=33),
    )

    # Now p1 submit succeeds
    submit_property(prop=p1, host=host)
    p1.moderation_status = Property.ModerationStatus.APPROVED
    p1.listing_status = Property.ListingStatus.LIVE
    p1.save(update_fields=("moderation_status", "listing_status"))

    # Property 2 submit succeeds
    p2 = create_property(
        host=host,
        variant_id=variant.id,
        title="Host Property 2",
        monthly_rate_paise=1800000,
    )
    submit_property(prop=p2, host=host)
    p2.moderation_status = Property.ModerationStatus.APPROVED
    p2.listing_status = Property.ListingStatus.LIVE
    p2.save(update_fields=("moderation_status", "listing_status"))

    # Property 3 submit reaches cap (2 properties)
    p3 = create_property(
        host=host,
        variant_id=variant.id,
        title="Host Property 3",
        monthly_rate_paise=2200000,
    )
    with pytest.raises(StayPlanCapError, match="reached their property limit"):
        submit_property(prop=p3, host=host)


def test_resuming_paused_property_respects_capacity(stays_sub_setup):
    host = stays_sub_setup["host"]
    variant = stays_sub_setup["variant"]
    basic_plan = stays_sub_setup["basic_plan"]

    now = timezone.now()
    StaySubscription.objects.create(
        host=host,
        plan=basic_plan,
        status=StaySubscription.Status.ACTIVE,
        starts_at=now,
        ends_at=now + timedelta(days=30),
        grace_ends_at=now + timedelta(days=33),
    )

    # p1 is LIVE
    p1 = create_property(host=host, variant_id=variant.id, title="Prop 1")
    p1.moderation_status = Property.ModerationStatus.APPROVED
    p1.listing_status = Property.ListingStatus.LIVE
    p1.save(update_fields=("moderation_status", "listing_status"))

    # p2 is LIVE
    p2 = create_property(host=host, variant_id=variant.id, title="Prop 2")
    p2.moderation_status = Property.ModerationStatus.APPROVED
    p2.listing_status = Property.ListingStatus.LIVE
    p2.save(update_fields=("moderation_status", "listing_status"))

    # p3 was previously PAUSED
    p3 = create_property(host=host, variant_id=variant.id, title="Prop 3")
    p3.moderation_status = Property.ModerationStatus.APPROVED
    p3.listing_status = Property.ListingStatus.PAUSED
    p3.save(update_fields=("moderation_status", "listing_status"))

    # Resuming p3 must fail because host already has 2 LIVE properties
    with pytest.raises(StayPlanCapError, match="reached their property limit"):
        set_property_listing(prop=p3, host=host, action="resume")


def test_stay_subscription_purchase_and_capture(stays_sub_setup):
    host = stays_sub_setup["host"]
    basic_plan = stays_sub_setup["basic_plan"]

    sub = start_stay_subscription_purchase(
        host=host, plan=basic_plan, idempotency_key=f"stay-sub-test:{uuid.uuid4().hex}"
    )
    assert sub.status == StaySubscription.Status.PENDING_ACTIVATION
    assert sub.payment_attempt is not None
    assert sub.payment_attempt.purpose == PaymentAttempt.Purpose.A9_STAY_SUBSCRIPTION
    assert sub.payment_attempt.amount_paise == basic_plan.price_paise

    # Complete payment
    activated = complete_stay_subscription_payment(
        subscription_id=sub.id, payment_attempt_id=sub.payment_attempt.id
    )
    assert activated.status == StaySubscription.Status.ACTIVE
    assert activated.starts_at is not None
    assert activated.ends_at is not None
    assert activated.grace_ends_at == activated.ends_at + timedelta(days=3)


def test_stay_subscription_expiry_and_grace_transitions(stays_sub_setup):
    host = stays_sub_setup["host"]
    variant = stays_sub_setup["variant"]
    basic_plan = stays_sub_setup["basic_plan"]

    p1 = create_property(host=host, variant_id=variant.id, title="Prop 1")
    p1.moderation_status = Property.ModerationStatus.APPROVED
    p1.listing_status = Property.ListingStatus.LIVE
    p1.save(update_fields=("moderation_status", "listing_status"))

    now = timezone.now()
    # Subscription whose ends_at is in the past, but grace_ends_at is in future
    sub = StaySubscription.objects.create(
        host=host,
        plan=basic_plan,
        status=StaySubscription.Status.ACTIVE,
        starts_at=now - timedelta(days=32),
        ends_at=now - timedelta(days=2),
        grace_ends_at=now + timedelta(days=1),
    )

    # 1. Processing expiries moves ACTIVE -> GRACE; property remains LIVE
    expire_stay_subscriptions()
    sub.refresh_from_db()
    assert sub.status == StaySubscription.Status.GRACE
    p1.refresh_from_db()
    assert p1.listing_status == Property.ListingStatus.LIVE

    # 2. When grace_ends_at is now also in the past: moves GRACE -> EXPIRED and pauses property
    sub.grace_ends_at = now - timedelta(hours=1)
    sub.save(update_fields=("grace_ends_at",))

    expire_stay_subscriptions()
    sub.refresh_from_db()
    assert sub.status == StaySubscription.Status.EXPIRED
    p1.refresh_from_db()
    assert p1.listing_status == Property.ListingStatus.PAUSED


def test_partner_stay_subscription_dashboard_view(stays_sub_setup):
    host_user = stays_sub_setup["host_user"]
    basic_plan = stays_sub_setup["basic_plan"]

    client = _auth_client(host_user, "partner")

    # Before subscribing
    resp = client.get("/api/v1/partner/stays/subscription")
    assert resp.status_code == status.HTTP_200_OK
    assert resp.data["subscription"] is None
    assert resp.data["live_properties_count"] == 0
    assert resp.data["max_properties"] == 0
    assert len(resp.data["available_plans"]) >= TWO_PROPERTIES

    # Purchase via endpoint
    buy_resp = client.post(
        "/api/v1/partner/stays/subscription",
        {"plan_id": str(basic_plan.id)},
        format="json",
    )
    assert buy_resp.status_code == status.HTTP_201_CREATED
    assert buy_resp.data["status"] == StaySubscription.Status.PENDING_ACTIVATION
