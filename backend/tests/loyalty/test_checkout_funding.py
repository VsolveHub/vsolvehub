"""Checkout wallet and coin funding through payment-attempt creation."""

# Amount assertions are the scenario, not unexplained literals.
# ruff: noqa: PLR2004

from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from http import HTTPStatus

import pytest
from django.db import close_old_connections
from django.utils import timezone
from rest_framework.test import APIClient

from apps.commerce.models import PaymentAllocation, PaymentAttempt
from apps.commerce.providers import FakePaymentProvider, ProviderPayment
from apps.commerce.services import (
    apply_provider_payment,
    create_provider_order,
    initiate_payment_attempt,
    request_unit_refund,
    submit_refund,
)
from apps.commerce.services.loyalty_funding import split_refund_amounts
from apps.identity.models import User
from apps.loyalty.models import CoinBurnPolicy, CoinGrant, CoinTransaction
from apps.loyalty.services.coins import expire_due_coin_grants
from apps.wallet.models import WalletTransaction
from apps.wallet.services import credit_wallet, get_or_create_wallet
from tests.commerce.test_payment_capture import _payment_ready_group

pytestmark = pytest.mark.django_db(transaction=True)


def test_split_refund_restores_wallet_and_drops_coins() -> None:
    attempt = PaymentAttempt(
        amount_paise=50000,
        wallet_reserved_paise=20000,
        coin_discount_paise=10000,
        coins_burned=100,
    )
    wallet_credit, gateway = split_refund_amounts(attempt=attempt, refund_paise=50000)
    assert wallet_credit == 20000
    assert gateway == 20000


def test_split_refund_caps_gateway_across_partial_refunds() -> None:
    """Integer rounding must not refund more to the provider than was ever charged."""
    attempt = PaymentAttempt(
        amount_paise=100,
        wallet_reserved_paise=33,
        coin_discount_paise=33,
        coins_burned=33,
    )
    gateway_total = 0
    for chunk in (33, 33, 34):
        _wallet, gateway = split_refund_amounts(attempt=attempt, refund_paise=chunk)
        gateway_total += gateway
    assert gateway_total == 34


