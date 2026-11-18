"""Account deletion: closing, the grace period, holds, erasure and the Operations queue."""

import uuid
from datetime import timedelta
from decimal import Decimal
from http import HTTPStatus
from typing import Any

import pytest
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient

from apps.identity import account_deletion
from apps.identity.account_deletion import (
    AccountDeletionRefusedError,
    DeletionHold,
    hold_deletion,
    process_due_account_deletions,
    release_deletion,
    request_account_deletion,
)
from apps.identity.models import PrivacyRequest, Role, User, UserRole, UserSession
from apps.locations.models import Address
from apps.notifications.models import NotificationIntent
from apps.partners.models import (
    PartnerApplication,
    PartnerDocument,
    PartnerProfile,
)
from apps.payouts.models import PartnerPayoutAccount
from tests.fulfilment.conftest import create_booked_group
from tests.helpers import force_role_client

pytestmark = pytest.mark.django_db

PHONE = "9876543210"
CANONICAL = "+919876543210"


@pytest.fixture(autouse=True)
def clear_rate_limit_cache() -> None:
    cache.clear()


def _sign_in(phone: str = PHONE) -> APIClient:
    client = APIClient()
    issued = client.post("/api/v1/auth/otp/request/", {"phone_number": phone}, format="json").json()
    verified = client.post(
        "/api/v1/auth/otp/verify/",
        {
            "challenge_id": issued["challenge_id"],
            "phone_number": phone,
            "code": issued["development_code"],
        },
        format="json",
    )
    assert verified.status_code == HTTPStatus.OK, verified.json()
    return client


def _make_due(privacy_request: PrivacyRequest) -> None:
    PrivacyRequest.objects.filter(id=privacy_request.id).update(
        scheduled_for=timezone.now() - timedelta(minutes=1)
    )


def _operations_client(*, stepped_up: bool = False) -> APIClient:
    user = User.objects.create_user(
        phone_number=f"+919{uuid.uuid4().int % 10**9:09d}", full_name="Asha Ops"
    )
    role, _ = Role.objects.get_or_create(code="operations", defaults={"name": "Operations"})
    UserRole.objects.get_or_create(user=user, role=role, revoked_at=None)
    client = force_role_client(user=user, role_code="operations")
    if stepped_up:
        UserSession.objects.filter(user=user, active_role=role).update(stepped_up_at=timezone.now())
    return client


def _address(user: User) -> Address:
    return Address.objects.create(
        customer=user,
        label="Home",
        line1="Flat 402, Lake View Apartments",
        line2="Road 12",
        landmark="Opposite the park",
        locality="Banjara Hills",
        city="Hyderabad",
        state="Telangana",
        postal_code="500034",
        latitude=Decimal("17.412345"),
        longitude=Decimal("78.443210"),
        confirmed_at=timezone.now(),
        is_default=True,
    )


class _FakeStorage:
    def __init__(self) -> None:
        self.deleted: list[str] = []

    def delete_object(self, *, object_key: str) -> None:
        self.deleted.append(object_key)


def test_erasure_request_closes_the_account_and_schedules_the_deletion() -> None:
    other_device = _sign_in()
    this_device = _sign_in()
    user = User.objects.get(phone_number=CANONICAL)

    response = this_device.post(
        "/api/v1/auth/privacy/requests/", {"kind": "ERASURE"}, format="json"
    )

    assert response.status_code == HTTPStatus.CREATED, response.json()
    body = response.json()
    assert body["status"] == "RECEIVED"
    privacy_request = PrivacyRequest.objects.get(id=body["id"])
    assert privacy_request.scheduled_for is not None
    expected = privacy_request.requested_at + timedelta(days=30)
    assert abs((privacy_request.scheduled_for - expected).total_seconds()) < 1
    # Signed out everywhere else at once; this device only for a few minutes.
    assert other_device.get("/api/v1/auth/session/").status_code in {
        HTTPStatus.UNAUTHORIZED,
        HTTPStatus.FORBIDDEN,
    }
    live = UserSession.objects.filter(user=user, revoked_at__isnull=True)
    assert live.count() == 1
    remaining = live.get().expires_at - timezone.now()
    assert remaining <= account_deletion.CURRENT_SESSION_GRACE


