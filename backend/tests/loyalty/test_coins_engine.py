"""Unit and API tests for V Coins engine, burn math, and unlock triggers (ADR-0010)."""

# ruff: noqa: PLR2004

from datetime import timedelta
from http import HTTPStatus

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.foundation.models import OutboxEvent
from apps.identity.models import User
from apps.loyalty.models import (
    CoinBurnPolicy,
    CoinGrant,
    CoinGrantRule,
    CustomerCompletion,
)
from apps.loyalty.services.coins import (
    InsufficientCoinsError,
    calculate_coin_burn,
    get_customer_coin_balances,
    grant_coins,
    reserve_coins,
)
from apps.loyalty.services.completion import record_completion_for_customer

pytestmark = pytest.mark.django_db(transaction=True)


def _user(suffix: str = "1") -> User:
    return User.objects.create_user(phone_number=f"+9197654{suffix.zfill(5)}")


def test_coin_burn_math_respects_max_percent_and_coin_value() -> None:
    # The launch default is 20%; this test pins an explicit 30% policy.
    CoinBurnPolicy.objects.create(max_burn_percent=30, coin_value_paise=10, is_active=True)
    # 30% cap, 10 paise per coin
    # Order ₹1000 = 100,000 paise
    # 30% cap = 30,000 paise = 3,000 coins max burn
    result = calculate_coin_burn(
        order_payable_paise=100000,
        requested_coins=500,
        spendable_coins=1000,
    )
    assert result["max_burn_paise"] == 30000
    assert result["max_burn_coins"] == 3000
    assert result["applied_burn_coins"] == 500
    assert result["discount_paise"] == 5000  # 500 * 10 paise = ₹50
    assert result["remaining_payable_paise"] == 95000

    # If requested 4000 coins, it is capped at max_burn_coins (3000)
    result_capped = calculate_coin_burn(
        order_payable_paise=100000,
        requested_coins=4000,
        spendable_coins=5000,
    )
    assert result_capped["applied_burn_coins"] == 3000
    assert result_capped["discount_paise"] == 30000
    assert result_capped["remaining_payable_paise"] == 70000


def test_grant_coins_signup_creates_promised_and_locked_grants() -> None:
    user = _user("201")
    CoinGrantRule.objects.create(
        name="Welcome 500",
        earn_mode=CoinGrantRule.EarnMode.FLAT,
        coins_amount=500,
        completions_required=1,  # unlocks on 1st completion
        grant_trigger=CoinGrantRule.GrantTrigger.SIGNUP,
        customer_eligibility=CoinGrantRule.CustomerEligibility.ALL_CUSTOMERS,
    )

    grants = grant_coins(customer=user, trigger=CoinGrantRule.GrantTrigger.SIGNUP)
    assert len(grants) == 1
    grant = grants[0]
    assert grant.status == CoinGrant.Status.PROMISED
    assert grant.locked_coins == 500
    assert grant.spendable_coins == 0

    balances = get_customer_coin_balances(user)
    assert balances["spendable_coins"] == 0
    assert balances["promised_coins"] == 500
    assert balances["locked_coins"] == 500


def test_eligibility_filters_new_vs_existing() -> None:
    new_user = _user("202")
    existing_user = _user("203")

    # Mark existing_user as having 1 completion
    CustomerCompletion.objects.create(
        customer=existing_user,
        source_type="BOOKING",
        source_id="00000000-0000-0000-0000-000000000001",
        completed_at=timezone.now(),
    )

    CoinGrantRule.objects.create(
        name="New Customer Only",
        earn_mode=CoinGrantRule.EarnMode.FLAT,
        coins_amount=300,
        grant_trigger=CoinGrantRule.GrantTrigger.SIGNUP,
        customer_eligibility=CoinGrantRule.CustomerEligibility.NEW_CUSTOMER,
    )

    # new_user qualifies
    new_grants = grant_coins(customer=new_user, trigger=CoinGrantRule.GrantTrigger.SIGNUP)
    assert len(new_grants) == 1
    assert new_grants[0].coins_amount == 300

    # existing_user does NOT qualify
    existing_grants = grant_coins(customer=existing_user, trigger=CoinGrantRule.GrantTrigger.SIGNUP)
    assert len(existing_grants) == 0


