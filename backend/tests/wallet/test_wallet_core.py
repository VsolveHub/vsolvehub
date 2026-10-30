"""Unit and API tests for customer prepaid wallet (ADR-0010, M3-BE-211..215)."""

# ruff: noqa: S106

from http import HTTPStatus

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from apps.commerce.services.simulation import simulate_capture
from apps.identity.models import User
from apps.wallet.models import WalletTransaction
from apps.wallet.services import (
    InsufficientWalletBalanceError,
    WalletTopUpPolicyViolationError,
    capture_wallet,
    credit_wallet,
    get_active_top_up_policy,
    get_or_create_wallet,
    release_wallet,
    reserve_wallet,
    validate_top_up_amount,
)

pytestmark = pytest.mark.django_db(transaction=True)


def _user(suffix: str = "1") -> User:
    return User.objects.create_user(phone_number=f"+9198765{suffix.zfill(5)}")


def test_get_or_create_wallet() -> None:
    user = _user("101")
    wallet = get_or_create_wallet(user)
    assert wallet.customer == user
    assert wallet.balance_paise == 0
    assert wallet.available_balance_paise == 0

    # Idempotent retrieval
    wallet2 = get_or_create_wallet(user)
    assert wallet.id == wallet2.id


def test_credit_wallet_increases_balance_and_is_idempotent() -> None:
    user = _user("102")
    wallet = get_or_create_wallet(user)

    txn = credit_wallet(
        wallet=wallet,
        amount_paise=50000,  # ₹500
        kind=WalletTransaction.Kind.TOP_UP,
        idempotency_key="credit-1",
        notes="First top up",
    )
    assert txn.status == WalletTransaction.Status.CAPTURED
    assert wallet.balance_paise == 50000
    assert wallet.available_balance_paise == 50000

    # Replay with same idempotency key returns same txn without double-crediting
    txn2 = credit_wallet(
        wallet=wallet,
        amount_paise=50000,
        kind=WalletTransaction.Kind.TOP_UP,
        idempotency_key="credit-1",
    )
    assert txn.id == txn2.id
    assert wallet.balance_paise == 50000


def test_reserve_wallet_decreases_available_balance_and_prevents_overspend() -> None:
    user = _user("103")
    wallet = get_or_create_wallet(user)
    credit_wallet(wallet=wallet, amount_paise=50000, kind=WalletTransaction.Kind.TOP_UP)

    # Reserve ₹300
    res_txn = reserve_wallet(
        wallet=wallet,
        amount_paise=30000,
        idempotency_key="res-1",
    )
    assert res_txn.status == WalletTransaction.Status.RESERVED
    assert res_txn.amount_paise == -30000
    assert wallet.reserved_paise == 30000
    assert wallet.available_balance_paise == 20000  # ₹500 - ₹300 = ₹200 available

    # Second attempt trying to spend ₹250 must fail because only ₹200 is available
    with pytest.raises(InsufficientWalletBalanceError, match="exceeds available balance"):
        reserve_wallet(wallet=wallet, amount_paise=25000)

    # Spending ₹200 succeeds
    res_txn2 = reserve_wallet(wallet=wallet, amount_paise=20000, idempotency_key="res-2")
    assert res_txn2.status == WalletTransaction.Status.RESERVED
    assert wallet.available_balance_paise == 0


def test_capture_and_release_wallet() -> None:
    user = _user("104")
    wallet = get_or_create_wallet(user)
    credit_wallet(wallet=wallet, amount_paise=50000, kind=WalletTransaction.Kind.TOP_UP)

    res_txn = reserve_wallet(wallet=wallet, amount_paise=20000, idempotency_key="res-cap")
    assert wallet.available_balance_paise == 30000

    # Capture converts reservation to CAPTURED
    cap_txn = capture_wallet(wallet=wallet, reservation_transaction_id=res_txn.id)
    assert cap_txn.status == WalletTransaction.Status.CAPTURED
    assert wallet.balance_paise == 30000  # ₹500 - ₹200 = ₹300 settled
    assert wallet.available_balance_paise == 30000
    assert wallet.reserved_paise == 0

    # Reserve another ₹100 and then release it
    res_txn2 = reserve_wallet(wallet=wallet, amount_paise=10000, idempotency_key="res-rel")
    assert wallet.available_balance_paise == 20000
    rel_txn = release_wallet(wallet=wallet, reservation_transaction_id=res_txn2.id)
    assert rel_txn.status == WalletTransaction.Status.RELEASED
    assert wallet.available_balance_paise == 30000  # restored