def test_repeating_the_request_returns_the_open_one() -> None:
    user = User.objects.create_user(phone_number=CANONICAL)

    first = request_account_deletion(user=user, current_session_key=None)
    second = request_account_deletion(user=user, current_session_key=None)

    assert first.id == second.id
    assert PrivacyRequest.objects.filter(user=user, kind="ERASURE").count() == 1


def test_open_bookings_refuse_the_request() -> None:
    booked = create_booked_group(key_prefix="deletion-open-work")

    with pytest.raises(AccountDeletionRefusedError) as refused:
        request_account_deletion(user=booked.customer, current_session_key=None)

    assert refused.value.code == "account_deletion_open_work"
    assert not PrivacyRequest.objects.filter(user=booked.customer, kind="ERASURE").exists()


def test_signing_in_again_cancels_the_deletion_and_says_so(
    django_capture_on_commit_callbacks: Any,
) -> None:
    _sign_in()
    user = User.objects.get(phone_number=CANONICAL)
    privacy_request = request_account_deletion(user=user, current_session_key=None)

    # The notice is sent once the cancellation commits.
    with django_capture_on_commit_callbacks(execute=True):
        _sign_in()

    privacy_request.refresh_from_db()
    assert privacy_request.status == PrivacyRequest.Status.CANCELLED
    assert privacy_request.cancelled_at is not None
    assert NotificationIntent.objects.filter(
        recipient=user, template_code="account_deletion_cancelled"
    ).exists()


def test_a_due_deletion_erases_the_identity_and_scrubs_addresses() -> None:
    _sign_in()
    user = User.objects.get(phone_number=CANONICAL)
    User.objects.filter(pk=user.pk).update(full_name="Ravi Kumar", email="ravi@example.com")
    address = _address(user)
    privacy_request = request_account_deletion(user=user, current_session_key=None)
    _make_due(privacy_request)

    result = process_due_account_deletions()

    assert result == {"erased": 1, "held": 0, "failed": 0}
    privacy_request.refresh_from_db()
    assert privacy_request.status == PrivacyRequest.Status.COMPLETED
    user.refresh_from_db()
    assert user.phone_number.startswith("erased-")
    assert user.full_name == ""
    assert user.email == ""
    assert user.is_active is False
    assert not user.has_usable_password()
    address.refresh_from_db()
    assert address.line1 == ""
    assert address.landmark == ""
    assert address.archived_at is not None
    assert address.latitude == Decimal("17.41")
    assert not UserSession.objects.filter(user=user, revoked_at__isnull=True).exists()
    # The same number can sign up again as a new, empty account.
    _sign_in()
    assert User.objects.filter(phone_number=CANONICAL).exclude(pk=user.pk).exists()