def test_checkout_reserves_wallet_and_coins_and_charges_the_remainder(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("apps.foundation.services._queue_outbox_event", lambda _event_id: None)
    _client, customer, checkout, _group = _payment_ready_group()
    total = checkout.quote.total_paise
    wallet_part = min(2000, total // 5)
    CoinBurnPolicy.objects.filter(is_active=True).update(is_active=False)
    CoinBurnPolicy.objects.create(max_burn_percent=30, coin_value_paise=10, is_active=True)
    CoinGrant.objects.create(
        customer=customer,
        coins_amount=50,
        locked_coins=0,
        spendable_coins=50,
        status=CoinGrant.Status.UNLOCKED,
    )
    credit_wallet(
        wallet=get_or_create_wallet(customer),
        amount_paise=wallet_part,
        kind=WalletTransaction.Kind.TOP_UP,
        idempotency_key="checkout-funding-topup",
    )

    attempt = initiate_payment_attempt(
        checkout_id=checkout.id,
        customer_id=customer.id,
        expected_checkout_version=checkout.version,
        idempotency_key="checkout-funding",
        wallet_amount_paise=wallet_part,
        coin_burn_amount=50,
    )

    allocation_total = sum(
        PaymentAllocation.objects.filter(payment_attempt=attempt).values_list(
            "amount_paise", flat=True
        )
    )
    assert allocation_total == attempt.amount_paise == total
    assert attempt.wallet_reserved_paise == wallet_part
    assert attempt.coins_burned == 50
    assert attempt.coin_discount_paise == 500
    assert attempt.gateway_amount_paise == total - wallet_part - 500
    assert get_or_create_wallet(customer).available_balance_paise == 0


def test_failed_provider_payment_releases_wallet_and_coins(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("apps.foundation.services._queue_outbox_event", lambda _event_id: None)
    _client, customer, checkout, _group = _payment_ready_group()
    CoinBurnPolicy.objects.filter(is_active=True).update(is_active=False)
    CoinBurnPolicy.objects.create(max_burn_percent=30, coin_value_paise=10, is_active=True)
    grant = CoinGrant.objects.create(
        customer=customer,
        coins_amount=20,
        locked_coins=0,
        spendable_coins=20,
        status=CoinGrant.Status.UNLOCKED,
    )
    credit_wallet(
        wallet=get_or_create_wallet(customer),
        amount_paise=1000,
        kind=WalletTransaction.Kind.TOP_UP,
        idempotency_key="release-topup",
    )
    attempt = initiate_payment_attempt(
        checkout_id=checkout.id,
        customer_id=customer.id,
        expected_checkout_version=checkout.version,
        idempotency_key="release-on-fail",
        wallet_amount_paise=1000,
        coin_burn_amount=20,
    )
    created = create_provider_order(attempt_id=attempt.id)
    apply_provider_payment(
        payment=ProviderPayment(
            provider_payment_id="fake_fail_loyalty",
            provider_order_id=created.provider_order_id,
            amount_paise=created.gateway_amount_paise,
            currency="INR",
            status="failed",
        )
    )
    grant.refresh_from_db()
    assert grant.spendable_coins == 20
    assert get_or_create_wallet(customer).available_balance_paise == 1000
    assert not CoinTransaction.objects.filter(
        payment_attempt=attempt, kind=CoinTransaction.Kind.BURN
    ).exists()


def test_refund_restores_wallet_share_and_not_coins(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("apps.foundation.services._queue_outbox_event", lambda _event_id: None)
    _client, customer, checkout, group = _payment_ready_group()
    CoinBurnPolicy.objects.filter(is_active=True).update(is_active=False)
    CoinBurnPolicy.objects.create(max_burn_percent=30, coin_value_paise=10, is_active=True)
    grant = CoinGrant.objects.create(
        customer=customer,
        coins_amount=10,
        locked_coins=0,
        spendable_coins=10,
        status=CoinGrant.Status.UNLOCKED,
    )
    credit_wallet(
        wallet=get_or_create_wallet(customer),
        amount_paise=1500,
        kind=WalletTransaction.Kind.TOP_UP,
        idempotency_key="refund-topup",
    )
    attempt = initiate_payment_attempt(
        checkout_id=checkout.id,
        customer_id=customer.id,
        expected_checkout_version=checkout.version,
        idempotency_key="refund-loyalty",
        wallet_amount_paise=1500,
        coin_burn_amount=10,
    )
    created = create_provider_order(attempt_id=attempt.id)
    FakePaymentProvider.record_payment(
        provider_payment_id="fake_loyalty_capture",
        provider_order_id=created.provider_order_id,
        amount_paise=created.gateway_amount_paise,
        currency="INR",
        status="captured",
    )
    apply_provider_payment(
        payment=ProviderPayment(
            provider_payment_id="fake_loyalty_capture",
            provider_order_id=created.provider_order_id,
            amount_paise=created.gateway_amount_paise,
            currency="INR",
            status="captured",
        )
    )
    grant.refresh_from_db()
    assert grant.spendable_coins == 0
    assert grant.burned_coins == 10

    unit_ids = list(group.units.values_list("id", flat=True))
    refund = request_unit_refund(
        order_id=group.order.id,
        unit_ids=unit_ids,
        reason_code="customer_cancelled",
        idempotency_key="refund-loyalty-1",
        requested_by_id=customer.id,
    )
    submit_refund(refund_id=refund.id)
    refund.refresh_from_db()
    assert refund.status == "SUCCEEDED"
    assert refund.wallet_credit_paise == 1500
    grant.refresh_from_db()
    assert grant.burned_coins == 10
    assert grant.spendable_coins == 0
    assert (
        WalletTransaction.objects.filter(
            wallet__customer=customer,
            kind=WalletTransaction.Kind.REFUND_CREDIT,
            amount_paise=1500,
        ).count()
        == 1
    )


def test_parallel_attempts_cannot_reserve_the_same_wallet(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("apps.foundation.services._queue_outbox_event", lambda _event_id: None)
    _client, customer, checkout, _group = _payment_ready_group()
    credit_wallet(
        wallet=get_or_create_wallet(customer),
        amount_paise=3000,
        kind=WalletTransaction.Kind.TOP_UP,
        idempotency_key="parallel-topup",
    )

    def start(key: str) -> str:
        close_old_connections()
        try:
            initiate_payment_attempt(
                checkout_id=checkout.id,
                customer_id=customer.id,
                expected_checkout_version=checkout.version,
                idempotency_key=key,
                wallet_amount_paise=3000,
                coin_burn_amount=0,
            )
            return "ok"
        except ValueError:
            return "refused"
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(start, ("parallel-a", "parallel-b")))
    assert results.count("ok") == 1
    assert results.count("refused") == 1
    assert get_or_create_wallet(customer).available_balance_paise == 0


def test_expire_due_coins_writes_expire_rows() -> None:
    user = User.objects.create_user(phone_number="+919700000111")
    CoinGrant.objects.create(
        customer=user,
        coins_amount=15,
        locked_coins=0,
        spendable_coins=15,
        status=CoinGrant.Status.UNLOCKED,
        expires_at=timezone.now() - timedelta(days=1),
    )
    assert expire_due_coin_grants() == 1
    expired = CoinTransaction.objects.filter(
        customer=user, kind=CoinTransaction.Kind.EXPIRE
    ).count()
    assert expired == 1


def test_payment_attempt_api_accepts_loyalty_modifiers(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("apps.foundation.services._queue_outbox_event", lambda _event_id: None)
    client, customer, checkout, _group = _payment_ready_group()
    credit_wallet(
        wallet=get_or_create_wallet(customer),
        amount_paise=500,
        kind=WalletTransaction.Kind.TOP_UP,
        idempotency_key="api-topup",
    )
    response = client.post(
        "/api/v1/payment-attempts/",
        {
            "checkout_id": str(checkout.id),
            "expected_checkout_version": checkout.version,
            "wallet_amount_paise": 500,
            "coin_burn_amount": 0,
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY="api-loyalty-pay",
    )
    assert response.status_code == HTTPStatus.ACCEPTED
    body = response.json()
    assert body["wallet_reserved_paise"] == 500
    assert body["coins_burned"] == 0
    assert body["razorpay_amount_paise"] == checkout.quote.total_paise - 500
    assert isinstance(client, APIClient)


def test_parallel_attempts_cannot_reserve_the_same_coins(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("apps.foundation.services._queue_outbox_event", lambda _event_id: None)
    _client, customer, checkout, _group = _payment_ready_group()
    from apps.loyalty.models import CoinLedger
    from apps.loyalty.services.coins import get_customer_coin_balances, issue_coins

    issue_coins(
        customer=customer,
        amount=50,
        idempotency_key="parallel-issue",
        source=CoinLedger.Source.MANUAL,
    )

    def start(key: str) -> str:
        close_old_connections()
        try:
            initiate_payment_attempt(
                checkout_id=checkout.id,
                customer_id=customer.id,
                expected_checkout_version=checkout.version,
                idempotency_key=key,
                wallet_amount_paise=0,
                coin_burn_amount=50,
            )
            return "ok"
        except ValueError:
            return "refused"
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(start, ("parallel-coin-a", "parallel-coin-b")))
    assert results.count("ok") == 1
    assert results.count("refused") == 1
    balances = get_customer_coin_balances(customer)
    assert balances["spendable_coins"] == 0
