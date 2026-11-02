from datetime import timedelta
import uuid

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.identity.models import User
from apps.locations.models import ServiceArea
from apps.partners.models import (
    PartnerLocation,
    PartnerProfile,
    PartnerPushSubscription,
    PartnerShift,
)

pytestmark = pytest.mark.django_db


@pytest.fixture
def partner_user() -> User:
    user = User.objects.create_user(phone_number="+919876543210", full_name="Partner One")
    PartnerProfile.objects.create(user=user, display_name="Partner One")
    return user


@pytest.fixture
def other_partner_user() -> User:
    user = User.objects.create_user(phone_number="+919876543211", full_name="Partner Two")
    PartnerProfile.objects.create(user=user, display_name="Partner Two")
    return user


@pytest.fixture
def auth_client(partner_user: User) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=partner_user)
    return client


def test_push_subscription_unauthenticated():
    client = APIClient()
    response = client.post(
        "/api/v1/partner/push-subscriptions/sync/",
        {"onesignal_subscription_id": str(uuid.uuid4())},
        format="json",
    )
    # DRF with SessionAuthentication returns 403 or 401 for unauthenticated
    assert response.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)


def test_push_subscription_no_partner_profile():
    user = User.objects.create_user(phone_number="+919876543299", full_name="No Profile")
    client = APIClient()
    client.force_authenticate(user=user)

    response = client.post(
        "/api/v1/partner/push-subscriptions/sync/",
        {"onesignal_subscription_id": str(uuid.uuid4())},
        format="json",
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.json()["error"]["code"] == "partner_not_operationally_eligible"


def test_push_subscription_create_new(auth_client: APIClient, partner_user: User):
    sub_id = str(uuid.uuid4())
    response = auth_client.post(
        "/api/v1/partner/push-subscriptions/sync/",
        {
            "onesignal_subscription_id": sub_id,
            "platform": "WEB",
            "user_agent": "Mozilla/5.0 TestBrowser",
            "is_active": True,
            "opted_in": True,
            "permission_state": "granted",
            "action": "sync",
        },
        format="json",
    )
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["onesignal_subscription_id"] == sub_id
    assert data["is_active"] is True
    assert data["opted_in"] is True
    assert data["permission_state"] == "granted"
    assert data["last_sync_status"] == "SUCCESS"

    sub = PartnerPushSubscription.objects.get(onesignal_subscription_id=sub_id)
    assert sub.user == partner_user
    assert sub.partner == partner_user.partner_profile
    assert sub.is_active is True
    assert sub.opted_in is True
    assert sub.permission_state == "granted"
    assert sub.user_agent == "Mozilla/5.0 TestBrowser"


def test_push_subscription_update_existing(auth_client: APIClient, partner_user: User):
    sub_id = str(uuid.uuid4())
    sub = PartnerPushSubscription.objects.create(
        partner=partner_user.partner_profile,
        user=partner_user,
        onesignal_subscription_id=sub_id,
        onesignal_external_id=str(partner_user.partner_profile.id),
        platform=PartnerPushSubscription.Platform.WEB,
        user_agent="Old Browser",
        is_active=True,
    )

    response = auth_client.post(
        "/api/v1/partner/push-subscriptions/sync/",
        {
            "onesignal_subscription_id": sub_id,
            "platform": "WEB",
            "user_agent": "New Browser",
            "is_active": True,
            "opted_in": True,
            "permission_state": "granted",
            "action": "sync",
        },
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    sub.refresh_from_db()
    assert sub.user_agent == "New Browser"
    assert sub.permission_state == "granted"


def test_push_subscription_reactivate(auth_client: APIClient, partner_user: User):
    sub_id = str(uuid.uuid4())
    sub = PartnerPushSubscription.objects.create(
        partner=partner_user.partner_profile,
        user=partner_user,
        onesignal_subscription_id=sub_id,
        onesignal_external_id=str(partner_user.partner_profile.id),
        platform=PartnerPushSubscription.Platform.WEB,
        is_active=False,
        opted_in=False,
    )

    response = auth_client.post(
        "/api/v1/partner/push-subscriptions/sync/",
        {
            "onesignal_subscription_id": sub_id,
            "is_active": True,
            "opted_in": True,
            "permission_state": "granted",
            "action": "sync",
        },
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["is_active"] is True
    sub.refresh_from_db()
    assert sub.is_active is True
    assert sub.opted_in is True


def test_push_subscription_deactivate_action(auth_client: APIClient, partner_user: User):
    sub_id = str(uuid.uuid4())
    sub = PartnerPushSubscription.objects.create(
        partner=partner_user.partner_profile,
        user=partner_user,
        onesignal_subscription_id=sub_id,
        onesignal_external_id=str(partner_user.partner_profile.id),
        platform=PartnerPushSubscription.Platform.WEB,
        is_active=True,
        opted_in=True,
    )

    response = auth_client.post(
        "/api/v1/partner/push-subscriptions/sync/",
        {
            "onesignal_subscription_id": sub_id,
            "action": "deactivate",
        },
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["is_active"] is False
    sub.refresh_from_db()
    assert sub.is_active is False
    assert sub.opted_in is False


def test_push_subscription_denied_permission_deactivates(auth_client: APIClient, partner_user: User):
    sub_id = str(uuid.uuid4())
    sub = PartnerPushSubscription.objects.create(
        partner=partner_user.partner_profile,
        user=partner_user,
        onesignal_subscription_id=sub_id,
        onesignal_external_id=str(partner_user.partner_profile.id),
        platform=PartnerPushSubscription.Platform.WEB,
        is_active=True,
    )

    response = auth_client.post(
        "/api/v1/partner/push-subscriptions/sync/",
        {
            "onesignal_subscription_id": sub_id,
            "is_active": True,
            "opted_in": True,
            "permission_state": "denied",
        },
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["is_active"] is False
    sub.refresh_from_db()
    assert sub.is_active is False
    assert sub.permission_state == "denied"


def test_push_subscription_replaces_older_active_web_subscription(
    auth_client: APIClient,
    partner_user: User,
):
    sub_old_id = str(uuid.uuid4())
    sub_new_id = str(uuid.uuid4())

    sub_old = PartnerPushSubscription.objects.create(
        partner=partner_user.partner_profile,
        user=partner_user,
        onesignal_subscription_id=sub_old_id,
        onesignal_external_id=str(partner_user.partner_profile.id),
        platform=PartnerPushSubscription.Platform.WEB,
        is_active=True,
    )

    response = auth_client.post(
        "/api/v1/partner/push-subscriptions/sync/",
        {
            "onesignal_subscription_id": sub_new_id,
            "platform": "WEB",
            "is_active": True,
            "opted_in": True,
            "permission_state": "granted",
        },
        format="json",
    )
    assert response.status_code == status.HTTP_201_CREATED
    sub_old.refresh_from_db()
    sub_new = PartnerPushSubscription.objects.get(onesignal_subscription_id=sub_new_id)

    assert sub_old.is_active is False
    assert sub_new.is_active is True


def test_push_subscription_cross_user_denied(
    partner_user: User,
    other_partner_user: User,
):
    sub_id = str(uuid.uuid4())
    PartnerPushSubscription.objects.create(
        partner=partner_user.partner_profile,
        user=partner_user,
        onesignal_subscription_id=sub_id,
        onesignal_external_id=str(partner_user.partner_profile.id),
        platform=PartnerPushSubscription.Platform.WEB,
        is_active=True,
    )

    other_client = APIClient()
    other_client.force_authenticate(user=other_partner_user)

    response = other_client.post(
        "/api/v1/partner/push-subscriptions/sync/",
        {
            "onesignal_subscription_id": sub_id,
            "is_active": True,
        },
        format="json",
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.json()["error"]["code"] == "partner_access_denied"


def test_push_subscription_validation_empty_id(auth_client: APIClient):
    response = auth_client.post(
        "/api/v1/partner/push-subscriptions/sync/",
        {
            "onesignal_subscription_id": "   ",
        },
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST


def test_push_subscription_instant_eligibility(auth_client: APIClient, partner_user: User):
    profile = partner_user.partner_profile
    area = ServiceArea.objects.create(slug="eligibility-area", name="Eligibility Area")
    now = timezone.now()

    # Initially no shift, no location -> instant_eligible is False
    sub_id = str(uuid.uuid4())
    res1 = auth_client.post(
        "/api/v1/partner/push-subscriptions/sync/",
        {"onesignal_subscription_id": sub_id, "is_active": True},
        format="json",
    )
    assert res1.status_code == status.HTTP_201_CREATED
    assert res1.json()["instant_eligible"] is False

    # Add active shift
    PartnerShift.objects.create(
        partner=profile,
        service_area=area,
        started_at=now - timedelta(hours=1),
        scheduled_end_at=now + timedelta(hours=3),
    )

    # Still missing fresh location
    res2 = auth_client.post(
        "/api/v1/partner/push-subscriptions/sync/",
        {"onesignal_subscription_id": sub_id, "is_active": True},
        format="json",
    )
    assert res2.status_code == status.HTTP_200_OK
    assert res2.json()["instant_eligible"] is False

    # Add fresh location
    PartnerLocation.objects.create(
        partner=profile,
        service_area=area,
        latitude=17.44,
        longitude=78.38,
        accuracy_m=10,
        captured_at=now,
    )

    # Now instant_eligible should be True
    res3 = auth_client.post(
        "/api/v1/partner/push-subscriptions/sync/",
        {"onesignal_subscription_id": sub_id, "is_active": True},
        format="json",
    )
    assert res3.status_code == status.HTTP_200_OK
    assert res3.json()["instant_eligible"] is True
