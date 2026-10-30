import datetime
import uuid
from datetime import time, timedelta
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.conf import settings
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.identity.models import Role, User, UserRole
from apps.locations.models import Address, ServiceArea
from apps.partners.models import (
    PartnerApplication,
    PartnerAvailabilityRule,
    PartnerLocation,
    PartnerOnlineSession,
    PartnerProfile,
    PartnerPushSubscription,
    PartnerServiceArea,
    PartnerShift,
)
from apps.assignments.models import DispatchOffer, Reservation
from apps.assignments.ranking import evaluate_unit_candidates
from apps.assignments.tasks import (
    dispatch_instant_booking_task,
    expire_dispatch_offer_task,
    reassign_or_downgrade_booking_task,
    reconcile_expired_dispatch_offers,
    send_dispatch_offer_push_task,
)
from apps.carts.availability import AvailabilitySnapshot, compute_instant_availability
from apps.carts.models import BookingGroup, Cart, CartItem, CheckoutSession, FulfilmentUnit, Quote
from apps.catalog.models import Category, Service, ServiceVariant, Subcategory
from apps.commerce.models import Booking, Order
from psycopg.types.range import Range


@pytest.fixture
def test_setup():
    # Customer
    customer = User.objects.create_user(phone_number="+919800000001", full_name="Customer Test")

    # Partners
    user1 = User.objects.create_user(phone_number="+919800000002", full_name="Partner One")
    user2 = User.objects.create_user(phone_number="+919800000003", full_name="Partner Two")
    role, _ = Role.objects.get_or_create(code="partner")
    UserRole.objects.create(user=user1, role=role)
    UserRole.objects.create(user=user2, role=role)

    area = ServiceArea.objects.create(
        slug=f"area-{uuid.uuid4().hex[:6]}",
        name="Madhapur",
        timezone="Asia/Kolkata",
    )
    from apps.locations.models import ServiceAreaOperatingWindow
    import datetime
    for d in range(7):
        ServiceAreaOperatingWindow.objects.create(
            service_area=area,
            weekday=d,
            opens_at=datetime.time(0, 0),
            closes_at=datetime.time(23, 59),
        )

    category = Category.objects.create(slug="cat-1", name="Plumbing")
    subcategory = Subcategory.objects.create(category=category, slug="subcat-1", name="Pipes")
    service = Service.objects.create(subcategory=subcategory, slug="srv-1", name="Tap Repair")
    variant = ServiceVariant.objects.create(
        service=service,
        code="standard",
        name="Standard",
        required_skill_code="plumber",
        tax_category_code="repair",
    )

    def make_partner(u, name):
        p = PartnerProfile.objects.create(
            user=u,
            display_name=name,
        )
        PartnerApplication.objects.create(partner=p, status=PartnerApplication.Status.APPROVED)
        PartnerServiceArea.objects.create(partner=p, service_area=area, is_active=True)
        from apps.partners.models import PartnerService
        PartnerService.objects.create(partner=p, variant=variant, is_active=True)
        return p

    p1 = make_partner(user1, "Partner One")
    p2 = make_partner(user2, "Partner Two")

    # Booking setup
    address = Address.objects.create(
        customer=customer,
        label="Home",
        line1="Road 1",
        locality="Madhapur",
        city="Hyderabad",
        state="Telangana",
        postal_code="500081",
        latitude=Decimal("17.448293"),
        longitude=Decimal("78.391485"),
        confirmed_at=timezone.now(),
    )
    from apps.pricing.models import PricingPolicy
    policy, _ = PricingPolicy.objects.get_or_create(
        code="m1-technician",
        version=1,
        defaults={
            "minimum_service_subtotal_paise": 10000,
            "gst_rate_basis_points": 1800,
            "platform_fee_mode": PricingPolicy.PlatformFeeMode.FIXED,
            "platform_fee_value": 5000,
            "commission_basis_points": 1000,
            "commission_floor_paise": 2000,
            "commission_cap_paise": 10000,
        },
    )
    quote = Quote.objects.create(
        address=address,
        service_area=area,
        pricing_policy=policy,
        task_subtotal_paise=50000,
        minimum_visit_adjustment_paise=0,
        platform_fee_paise=0,
        tax_paise=0,
        total_paise=50000,
        estimated_duration_minutes=45,
        requested_start=timezone.now() + timedelta(minutes=15),
    )
    group = BookingGroup.objects.create(
        customer=customer,
        address=address,
        quote=quote,
        booking_mode=BookingGroup.BookingMode.INSTANT,
        expires_at=timezone.now() + timedelta(hours=1),
    )
    checkout = CheckoutSession.objects.create(
        customer=customer,
        quote=quote,
        booking_group=group,
        expires_at=timezone.now() + timedelta(hours=1),
    )
    order = Order.objects.create(
        checkout=checkout,
        booking_group=group,
        customer=customer,
        quote=quote,
        total_paise=50000,
    )
    start = timezone.now() + timedelta(minutes=15)
    occupied = Range(
        start,
        start + timedelta(minutes=60),
        "[)",
    )
    reservation = Reservation.objects.create(
        checkout=checkout,
        partner=p1,
        occupied_range=occupied,
        expires_at=timezone.now() + timedelta(minutes=30),
    )
    booking = Booking.objects.create(
        order=order,
        reservation=reservation,
        customer=customer,
        partner=p1,
        scheduled_start=start,
        estimated_duration_minutes=45,
        status=Booking.Status.CONFIRMED,
    )

    return {
        "customer": customer,
        "partner1": p1,
        "partner2": p2,
        "user1": user1,
        "user2": user2,
        "area": area,
        "variant": variant,
        "group": group,
        "booking": booking,
    }


