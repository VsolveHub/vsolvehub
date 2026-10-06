"""Waiting period, refund cancellation, monthly cap, Operations review and signup referral.

Covers the client-spec changes of October 2026: rewards wait `reward_hold_days` after the
booking completes, a refund in that window cancels them, referral rewards default to coins,
codes apply only in the OTP request that creates the account, and Operations can reject or
reverse a referral with an audit trail.
"""

# ruff: noqa: PLR2004

import uuid
from datetime import timedelta
from http import HTTPStatus

import pytest
from django.core.cache import cache
from django.utils import timezone
from freezegun import freeze_time
from rest_framework.test import APIClient

from apps.foundation.models import OutboxEvent
from apps.identity.models import Role, User, UserRole, UserSession
from apps.loyalty.models import (
    CoinGrant,
    CoinGrantRule,
    CoinTransaction,
    LoyaltySettings,
    ReferralAttribution,
)
from apps.loyalty.services.coins import (
    adjust_coins,
    get_customer_coin_balances,
    release_due_coin_grants,
)
from apps.loyalty.services.completion import record_completion_for_customer
from apps.loyalty.services.holds import cancel_pending_rewards_for_source
from apps.loyalty.services.referral import (
    ReferralReviewError,
    apply_referral_at_signup,
    evaluate_referral_qualification,
    get_or_create_referral_code,
    reject_referral,
    release_due_referral_rewards,
    reverse_referral,
)
from tests.helpers import force_role_client

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture(autouse=True)
def clear_rate_limit_cache() -> None:
    cache.clear()


def _user(suffix: str) -> User:
    return User.objects.create_user(phone_number=f"+9197654{suffix.zfill(5)}")


def _event(customer: User, source_id: uuid.UUID, completed_at: str | None = None) -> OutboxEvent:
    return OutboxEvent(
        id=uuid.uuid4(),
        aggregate_type="booking",
        aggregate_id=source_id,
        event_type="customer.fulfilment.completed",
        payload={
            "event_version": 1,
            "customer_id": str(customer.id),
            "booking_id": str(source_id),
            "completed_at": completed_at or timezone.now().isoformat(),
        },
    )


def _booking_coin_rule(coins: int = 50) -> CoinGrantRule:
    return CoinGrantRule.objects.create(
        name="Booking coins",
        earn_mode=CoinGrantRule.EarnMode.FLAT,
        coins_amount=coins,
        completions_required=0,
        grant_trigger=CoinGrantRule.GrantTrigger.BOOKING_COMPLETED,
    )


def _ops_client() -> tuple[APIClient, User]:
    role, _ = Role.objects.get_or_create(
        code="operations", defaults={"name": "Operations", "is_system": True}
    )
    user = User.objects.create_user(phone_number="+919876547777")
    UserRole.objects.create(user=user, role=role)
    client = force_role_client(user=user, role_code="operations")
    session = UserSession.objects.get(user=user, active_role=role)
    session.stepped_up_at = timezone.now()
    session.save(update_fields=("stepped_up_at",))
    return client, user


def _rewarded_referral(referrer: User, referee: User) -> ReferralAttribution:
    LoyaltySettings.objects.update_or_create(id=1, defaults={"reward_hold_days": 0})
    attribution = apply_referral_at_signup(
        referee=referee, code_str=get_or_create_referral_code(referrer).code
    )
    evaluate_referral_qualification(_event(referee, uuid.uuid4()))
    attribution.refresh_from_db()
    assert attribution.status == ReferralAttribution.Status.REWARDED
    return attribution


# --- booking coins wait for the waiting period ---------------------------------------------


def test_booking_coins_are_pending_until_the_waiting_period_ends() -> None:
    customer = _user("1")
    _booking_coin_rule(50)
    booking_id = uuid.uuid4()
    completed_at = timezone.now()

    record_completion_for_customer(_event(customer, booking_id, completed_at.isoformat()))

    grant = CoinGrant.objects.get(customer=customer)
    assert grant.status == CoinGrant.Status.PENDING
    assert grant.source_type == "BOOKING"
    assert grant.source_id == booking_id
    assert grant.available_at == completed_at + timedelta(days=7)
    balances = get_customer_coin_balances(customer)
    assert balances["pending_coins"] == 50
    assert balances["spendable_coins"] == 0

    assert release_due_coin_grants(now=completed_at + timedelta(days=6)) == 0
    assert release_due_coin_grants(now=completed_at + timedelta(days=7, seconds=1)) == 1
    balances = get_customer_coin_balances(customer)
    assert balances["pending_coins"] == 0
    assert balances["spendable_coins"] == 50
    # Second sweep is a no-op.
    assert release_due_coin_grants(now=completed_at + timedelta(days=8)) == 0