def test_customer_completion_idempotency_and_coin_unlock() -> None:
    user = _user("204")
    CoinGrantRule.objects.create(
        name="First completion 1000",
        earn_mode=CoinGrantRule.EarnMode.FLAT,
        coins_amount=1000,
        completions_required=1,
        grant_trigger=CoinGrantRule.GrantTrigger.SIGNUP,
    )
    grant_coins(customer=user, trigger=CoinGrantRule.GrantTrigger.SIGNUP)
    assert get_customer_coin_balances(user)["spendable_coins"] == 0

    event = OutboxEvent(
        aggregate_type="booking",
        aggregate_id="11111111-1111-1111-1111-111111111111",
        event_type="customer.fulfilment.completed",
        payload={
            "event_version": 1,
            "customer_id": str(user.id),
            "booking_id": "11111111-1111-1111-1111-111111111111",
            "completed_at": timezone.now().isoformat(),
        },
    )

    # First delivery unlocks coins
    res1 = record_completion_for_customer(event)
    assert res1.created is True
    assert get_customer_coin_balances(user)["spendable_coins"] == 1000

    # Replay delivery returns created=False and does NOT double-unlock
    res2 = record_completion_for_customer(event)
    assert res2.created is False
    assert get_customer_coin_balances(user)["spendable_coins"] == 1000


def test_coin_reservation_concurrency_and_fifo_expiry() -> None:
    user = _user("205")
    now = timezone.now()

    # Grant 1: expires in 5 days, 300 coins
    grant1 = CoinGrant.objects.create(
        customer=user,
        coins_amount=300,
        locked_coins=0,
        spendable_coins=300,
        expires_at=now + timedelta(days=5),
        status=CoinGrant.Status.UNLOCKED,
    )
    # Grant 2: expires in 20 days, 500 coins
    grant2 = CoinGrant.objects.create(
        customer=user,
        coins_amount=500,
        locked_coins=0,
        spendable_coins=500,
        expires_at=now + timedelta(days=20),
        status=CoinGrant.Status.UNLOCKED,
    )

    # Reserve 400 coins: should consume all 300 from grant1, and 100 from grant2
    txns = reserve_coins(customer=user, coins_amount=400)
    assert len(txns) == 2
    assert txns[0].grant_id == grant1.id
    assert txns[0].amount == -300
    assert txns[1].grant_id == grant2.id
    assert txns[1].amount == -100

    grant1.refresh_from_db()
    grant2.refresh_from_db()
    assert grant1.spendable_coins == 0
    assert grant2.spendable_coins == 400

    # Trying to reserve 500 when only 400 left must fail
    with pytest.raises(InsufficientCoinsError, match="exceeds available spendable"):
        reserve_coins(customer=user, coins_amount=500)


def test_coins_api_endpoints() -> None:
    user = _user("206")
    CoinGrant.objects.create(
        customer=user,
        coins_amount=800,
        locked_coins=0,
        spendable_coins=800,
        status=CoinGrant.Status.UNLOCKED,
    )

    client = APIClient()
    client.force_authenticate(user)

    # 1. GET /api/v1/customer/coins/
    res = client.get("/api/v1/customer/coins/")
    assert res.status_code == HTTPStatus.OK
    data = res.json()
    assert data["spendable_coins"] == 800
    assert "active_burn_policy" in data

    # 2. POST /api/v1/customer/coins/preview-burn/
    preview_res = client.post(
        "/api/v1/customer/coins/preview-burn/",
        {"order_payable_paise": 50000, "requested_coins": 200},
        format="json",
    )
    assert preview_res.status_code == HTTPStatus.OK
    pdata = preview_res.json()
    assert pdata["applied_burn_coins"] == 200
    assert pdata["discount_paise"] == 2000
    assert pdata["remaining_payable_paise"] == 48000
