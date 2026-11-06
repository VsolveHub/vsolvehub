"""Operations > Customers: find a customer by phone or name, read the record, block and unblock.

There was no customer page at all: the only lookup lived inside Wallet and rewards, for balance
corrections, and blocking an abusive account was not possible from the console.
"""

from datetime import timedelta
from http import HTTPStatus

import pytest
from django.contrib.auth.hashers import make_password
from django.utils import timezone
from rest_framework.test import APIClient

from apps.identity.models import (
    AccessAuditEvent,
    OtpChallenge,
    Role,
    User,
    UserRole,
    UserSession,
)
from apps.identity.services import (
    ACCOUNT_BLOCKED_ACTION,
    AccountBlockedError,
    provision_login_user,
    verify_login_otp,
)
from apps.partners.models import PartnerProfile
from tests.helpers import force_role_client

pytestmark = pytest.mark.django_db

CUSTOMERS_URL = "/api/v1/operations/customers/"


def _customer(phone: str, name: str) -> User:
    user, _created = provision_login_user(canonical_phone=phone)
    user.full_name = name
    user.save(update_fields=("full_name",))
    return user


@pytest.fixture
def operations_user() -> User:
    user = User.objects.create_user(phone_number="+919900000001", full_name="Ops Person")
    role, _created = Role.objects.get_or_create(code="operations", defaults={"name": "Operations"})
    UserRole.objects.create(user=user, role=role)
    return user


@pytest.fixture
def ops(operations_user: User) -> APIClient:
    return force_role_client(user=operations_user, role_code="operations")


def _ids(client: APIClient, q: str) -> list[str]:
    response = client.get(CUSTOMERS_URL, {"q": q})
    assert response.status_code == HTTPStatus.OK
    return [row["id"] for row in response.json()["results"]]


def test_finds_a_customer_by_phone_however_it_is_typed_or_by_name(ops: APIClient) -> None:
    asha = _customer("+919812345601", "Asha Reddy")
    _customer("+919812345602", "Ravi Kumar")

    for typed in ("98123 45601", "+91 98123-45601", "098123 45601", "Asha"):
        assert _ids(ops, typed) == [str(asha.id)], typed


def test_the_directory_lists_customers_only(ops: APIClient, operations_user: User) -> None:
    customer = _customer("+919812345601", "Asha Reddy")

    ids = _ids(ops, "")

    assert str(customer.id) in ids
    assert str(operations_user.id) not in ids


def test_the_record_shows_money_partner_link_and_no_invented_bookings(ops: APIClient) -> None:
    customer = _customer("+919812345601", "Asha Reddy")
    partner = PartnerProfile.objects.create(user=customer, display_name="Asha")

    body = ops.get(f"{CUSTOMERS_URL}{customer.id}/").json()

    assert body["phone_number"] == "+919812345601"
    assert body["is_blocked"] is False
    assert body["block"] is None
    assert body["partner_id"] == str(partner.id)
    assert body["wallet_balance_paise"] == 0
    assert body["coins_spendable"] == 0
    assert body["bookings"] == []
    assert body["open_quotes"] == []
    assert body["open_cases"] == []


def test_a_non_customer_has_no_customer_record(ops: APIClient, operations_user: User) -> None:
    response = ops.get(f"{CUSTOMERS_URL}{operations_user.id}/")

    assert response.status_code == HTTPStatus.NOT_FOUND


def test_blocking_signs_the_customer_out_everywhere_and_records_why(
    ops: APIClient, operations_user: User
) -> None:
    customer = _customer("+919812345601", "Asha Reddy")
    session = UserSession.objects.create(
        user=customer,
        session_key_hash="hash-1",
        expires_at=timezone.now() + timedelta(days=1),
    )

    response = ops.post(
        f"{CUSTOMERS_URL}{customer.id}/block/",
        {"blocked": True, "reason": "Abusive to partners"},
        format="json",
    )

    assert response.status_code == HTTPStatus.OK
    body = response.json()
    assert body["is_blocked"] is True
    assert body["block"]["reason"] == "Abusive to partners"
    assert body["block"]["by"] == "Ops Person"
    customer.refresh_from_db()
    session.refresh_from_db()
    assert customer.is_active is False
    assert session.revoked_at is not None
    event = AccessAuditEvent.objects.get(subject_user=customer, action=ACCOUNT_BLOCKED_ACTION)
    assert event.actor == operations_user