@pytest.mark.django_db
def test_instant_availability_push_gated_flag_on_vs_off(test_setup):
    p1 = test_setup["partner1"]
    area = test_setup["area"]
    now = timezone.now()

    # Active shift + active push + fresh location for Partner 1
    shift = PartnerShift.objects.create(
        partner=p1,
        service_area=area,
        started_at=now - timedelta(hours=1),
        scheduled_end_at=now + timedelta(hours=7),
    )
    push_sub = PartnerPushSubscription.objects.create(
        partner=p1,
        user=p1.user,
        onesignal_subscription_id="sub-p1",
        onesignal_external_id=str(p1.id),
        is_active=True,
    )
    loc = PartnerLocation.objects.create(
        partner=p1,
        service_area=area,
        latitude=Decimal("17.440000"),
        longitude=Decimal("78.380000"),
        accuracy_m=10,
        captured_at=now - timedelta(minutes=5),
        purpose=PartnerLocation.Purpose.INSTANT_MATCHING,
        consent_version="v1",
    )

    snapshot = AvailabilitySnapshot(
        area=area,
        partner_ids=(p1.id,),
        _partners={p1.id: p1},
        destination=(Decimal("17.441000"), Decimal("78.381000")),
        _rules={
            p1.id: (
                PartnerAvailabilityRule(
                    partner=p1,
                    service_area=area,
                    weekday=now.weekday(),
                    starts_at=datetime.time(0, 0),
                    ends_at=datetime.time(23, 59),
                ),
            )
        },
        _exceptions={},
        _reserved={},
    )

    # 1. When FEATURE_PUSH_GATED_INSTANT is FALSE:
    # Since Partner has no active PartnerOnlineSession, instant returns NO_ONLINE_PARTNERS
    with override_settings(FEATURE_PUSH_GATED_INSTANT=False):
        avail_off = compute_instant_availability(
            area=area,
            snapshot=snapshot,
            duration=45,
            now=now,
        )
        assert not avail_off.is_available
        assert avail_off.unavailable_reason == "NO_ONLINE_PARTNERS"

    # 2. When FEATURE_PUSH_GATED_INSTANT is TRUE:
    # Since Partner has active shift + push sub + fresh location, instant is available!
    with override_settings(FEATURE_PUSH_GATED_INSTANT=True):
        avail_on = compute_instant_availability(
            area=area,
            snapshot=snapshot,
            duration=45,
            now=now,
        )
        assert avail_on.is_available
        assert avail_on.eta_minutes is not None
        assert avail_on.earliest_starts_at is not None

        # 3. If location becomes stale (>30 min), instant is excluded
        loc.captured_at = now - timedelta(minutes=45)
        loc.save(update_fields=["captured_at"])
        avail_stale = compute_instant_availability(
            area=area,
            snapshot=snapshot,
            duration=45,
            now=now,
        )
        assert not avail_stale.is_available
        assert avail_stale.unavailable_reason == "NO_ONLINE_PARTNERS"