def test_refund_in_the_waiting_period_cancels_coins_and_requalifies_referral() -> None:
    _booking_coin_rule(50)
    referrer, referee = _user("2"), _user("3")
    attribution = apply_referral_at_signup(
        referee=referee, code_str=get_or_create_referral_code(referrer).code
    )
    booking_id = uuid.uuid4()
    event = _event(referee, booking_id)
    record_completion_for_customer(event)
    evaluate_referral_qualification(event)
    attribution.refresh_from_db()
    assert attribution.status == ReferralAttribution.Status.QUALIFIED

    cancel_pending_rewards_for_source(source_type="BOOKING", source_id=booking_id)

    grant = CoinGrant.objects.get(customer=referee, source_id=booking_id)
    assert grant.status == CoinGrant.Status.CANCELLED
    assert grant.locked_coins == 0
    assert CoinTransaction.objects.filter(grant=grant, kind=CoinTransaction.Kind.CANCEL).exists()
    attribution.refresh_from_db()
    # Back to PENDING so the friend's next completed booking can qualify instead.
    assert attribution.status == ReferralAttribution.Status.PENDING
    assert attribution.reward_available_at is None

    # Nothing pays later for the refunded booking.
    later = timezone.now() + timedelta(days=30)
    assert release_due_coin_grants(now=later) == 0
    assert release_due_referral_rewards(now=later) == 0


def test_replayed_completion_after_refund_does_not_grant_again() -> None:
    _booking_coin_rule(50)
    customer = _user("4")
    booking_id = uuid.uuid4()
    event = _event(customer, booking_id)
    record_completion_for_customer(event)
    cancel_pending_rewards_for_source(source_type="BOOKING", source_id=booking_id)

    result = record_completion_for_customer(event)

    assert result.created is False
    assert CoinGrant.objects.filter(customer=customer).count() == 1


# --- referral monthly cap --------------------------------------------------------------------


def test_monthly_cap_holds_extra_referral_rewards_for_next_month() -> None:
    LoyaltySettings.objects.update_or_create(
        id=1, defaults={"reward_hold_days": 0, "referral_monthly_cap": 1}
    )
    referrer = _user("5")
    code = get_or_create_referral_code(referrer).code
    first, second = _user("6"), _user("7")
    a1 = apply_referral_at_signup(referee=first, code_str=code)
    a2 = apply_referral_at_signup(referee=second, code_str=code)

    with freeze_time("2026-10-10 10:00:00"):
        evaluate_referral_qualification(_event(first, uuid.uuid4()))
        evaluate_referral_qualification(_event(second, uuid.uuid4()))
    a1.refresh_from_db()
    a2.refresh_from_db()
    assert a1.status == ReferralAttribution.Status.REWARDED
    assert a2.status == ReferralAttribution.Status.QUALIFIED

    with freeze_time("2026-10-20 10:00:00"):
        assert release_due_referral_rewards() == 0
    with freeze_time("2026-11-01 00:30:00"):
        assert release_due_referral_rewards() == 1
    a2.refresh_from_db()
    assert a2.status == ReferralAttribution.Status.REWARDED


# --- Operations reject / reverse ------------------------------------------------------------


def test_reject_needs_reason_and_only_applies_before_payment() -> None:
    ops = _user("8")
    referrer, referee = _user("9"), _user("10")
    attribution = apply_referral_at_signup(
        referee=referee, code_str=get_or_create_referral_code(referrer).code
    )
    with pytest.raises(ReferralReviewError):
        reject_referral(attribution_id=attribution.id, actor=ops, reason="  ")

    rejected = reject_referral(attribution_id=attribution.id, actor=ops, reason="Same device")

    assert rejected.status == ReferralAttribution.Status.INELIGIBLE
    assert rejected.reviewed_by == ops
    assert rejected.review_reason == "Same device"
    # A rejected referral never qualifies.
    evaluate_referral_qualification(_event(referee, uuid.uuid4()))
    rejected.refresh_from_db()
    assert rejected.status == ReferralAttribution.Status.INELIGIBLE


