from datetime import timedelta
import uuid

import pytest
from django.conf import settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.identity.models import User
from apps.notifications.models import CustomerPushSubscription
from apps.notifications.services import (
    CustomerPushReachabilityReason,
    get_customer_push_reachability,
)

pytestmark = pytest.mark.django_db


@pytest.fixture
def customer_user() -> User:
    return User.objects.create_user(phone_number="+919876543220", full_name="Customer One")


@pytest.fixture
def other_customer_user() -> User:
    return User.objects.create_user(phone_number="+919876543221", full_name="Customer Two")


@pytest.fixture
def auth_client(customer_user: User) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=customer_user)
    return client


def test_customer_push_unauthenticated():
    client = APIClient()
    response = client.post(
        "/api/v1/customer/push-subscriptions/sync/",
        {"onesignal_subscription_id": str(uuid.uuid4())},
        format="json",
    )
    assert response.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)


def test_customer_push_create_new(auth_client: APIClient, customer_user: User):
    sub_id = str(uuid.uuid4())
    response = auth_client.post(
        "/api/v1/customer/push-subscriptions/sync/",
        {
            "onesignal_subscription_id": sub_id,
            "platform": "WEB",
            "user_agent": "Mozilla/5.0 CustomerBrowser",
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

    sub = CustomerPushSubscription.objects.get(onesignal_subscription_id=sub_id)
    assert sub.user == customer_user
    assert sub.onesignal_external_id == str(customer_user.id)
    assert sub.is_active is True
    assert sub.opted_in is True
    assert sub.permission_state == "granted"
    assert sub.user_agent == "Mozilla/5.0 CustomerBrowser"


def test_customer_push_update_existing(auth_client: APIClient, customer_user: User):
    sub_id = str(uuid.uuid4())
    sub = CustomerPushSubscription.objects.create(
        user=customer_user,
        onesignal_subscription_id=sub_id,
        onesignal_external_id=str(customer_user.id),
        platform=CustomerPushSubscription.Platform.WEB,
        user_agent="Old Browser",
        is_active=True,
    )

    response = auth_client.post(
        "/api/v1/customer/push-subscriptions/sync/",
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


def test_customer_push_reactivate(auth_client: APIClient, customer_user: User):
    sub_id = str(uuid.uuid4())
    sub = CustomerPushSubscription.objects.create(
        user=customer_user,
        onesignal_subscription_id=sub_id,
        onesignal_external_id=str(customer_user.id),
        platform=CustomerPushSubscription.Platform.WEB,
        is_active=False,
        opted_in=False,
    )

    response = auth_client.post(
        "/api/v1/customer/push-subscriptions/sync/",
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


def test_customer_push_deactivate_action(auth_client: APIClient, customer_user: User):
    sub_id = str(uuid.uuid4())
    sub = CustomerPushSubscription.objects.create(
        user=customer_user,
        onesignal_subscription_id=sub_id,
        onesignal_external_id=str(customer_user.id),
        platform=CustomerPushSubscription.Platform.WEB,
        is_active=True,
        opted_in=True,
    )

    response = auth_client.post(
        "/api/v1/customer/push-subscriptions/sync/",
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


def test_customer_push_denied_permission_deactivates(auth_client: APIClient, customer_user: User):
    sub_id = str(uuid.uuid4())
    sub = CustomerPushSubscription.objects.create(
        user=customer_user,
        onesignal_subscription_id=sub_id,
        onesignal_external_id=str(customer_user.id),
        platform=CustomerPushSubscription.Platform.WEB,
        is_active=True,
    )

    response = auth_client.post(
        "/api/v1/customer/push-subscriptions/sync/",
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


def test_customer_push_replaces_older_active_web_subscription(
    auth_client: APIClient,
    customer_user: User,
):
    sub_old_id = str(uuid.uuid4())
    sub_new_id = str(uuid.uuid4())

    sub_old = CustomerPushSubscription.objects.create(
        user=customer_user,
        onesignal_subscription_id=sub_old_id,
        onesignal_external_id=str(customer_user.id),
        platform=CustomerPushSubscription.Platform.WEB,
        is_active=True,
    )

    response = auth_client.post(
        "/api/v1/customer/push-subscriptions/sync/",
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
    sub_new = CustomerPushSubscription.objects.get(onesignal_subscription_id=sub_new_id)

    assert sub_old.is_active is False
    assert sub_new.is_active is True


def test_customer_push_cross_user_denied(
    customer_user: User,
    other_customer_user: User,
):
    sub_id = str(uuid.uuid4())
    CustomerPushSubscription.objects.create(
        user=customer_user,
        onesignal_subscription_id=sub_id,
        onesignal_external_id=str(customer_user.id),
        platform=CustomerPushSubscription.Platform.WEB,
        is_active=True,
    )

    other_client = APIClient()
    other_client.force_authenticate(user=other_customer_user)

    response = other_client.post(
        "/api/v1/customer/push-subscriptions/sync/",
        {
            "onesignal_subscription_id": sub_id,
            "is_active": True,
        },
        format="json",
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_customer_push_validation_empty_id(auth_client: APIClient):
    response = auth_client.post(
        "/api/v1/customer/push-subscriptions/sync/",
        {
            "onesignal_subscription_id": "   ",
        },
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST


def test_customer_push_patch_and_delete(
    auth_client: APIClient,
    customer_user: User,
    other_customer_user: User,
):
    sub_id = str(uuid.uuid4())
    sub = CustomerPushSubscription.objects.create(
        user=customer_user,
        onesignal_subscription_id=sub_id,
        onesignal_external_id=str(customer_user.id),
        platform=CustomerPushSubscription.Platform.WEB,
        is_active=True,
        opted_in=True,
    )

    # Cross-user PATCH rejected
    other_client = APIClient()
    other_client.force_authenticate(user=other_customer_user)
    patch_forbidden = other_client.patch(
        f"/api/v1/customer/push-subscriptions/{sub_id}/",
        {"opted_in": False},
        format="json",
    )
    assert patch_forbidden.status_code == status.HTTP_403_FORBIDDEN

    # Owner PATCH succeeds
    patch_res = auth_client.patch(
        f"/api/v1/customer/push-subscriptions/{sub_id}/",
        {"opted_in": False},
        format="json",
    )
    assert patch_res.status_code == status.HTTP_200_OK
    assert patch_res.json()["opted_in"] is False
    assert patch_res.json()["is_active"] is False

    # Cross-user DELETE rejected
    delete_forbidden = other_client.delete(
        f"/api/v1/customer/push-subscriptions/{sub_id}/",
    )
    assert delete_forbidden.status_code == status.HTTP_403_FORBIDDEN

    # Owner DELETE succeeds
    delete_res = auth_client.delete(
        f"/api/v1/customer/push-subscriptions/{sub_id}/",
    )
    assert delete_res.status_code == status.HTTP_204_NO_CONTENT
    sub.refresh_from_db()
    assert sub.is_active is False
    assert sub.opted_in is False


def test_customer_push_reachability(customer_user: User):
    # 1. No subscription
    res_none = get_customer_push_reachability(customer_user)
    assert res_none["reachable"] is False
    assert res_none["reason"] == CustomerPushReachabilityReason.NO_ACTIVE_SUBSCRIPTION
    assert res_none["subscription_id"] is None

    # Unauthenticated / None user
    assert get_customer_push_reachability(None)["reachable"] is False

    # 2. Active subscription
    sub_id = str(uuid.uuid4())
    sub = CustomerPushSubscription.objects.create(
        user=customer_user,
        onesignal_subscription_id=sub_id,
        onesignal_external_id=str(customer_user.id),
        platform=CustomerPushSubscription.Platform.WEB,
        is_active=True,
        opted_in=True,
        permission_state="granted",
        last_verified_at=timezone.now(),
    )
    res_active = get_customer_push_reachability(customer_user)
    assert res_active["reachable"] is True
    assert res_active["reason"] == CustomerPushReachabilityReason.ACTIVE_SUBSCRIPTION
    assert res_active["subscription_id"] == sub_id

    # 3. Opted out
    sub.opted_in = False
    sub.is_active = False
    sub.save()
    res_optout = get_customer_push_reachability(customer_user)
    assert res_optout["reachable"] is False
    assert res_optout["reason"] == CustomerPushReachabilityReason.OPTED_OUT

    # 4. Permission denied
    sub.opted_in = True
    sub.permission_state = "denied"
    sub.is_active = False
    sub.save()
    res_denied = get_customer_push_reachability(customer_user)
    assert res_denied["reachable"] is False
    assert res_denied["reason"] == CustomerPushReachabilityReason.PERMISSION_DENIED

    # 5. Stale subscription (> 30 days)
    sub.permission_state = "granted"
    sub.opted_in = True
    sub.is_active = True
    sub.last_verified_at = timezone.now() - timedelta(days=35)
    sub.save()
    res_stale = get_customer_push_reachability(customer_user)
    assert res_stale["reachable"] is False
    assert res_stale["reason"] == CustomerPushReachabilityReason.STALE_SUBSCRIPTION
    assert res_stale["subscription_id"] == sub_id

