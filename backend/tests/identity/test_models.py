from datetime import timedelta

import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.identity.models import Device, OtpChallenge, Role, User, UserRole

pytestmark = pytest.mark.django_db


def test_user_manager_normalizes_phone_and_password() -> None:
    user = User.objects.create_user("9876543210", "safe-test-password")

    assert user.phone_number == "+919876543210"
    assert user.check_password("safe-test-password")
    assert str(user) == "+919876543210"


def test_superuser_requires_privileged_flags() -> None:
    with pytest.raises(ValueError, match="is_staff"):
        User.objects.create_superuser(
            "9876543210",
            "safe-test-password",
            is_staff=False,
        )


def test_one_active_role_grant_per_user() -> None:
    user = User.objects.create_user("9876543210")
    role = Role.objects.create(code="customer", name="Customer")
    UserRole.objects.create(user=user, role=role)

    with pytest.raises(IntegrityError), transaction.atomic():
        UserRole.objects.create(user=user, role=role)


def test_revoked_role_can_be_granted_again() -> None:
    user = User.objects.create_user("9876543210")
    role = Role.objects.create(code="customer", name="Customer")
    UserRole.objects.create(user=user, role=role, revoked_at=timezone.now())

    active_grant = UserRole.objects.create(user=user, role=role)

    assert active_grant.revoked_at is None


def test_one_device_fingerprint_per_user() -> None:
    user = User.objects.create_user("9876543210")
    Device.objects.create(user=user, fingerprint_hash="a" * 64)

    with pytest.raises(IntegrityError), transaction.atomic():
        Device.objects.create(user=user, fingerprint_hash="a" * 64)


def test_otp_state_properties() -> None:
    challenge = OtpChallenge(
        phone_number="+919876543210",
        purpose=OtpChallenge.Purpose.LOGIN,
        code_hash="hash",
        request_ip_hash="a" * 64,
        expires_at=timezone.now() + timedelta(minutes=5),
        failed_attempts=4,
        max_attempts=5,
    )

    assert challenge.is_consumed is False
    assert challenge.is_expired is False
    assert challenge.is_locked is False

    challenge.failed_attempts = 5
    challenge.consumed_at = timezone.now()
    challenge.expires_at = timezone.now() - timedelta(seconds=1)

    assert challenge.is_consumed is True
    assert challenge.is_expired is True
    assert challenge.is_locked is True
