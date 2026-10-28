import uuid
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.conf import settings
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.identity.models import Role, User, UserRole
from apps.locations.models import ServiceArea
from apps.partners import services
from apps.partners.models import (
    PartnerApplication,
    PartnerOnlineSession,
    PartnerProfile,
    PartnerPushSubscription,
    PartnerServiceArea,
    PartnerShift,
)
from apps.assignments.models import DispatchOffer


@pytest.fixture
def partner_user() -> User:
    user = User.objects.create_user(phone_number="+919876500001", full_name="Shift Partner")
    role, _ = Role.objects.get_or_create(code="partner")
    UserRole.objects.create(user=user, role=role)
    return user


@pytest.fixture
def approved_partner(partner_user: User) -> tuple[PartnerProfile, ServiceArea]:
    area = ServiceArea.objects.create(slug=f"area-{uuid.uuid4().hex[:6]}", name="Hitec City", timezone="Asia/Kolkata")
    profile = PartnerProfile.objects.create(
        user=partner_user,
        display_name="Shift Partner",
    )
    application = PartnerApplication.objects.create(
        partner=profile,
        status=PartnerApplication.Status.APPROVED,
    )
    PartnerServiceArea.objects.create(partner=profile, service_area=area, is_active=True)
    return profile, area


@pytest.mark.django_db
@patch("apps.partners.services.presence._assert_operational_eligibility")
def test_go_online_flag_off_does_not_create_shift(mock_elig, approved_partner: tuple[PartnerProfile, ServiceArea], partner_user: User):
    profile, area = approved_partner
    with override_settings(FEATURE_PUSH_GATED_INSTANT=False):
        session = services.go_online(
            user=partner_user,
            service_area_id=area.id,
            latitude=Decimal("17.440000"),
            longitude=Decimal("78.380000"),
            accuracy_m=20,
            consent_version="v1",
        )
        assert session.ended_at is None
        assert not PartnerShift.objects.filter(partner=profile).exists()


@pytest.mark.django_db
@patch("apps.partners.services.presence._assert_operational_eligibility")
def test_go_online_flag_on_creates_and_reuses_shift(mock_elig, approved_partner: tuple[PartnerProfile, ServiceArea], partner_user: User):
    profile, area = approved_partner
    with override_settings(FEATURE_PUSH_GATED_INSTANT=True):
        session1 = services.go_online(
            user=partner_user,
            service_area_id=area.id,
            latitude=Decimal("17.440000"),
            longitude=Decimal("78.380000"),
            accuracy_m=20,
            consent_version="v1",
        )
        assert session1.ended_at is None
        shifts = list(PartnerShift.objects.filter(partner=profile, ended_at__isnull=True))
        assert len(shifts) == 1
        shift1 = shifts[0]
        assert shift1.scheduled_end_at > timezone.now()

        # Simulate returning to foreground / going online again: should reuse active shift
        session2 = services.go_online(
            user=partner_user,
            service_area_id=area.id,
            latitude=Decimal("17.441000"),
            longitude=Decimal("78.381000"),
            accuracy_m=15,
            consent_version="v1",
        )
        shifts_after = list(PartnerShift.objects.filter(partner=profile, ended_at__isnull=True))
        assert len(shifts_after) == 1
        assert shifts_after[0].id == shift1.id


@pytest.mark.django_db
@patch("apps.partners.services.presence._assert_operational_eligibility")
def test_go_offline_flag_on_ends_session_and_shift(mock_elig, approved_partner: tuple[PartnerProfile, ServiceArea], partner_user: User):
    profile, area = approved_partner
    with override_settings(FEATURE_PUSH_GATED_INSTANT=True):
        session = services.go_online(
            user=partner_user,
            service_area_id=area.id,
            latitude=Decimal("17.440000"),
            longitude=Decimal("78.380000"),
            accuracy_m=20,
            consent_version="v1",
        )
        services.go_offline(user=partner_user, session_id=session.id)

        session.refresh_from_db()
        assert session.ended_at is not None
        assert session.end_reason == PartnerOnlineSession.EndReason.PARTNER_OFFLINE

        shift = PartnerShift.objects.get(partner=profile)
        assert shift.ended_at is not None
        assert shift.end_reason == PartnerShift.EndReason.PARTNER_LOGOUT


@pytest.mark.django_db
def test_shift_reconciliation_expiry(approved_partner: tuple[PartnerProfile, ServiceArea]):
    profile, area = approved_partner
    now = timezone.now()

    # 1. Past scheduled end
    expired_shift = PartnerShift.objects.create(
        partner=profile,
        service_area=area,
        started_at=now - timedelta(hours=9),
        scheduled_end_at=now - timedelta(minutes=5),
        last_active_at=now - timedelta(minutes=10),
    )
    count = services.expire_expired_shifts()
    assert count >= 1
    expired_shift.refresh_from_db()
    assert expired_shift.ended_at is not None
    assert expired_shift.end_reason == PartnerShift.EndReason.SHIFT_EXPIRED


@pytest.mark.django_db
def test_push_subscription_sync_api(approved_partner: tuple[PartnerProfile, ServiceArea], partner_user: User):
    profile, _area = approved_partner
    client = APIClient()

    # Unauthenticated should fail
    resp = client.post("/api/v1/partner/push-subscriptions/sync/", {"onesignal_subscription_id": "sub-123"})
    assert resp.status_code in (401, 403)

    client.force_authenticate(user=partner_user)
    # Sync active subscription
    resp = client.post(
        "/api/v1/partner/push-subscriptions/sync/",
        {
            "onesignal_subscription_id": "sub-123",
            "platform": "WEB",
            "user_agent": "Mozilla/5.0",
            "is_active": True,
        },
        format="json",
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["onesignal_subscription_id"] == "sub-123"
    assert data["is_active"] is True

    sub = PartnerPushSubscription.objects.get(onesignal_subscription_id="sub-123")
    assert sub.partner_id == profile.id
    assert sub.is_active is True

    # Registering a new WEB subscription replaces the old one
    resp2 = client.post(
        "/api/v1/partner/push-subscriptions/sync/",
        {
            "onesignal_subscription_id": "sub-456",
            "platform": "WEB",
            "is_active": True,
        },
        format="json",
    )
    assert resp2.status_code == 200
    sub.refresh_from_db()
    assert sub.is_active is False
    sub2 = PartnerPushSubscription.objects.get(onesignal_subscription_id="sub-456")
    assert sub2.is_active is True

    # Deactivating
    resp3 = client.post(
        "/api/v1/partner/push-subscriptions/sync/",
        {
            "onesignal_subscription_id": "sub-456",
            "is_active": False,
        },
        format="json",
    )
    assert resp3.status_code == 200
    sub2.refresh_from_db()
    assert sub2.is_active is False