@pytest.mark.django_db
def test_dispatch_offer_accept_decline_and_security(test_setup):
    p1 = test_setup["partner1"]
    p2 = test_setup["partner2"]
    user1 = test_setup["user1"]
    user2 = test_setup["user2"]
    booking = test_setup["booking"]
    now = timezone.now()

    offer = DispatchOffer.objects.create(
        booking=booking,
        partner=p1,
        status=DispatchOffer.Status.PENDING,
        attempt_number=1,
        offered_at=now,
        expires_at=now + timedelta(seconds=60),
    )

    client1 = APIClient()
    client1.force_authenticate(user=user1)
    client2 = APIClient()
    client2.force_authenticate(user=user2)

    # Security check: Partner 2 cannot view or accept Partner 1's offer
    resp = client2.get(f"/api/v1/partner/dispatch-offers/{offer.id}/")
    assert resp.status_code == 403

    resp = client2.post(f"/api/v1/partner/dispatch-offers/{offer.id}/accept/")
    assert resp.status_code == 403

    # Partner 1 can view
    resp = client1.get(f"/api/v1/partner/dispatch-offers/{offer.id}/")
    assert resp.status_code == 200
    assert resp.json()["status"] == "PENDING"
    assert resp.json()["remaining_seconds"] > 0

    # Partner 1 accepts
    resp = client1.post(f"/api/v1/partner/dispatch-offers/{offer.id}/accept/")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ACCEPTED"

    offer.refresh_from_db()
    assert offer.status == DispatchOffer.Status.ACCEPTED

    # Cannot accept already accepted offer
    resp = client1.post(f"/api/v1/partner/dispatch-offers/{offer.id}/accept/")
    assert resp.status_code == 400


@pytest.mark.django_db
@patch("apps.notifications.onesignal.send_push_to_external_ids")
def test_celery_dispatch_flow_and_reconciliation(mock_push, test_setup):
    mock_push.return_value = {"success": True, "notification_id": "os-notif-999", "errors": []}

    p1 = test_setup["partner1"]
    user1 = test_setup["user1"]
    area = test_setup["area"]
    booking = test_setup["booking"]
    now = timezone.now()

    # Give Partner 1 active shift + push sub + location
    PartnerShift.objects.create(
        partner=p1,
        service_area=area,
        started_at=now - timedelta(hours=1),
        scheduled_end_at=now + timedelta(hours=7),
    )
    PartnerPushSubscription.objects.create(
        partner=p1,
        user=user1,
        onesignal_subscription_id="sub-p1",
        is_active=True,
    )
    PartnerLocation.objects.create(
        partner=p1,
        service_area=area,
        latitude=Decimal("17.440000"),
        longitude=Decimal("78.380000"),
        accuracy_m=10,
        captured_at=now,
        purpose=PartnerLocation.Purpose.INSTANT_MATCHING,
        consent_version="v1",
    )

    offer = DispatchOffer.objects.create(
        booking=booking,
        partner=p1,
        status=DispatchOffer.Status.PENDING,
        attempt_number=1,
        offered_at=now - timedelta(seconds=70),
        expires_at=now - timedelta(seconds=10),
    )

    # Reconcile expired dispatch offers beat task
    reconciled = reconcile_expired_dispatch_offers()
    assert reconciled >= 1
    offer.refresh_from_db()
    assert offer.status == DispatchOffer.Status.EXPIRED