def test_reverse_takes_back_unspent_coins_and_reports_spent_ones() -> None:
    ops = _user("11")
    referrer, referee = _user("12"), _user("13")
    attribution = _rewarded_referral(referrer, referee)
    # Referrer spends 40 of their 100 reward coins before the reversal.
    adjust_coins(customer=referrer, amount=-40, reason="spent at checkout (test)")

    reverse_referral(attribution_id=attribution.id, actor=ops, reason="Fake account")

    attribution.refresh_from_db()
    assert attribution.status == ReferralAttribution.Status.REVERSED
    assert get_customer_coin_balances(referrer)["spendable_coins"] == 0
    assert get_customer_coin_balances(referee)["spendable_coins"] == 0
    reversal = CoinTransaction.objects.get(customer=referrer, kind=CoinTransaction.Kind.REVERSE)
    assert reversal.amount == -60
    assert "40 coins were already used" in reversal.notes
    with pytest.raises(ReferralReviewError):
        reverse_referral(attribution_id=attribution.id, actor=ops, reason="again")


def test_reversed_referral_no_longer_counts_toward_tiers() -> None:
    ops = _user("14")
    referrer = _user("15")
    first = _rewarded_referral(referrer, _user("16"))
    reverse_referral(attribution_id=first.id, actor=ops, reason="Fraud")
    second = _rewarded_referral(referrer, _user("17"))
    assert second.rewards.get(reward_side="REFERRER").payout_sequence_n == 1


def test_ops_review_endpoints_and_customer_ledger() -> None:
    client, _ops = _ops_client()
    referrer, referee = _user("18"), _user("19")
    attribution = _rewarded_referral(referrer, referee)

    listed = client.get("/api/v1/ops/referral/attributions/?status=REWARDED")
    assert listed.status_code == HTTPStatus.OK
    assert [row["id"] for row in listed.json()] == [str(attribution.id)]

    reversed_ = client.post(
        f"/api/v1/ops/referral/attributions/{attribution.id}/reverse/",
        {"reason": "Duplicate account"},
        format="json",
    )
    assert reversed_.status_code == HTTPStatus.OK
    assert reversed_.json()["status"] == "REVERSED"

    ledger = client.get(
        "/api/v1/ops/loyalty/customer-ledger/", {"phone_number": referrer.phone_number}
    )
    assert ledger.status_code == HTTPStatus.OK
    body = ledger.json()
    assert body["customer_id"] == str(referrer.id)
    kinds = {row["kind"] for row in body["coin_transactions"]}
    assert {"EARN_PROMISE", "REVERSE"} <= kinds
    assert body["referrals_made"][0]["status"] == "REVERSED"

    adjusted = client.post(
        "/api/v1/ops/loyalty/coin-adjustments/",
        {"customer_id": str(referrer.id), "amount": 250, "reason": "Goodwill"},
        format="json",
    )
    assert adjusted.status_code == HTTPStatus.CREATED
    assert get_customer_coin_balances(referrer)["spendable_coins"] == 250


def test_ops_settings_round_trip_and_bounds() -> None:
    client, _ops = _ops_client()
    assert client.get("/api/v1/ops/loyalty/settings/").json()["reward_hold_days"] == 7
    ok = client.patch(
        "/api/v1/ops/loyalty/settings/",
        {"reward_hold_days": 3, "referral_monthly_cap": 10},
        format="json",
    )
    assert ok.status_code == HTTPStatus.OK
    assert LoyaltySettings.objects.get(id=1).reward_hold_days == 3
    too_long = client.patch(
        "/api/v1/ops/loyalty/settings/", {"reward_hold_days": 91}, format="json"
    )
    assert too_long.status_code == HTTPStatus.BAD_REQUEST


def test_review_endpoints_require_operations() -> None:
    customer = _user("20")
    client = APIClient()
    client.force_authenticate(customer)
    res = client.post(
        f"/api/v1/ops/referral/attributions/{uuid.uuid4()}/reject/",
        {"reason": "x"},
        format="json",
    )
    assert res.status_code == HTTPStatus.FORBIDDEN


# --- earn rule tiers inline ------------------------------------------------------------------