def test_blocking_twice_writes_one_history_row(ops: APIClient) -> None:
    customer = _customer("+919812345601", "Asha Reddy")
    url = f"{CUSTOMERS_URL}{customer.id}/block/"

    ops.post(url, {"blocked": True, "reason": "First"}, format="json")
    ops.post(url, {"blocked": True, "reason": "Again"}, format="json")

    assert (
        AccessAuditEvent.objects.filter(
            subject_user=customer, action=ACCOUNT_BLOCKED_ACTION
        ).count()
        == 1
    )


def test_unblocking_lets_them_back_in(ops: APIClient) -> None:
    customer = _customer("+919812345601", "Asha Reddy")
    url = f"{CUSTOMERS_URL}{customer.id}/block/"
    ops.post(url, {"blocked": True, "reason": "Mistake"}, format="json")

    body = ops.post(url, {"blocked": False, "reason": "Resolved on a call"}, format="json").json()

    assert body["is_blocked"] is False
    assert body["block"] is None
    customer.refresh_from_db()
    assert customer.is_active is True


def test_a_block_needs_a_reason(ops: APIClient) -> None:
    customer = _customer("+919812345601", "Asha Reddy")

    response = ops.post(
        f"{CUSTOMERS_URL}{customer.id}/block/", {"blocked": True, "reason": "  "}, format="json"
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST
    customer.refresh_from_db()
    assert customer.is_active is True


def test_staff_cannot_be_blocked_from_the_console(ops: APIClient) -> None:
    colleague = _customer("+919812345601", "Colleague")
    UserRole.objects.create(user=colleague, role=Role.objects.get(code="operations"))

    response = ops.post(
        f"{CUSTOMERS_URL}{colleague.id}/block/", {"blocked": True, "reason": "Test"}, format="json"
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST
    colleague.refresh_from_db()
    assert colleague.is_active is True


def test_only_operations_can_read_customers() -> None:
    customer = _customer("+919812345601", "Asha Reddy")
    client = force_role_client(user=customer, role_code="customer")

    assert client.get(CUSTOMERS_URL).status_code == HTTPStatus.FORBIDDEN


def test_a_blocked_account_is_refused_at_sign_in_with_a_clear_reason() -> None:
    """A right code used to sign a blocked person in to a session that then silently failed."""
    customer = _customer("+919812345601", "Asha Reddy")
    customer.is_active = False
    customer.save(update_fields=("is_active",))

    challenge = OtpChallenge.objects.create(
        phone_number=customer.phone_number,
        purpose=OtpChallenge.Purpose.LOGIN,
        code_hash=make_password("123456"),
        request_ip_hash="test-ip",
        delivery_status=OtpChallenge.DeliveryStatus.SENT,
        expires_at=timezone.now() + timedelta(minutes=5),
    )

    with pytest.raises(AccountBlockedError):
        verify_login_otp(
            challenge_id=challenge.id, phone_number=customer.phone_number, code="123456"
        )


def test_the_partner_activity_shows_their_balance_and_no_invented_work(ops: APIClient) -> None:
    """The partner record had no money or bookings; Operations had to open Payouts separately."""
    user = _customer("+919812345609", "Ravi Kumar")
    partner = PartnerProfile.objects.create(user=user, display_name="Ravi")

    response = ops.get(f"/api/v1/operations/partners/{partner.id}/activity/")

    assert response.status_code == HTTPStatus.OK
    body = response.json()
    assert body["bookings"] == []
    assert body["balance"]["available_paise"] == 0
    assert body["balance"]["paid_paise"] == 0


def test_an_unknown_partner_has_no_activity(ops: APIClient) -> None:
    response = ops.get("/api/v1/operations/partners/00000000-0000-0000-0000-000000000000/activity/")

    assert response.status_code == HTTPStatus.NOT_FOUND