def test_partner_erasure_deletes_files_offboards_and_retires_the_payout_account(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    storage = _FakeStorage()
    monkeypatch.setattr("apps.partners.storage.get_document_storage", lambda: storage)
    user = User.objects.create_user(phone_number=CANONICAL, full_name="Ravi Kumar")
    partner = PartnerProfile.objects.create(
        user=user,
        display_name="Ravi Electricals",
        photo_object_key="partners/photos/ravi.jpg",
        photo_status=PartnerProfile.PhotoStatus.PENDING,
    )
    application = PartnerApplication.objects.create(
        partner=partner, status=PartnerApplication.Status.APPROVED
    )
    PartnerDocument.objects.create(
        application=application,
        kind=PartnerDocument.Kind.GOVERNMENT_ID,
        version=1,
        object_key="partners/documents/ravi-aadhaar.pdf",
        content_type="application/pdf",
        size_bytes=1024,
        sha256="a" * 64,
    )
    PartnerPayoutAccount.objects.create(
        partner=partner,
        status=PartnerPayoutAccount.Status.VERIFIED,
        account_last4="4321",
        ifsc="HDFC0001234",
        holder_name="Ravi Kumar",
        effective_from=timezone.now(),
    )
    privacy_request = request_account_deletion(user=user, current_session_key=None)
    _make_due(privacy_request)

    assert process_due_account_deletions()["erased"] == 1

    assert sorted(storage.deleted) == [
        "partners/documents/ravi-aadhaar.pdf",
        "partners/photos/ravi.jpg",
    ]
    partner.refresh_from_db()
    assert partner.display_name == account_deletion.ERASED_PARTNER_NAME
    assert partner.photo_object_key == ""
    assert partner.photo_status == PartnerProfile.PhotoStatus.NONE
    application.refresh_from_db()
    assert application.status == PartnerApplication.Status.OFFBOARDED
    assert not PartnerDocument.objects.filter(application=application).exclude(object_key="")
    account = PartnerPayoutAccount.objects.get(partner=partner)
    assert account.status == PartnerPayoutAccount.Status.REPLACED
    assert account.account_last4 == "4321"


def test_a_hold_moves_the_request_to_review_and_is_rechecked_every_run(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = User.objects.create_user(phone_number=CANONICAL)
    privacy_request = request_account_deletion(user=user, current_session_key=None)
    _make_due(privacy_request)
    owed = DeletionHold(kind=account_deletion.HOLD_MONEY_OWED, detail="₹120.00 still to pay.")
    monkeypatch.setattr(account_deletion, "deletion_holds", lambda _user: [owed])

    assert process_due_account_deletions() == {"erased": 0, "held": 1, "failed": 0}
    privacy_request.refresh_from_db()
    assert privacy_request.status == PrivacyRequest.Status.IN_REVIEW
    assert privacy_request.handled_by is None
    assert "₹120.00 still to pay." in privacy_request.notes

    monkeypatch.setattr(account_deletion, "deletion_holds", lambda _user: [])
    assert process_due_account_deletions()["erased"] == 1
    privacy_request.refresh_from_db()
    assert privacy_request.status == PrivacyRequest.Status.COMPLETED


def test_an_operator_hold_waits_for_a_release() -> None:
    operator = User.objects.create_user(phone_number="+919811112222")
    user = User.objects.create_user(phone_number=CANONICAL)
    privacy_request = request_account_deletion(user=user, current_session_key=None)
    _make_due(privacy_request)

    hold_deletion(
        privacy_request_id=privacy_request.id, actor=operator, reason="Open police request."
    )
    assert process_due_account_deletions()["erased"] == 0
    privacy_request.refresh_from_db()
    assert privacy_request.status == PrivacyRequest.Status.IN_REVIEW

    release_deletion(privacy_request_id=privacy_request.id, actor=operator)
    assert process_due_account_deletions()["erased"] == 1


def test_the_operations_queue_and_erase_now_need_the_right_access() -> None:
    customer = _sign_in()
    user = User.objects.get(phone_number=CANONICAL)
    privacy_request = request_account_deletion(user=user, current_session_key=None)

    assert customer.get("/api/v1/operations/privacy-requests/").status_code in {
        HTTPStatus.UNAUTHORIZED,
        HTTPStatus.FORBIDDEN,
    }

    operations = _operations_client()
    queue = operations.get("/api/v1/operations/privacy-requests/")
    assert queue.status_code == HTTPStatus.OK
    row = next(item for item in queue.json() if item["id"] == str(privacy_request.id))
    assert row["person"]["phone_number"] == CANONICAL
    assert row["holds"] == []

    erase_url = f"/api/v1/operations/privacy-requests/{privacy_request.id}/erase/"
    assert operations.post(erase_url).status_code == HTTPStatus.FORBIDDEN

    stepped_up = _operations_client(stepped_up=True)
    erased = stepped_up.post(erase_url)
    assert erased.status_code == HTTPStatus.OK, erased.json()
    assert erased.json()["status"] == "COMPLETED"


def test_operations_can_file_a_deletion_for_someone_who_called_support() -> None:
    user = User.objects.create_user(phone_number=CANONICAL)
    operations = _operations_client()

    response = operations.post(
        f"/api/v1/operations/users/{user.id}/deletion-request/",
        {"reason": "Called from the registered number; identity checked by OTP."},
        format="json",
    )

    assert response.status_code == HTTPStatus.CREATED, response.json()
    body: dict[str, Any] = response.json()
    assert body["status"] == "RECEIVED"
    assert body["notes"].startswith("Filed by Operations:")
    assert body["handled_by_name"] == "Asha Ops"