def test_create_tiered_rule_inline_and_reject_overlaps() -> None:
    client, _ops = _ops_client()
    good = client.post(
        "/api/v1/ops/loyalty/grant-rules/",
        {
            "name": "Order size",
            "grant_trigger": "BOOKING_COMPLETED",
            "earn_mode": "TIERED_ORDER_VALUE",
            "tiers": [
                {"min_order_paise": 0, "max_order_paise": 49999, "coins_amount": 10},
                {"min_order_paise": 50000, "max_order_paise": None, "coins_amount": 25},
            ],
        },
        format="json",
    )
    assert good.status_code == HTTPStatus.CREATED, good.json()
    assert len(good.json()["tiers"]) == 2
    assert {t["tier_kind"] for t in good.json()["tiers"]} == {"ORDER_VALUE"}

    overlap = client.post(
        "/api/v1/ops/loyalty/grant-rules/",
        {
            "name": "Bad",
            "grant_trigger": "BOOKING_COMPLETED",
            "earn_mode": "TIERED_ORDER_VALUE",
            "tiers": [
                {"min_order_paise": 0, "max_order_paise": 60000, "coins_amount": 10},
                {"min_order_paise": 50000, "max_order_paise": None, "coins_amount": 25},
            ],
        },
        format="json",
    )
    assert overlap.status_code == HTTPStatus.BAD_REQUEST


def test_publish_program_requires_tier_starting_at_one() -> None:
    client, _ops = _ops_client()
    res = client.post(
        "/api/v1/ops/referral/programs/",
        {
            "version_code": "v9",
            "reward_sides": "BOTH",
            "referee_coins_amount": 100,
            "tiers": [{"min_qualified_referrals": 4, "referrer_coins_amount": 150}],
        },
        format="json",
    )
    assert res.status_code == HTTPStatus.BAD_REQUEST


# --- referral code at OTP signup -------------------------------------------------------------


def _otp_signup(client: APIClient, phone: str, referral_code: str = "") -> None:
    issued = client.post("/api/v1/auth/otp/request/", {"phone_number": phone}, format="json").json()
    payload = {
        "challenge_id": issued["challenge_id"],
        "phone_number": phone,
        "code": issued["development_code"],
    }
    if referral_code:
        payload["referral_code"] = referral_code
    res = client.post("/api/v1/auth/otp/verify/", payload, format="json")
    assert res.status_code == HTTPStatus.OK


def test_otp_signup_applies_referral_and_grants_signup_coins() -> None:
    CoinGrantRule.objects.create(
        name="Welcome",
        earn_mode=CoinGrantRule.EarnMode.FLAT,
        coins_amount=100,
        completions_required=1,
        grant_trigger=CoinGrantRule.GrantTrigger.SIGNUP,
    )
    referrer = _user("21")
    code = get_or_create_referral_code(referrer).code

    _otp_signup(APIClient(), "+919812345601", referral_code=code)

    new_user = User.objects.get(phone_number="+919812345601")
    attribution = ReferralAttribution.objects.get(referee=new_user)
    assert attribution.referrer == referrer
    grant = CoinGrant.objects.get(customer=new_user, source_type="SIGNUP")
    assert grant.status == CoinGrant.Status.PROMISED
    assert grant.locked_coins == 100


def test_existing_account_login_ignores_referral_code_and_signup_coins() -> None:
    CoinGrantRule.objects.create(
        name="Welcome",
        earn_mode=CoinGrantRule.EarnMode.FLAT,
        coins_amount=100,
        grant_trigger=CoinGrantRule.GrantTrigger.SIGNUP,
    )
    referrer = _user("22")
    code = get_or_create_referral_code(referrer).code
    _otp_signup(APIClient(), "+919812345602")
    existing = User.objects.get(phone_number="+919812345602")
    assert CoinGrant.objects.filter(customer=existing).count() == 1

    _otp_signup(APIClient(), "+919812345602", referral_code=code)

    assert not ReferralAttribution.objects.filter(referee=existing).exists()
    assert CoinGrant.objects.filter(customer=existing).count() == 1


def test_invalid_referral_code_does_not_block_signup() -> None:
    _otp_signup(APIClient(), "+919812345603", referral_code="NOPE1234")
    user = User.objects.get(phone_number="+919812345603")
    assert not ReferralAttribution.objects.filter(referee=user).exists()