def test_top_up_policy_validation() -> None:
    policy = get_active_top_up_policy()
    # Below min (e.g. ₹50 when min is ₹100)
    with pytest.raises(WalletTopUpPolicyViolationError, match="below minimum"):
        validate_top_up_amount(policy.min_paise - 100)

    # Above max (e.g. ₹20,000 when max is ₹10,000)
    with pytest.raises(WalletTopUpPolicyViolationError, match="exceeds maximum"):
        validate_top_up_amount(policy.max_paise + 100)

    # Valid amount does not raise
    validate_top_up_amount(policy.min_paise)
    validate_top_up_amount(policy.max_paise)


@override_settings(PAYMENTS_ALLOW_SIMULATED_CAPTURE=True)
def test_top_up_api_flow() -> None:
    user = _user("105")
    client = APIClient()
    client.force_authenticate(user)

    response = client.post(
        "/api/v1/customer/wallet/top-up/",
        {"amount_paise": 50000, "idempotency_key": "top-105"},
        format="json",
    )
    assert response.status_code == HTTPStatus.ACCEPTED
    data = response.json()
    assert data["purpose"] == "WALLET_TOP_UP"
    assert data["amount_paise"] == 50000

    # Wallet has transaction in RESERVED state until payment capture
    wallet = get_or_create_wallet(user)
    txn = wallet.transactions.first()
    assert txn.status == WalletTransaction.Status.RESERVED
    assert wallet.available_balance_paise == 0

    # Simulate payment capture
    simulate_capture(attempt_id=data["payment_attempt_id"], customer_id=user.id)
    wallet.refresh_from_db()
    txn.refresh_from_db()
    assert txn.status == WalletTransaction.Status.CAPTURED
    assert wallet.balance_paise == 50000
    assert wallet.available_balance_paise == 50000


def test_customer_wallet_read_api() -> None:
    user = _user("106")
    wallet = get_or_create_wallet(user)
    credit_wallet(wallet=wallet, amount_paise=25000, kind=WalletTransaction.Kind.TOP_UP)

    client = APIClient()
    client.force_authenticate(user)
    response = client.get("/api/v1/customer/wallet/")
    assert response.status_code == HTTPStatus.OK
    data = response.json()
    assert data["balance_paise"] == 25000
    assert data["available_balance_paise"] == 25000
    assert data["currency"] == "INR"
    assert "top_up_policy" in data


def test_customer_wallet_transactions_api() -> None:
    user = _user("107")
    wallet = get_or_create_wallet(user)
    credit_wallet(wallet=wallet, amount_paise=10000, kind=WalletTransaction.Kind.TOP_UP)
    credit_wallet(wallet=wallet, amount_paise=20000, kind=WalletTransaction.Kind.REFERRAL_CREDIT)

    client = APIClient()
    client.force_authenticate(user)
    response = client.get("/api/v1/customer/wallet/transactions/")
    assert response.status_code == HTTPStatus.OK
    data = response.json()
    # Cursor pages carry no total: counting every row is what paging avoids.
    assert data["next"] is None
    assert len(data["results"]) == 2


def test_ops_wallet_liability_api() -> None:
    admin = User.objects.create_superuser(phone_number="+919999900001", password="password")
    user = _user("108")
    wallet = get_or_create_wallet(user)
    credit_wallet(wallet=wallet, amount_paise=75000, kind=WalletTransaction.Kind.TOP_UP)

    client = APIClient()
    client.force_authenticate(admin)
    response = client.get("/api/v1/ops/wallet/liability/")
    assert response.status_code == HTTPStatus.OK
    data = response.json()
    assert data["total_liability_paise"] >= 75000
    assert data["active_wallets_count"] >= 1
