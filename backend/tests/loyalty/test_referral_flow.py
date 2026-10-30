"""Unit and API tests for referral codes, attributions, and volume-tier payouts (ADR-0010)."""

import uuid
from datetime import timedelta
from http import HTTPStatus

import pytest
from django.utils import timezone
from freezegun import freeze_time
from rest_framework.test import APIClient

from apps.foundation.models import OutboxEvent
from apps.identity.models import User
from apps.loyalty.models import (
    CustomerCompletion,
    LoyaltySettings,
    ReferralAttribution,
    ReferralReward,
)
from apps.loyalty.services.coins import get_customer_coin_balances
from apps.loyalty.services.referral import (
    ReferralValidationError,
    apply_referral_at_signup,
    evaluate_referral_qualification,
    get_active_referral_program,
    get_or_create_referral_code,
    release_due_referral_rewards,
)
from apps.wallet.services import get_or_create_wallet

pytestmark = pytest.mark.django_db(transaction=True)


def _user(suffix: str = "1") -> User:
    return User.objects.create_user(phone_number=f"+9196543{suffix.zfill(5)}")


def _completion_event(customer: User, booking_id: str) -> OutboxEvent:
    return OutboxEvent(
        aggregate_type="booking",
        aggregate_id=booking_id,
        event_type="customer.fulfilment.completed",
        payload={
            "event_version": 1,
            "customer_id": str(customer.id),
            "booking_id": booking_id,
            "completed_at": timezone.now().isoformat(),
        },
    )


def test_get_or_create_referral_code() -> None:
    user = _user("301")
    ref_code = get_or_create_referral_code(user)
    assert ref_code.code.startswith("VS")
    assert ref_code.share_url.endswith(ref_code.code)

    # Idempotent retrieval
    ref_code2 = get_or_create_referral_code(user)
    assert ref_code.id == ref_code2.id


def test_referral_validation_public_api() -> None:
    referrer = _user("302")
    ref_code = get_or_create_referral_code(referrer)

    client = APIClient()
    # 1. Valid code
    res = client.post(
        "/api/v1/customer/referral/validate/",
        {"code": ref_code.code},
        format="json",
    )
    assert res.status_code == HTTPStatus.OK
    data = res.json()
    assert data["valid"] is True
    assert data["code"] == ref_code.code

    # 2. Invalid code
    res_bad = client.post(
        "/api/v1/customer/referral/validate/",
        {"code": "NONEXISTENT99"},
        format="json",
    )
    assert res_bad.status_code == HTTPStatus.BAD_REQUEST


def test_apply_referral_at_signup_snapshots_program_and_enforces_unique_referee() -> None:
    referrer = _user("303")
    referee = _user("304")
    ref_code = get_or_create_referral_code(referrer)

    attribution = apply_referral_at_signup(referee=referee, code_str=ref_code.code)
    assert attribution.referrer == referrer
    assert attribution.referee == referee
    assert attribution.status == ReferralAttribution.Status.PENDING
    assert "tiers" in attribution.terms_snapshot
    assert attribution.terms_snapshot["program_version"] == "v1"

    # Second code application for same referee must fail
    referrer2 = _user("305")
    ref_code2 = get_or_create_referral_code(referrer2)
    with pytest.raises(ReferralValidationError, match="already has an applied referral"):
        apply_referral_at_signup(referee=referee, code_str=ref_code2.code)


def test_no_self_referral() -> None:
    user = _user("306")
    ref_code = get_or_create_referral_code(user)
    with pytest.raises(ReferralValidationError, match="Self-referral is not allowed"):
        apply_referral_at_signup(referee=user, code_str=ref_code.code)


def test_qualification_waits_for_hold_then_pays_default_coin_tiers() -> None:
    referrer = _user("307")
    referee = _user("308")
    ref_code = get_or_create_referral_code(referrer)

    attribution = apply_referral_at_signup(referee=referee, code_str=ref_code.code)
    assert attribution.status == ReferralAttribution.Status.PENDING

    booking_id = "22222222-2222-2222-2222-222222222222"
    completed_at = timezone.now()
    event = OutboxEvent(
        aggregate_type="booking",
        aggregate_id=booking_id,
        event_type="customer.fulfilment.completed",
        payload={
            "event_version": 1,
            "customer_id": str(referee.id),
            "booking_id": booking_id,
            "completed_at": completed_at.isoformat(),
        },
    )

    evaluate_referral_qualification(event)

    # Default waiting period is 7 days: qualified, nothing paid yet.
    attribution.refresh_from_db()
    assert attribution.status == ReferralAttribution.Status.QUALIFIED
    assert str(attribution.qualifying_source_id) == booking_id
    assert attribution.reward_available_at == completed_at + timedelta(days=7)
    assert not ReferralReward.objects.filter(attribution=attribution).exists()

    # Before the waiting period ends the sweep pays nothing.
    assert release_due_referral_rewards(now=completed_at + timedelta(days=6)) == 0

    # After it ends, both sides are paid in coins (launch tiers: 100 referrer / 100 referee).
    with freeze_time(completed_at + timedelta(days=7, minutes=1)):
        assert release_due_referral_rewards() == 1

    attribution.refresh_from_db()
    assert attribution.status == ReferralAttribution.Status.REWARDED
    rewards = ReferralReward.objects.filter(attribution=attribution)
    assert rewards.count() == 2
    referrer_reward = rewards.get(reward_side=ReferralReward.RewardSide.REFERRER)
    assert referrer_reward.coins_amount == 100
    assert referrer_reward.wallet_paise == 0
    assert referrer_reward.payout_sequence_n == 1
    assert get_customer_coin_balances(referrer)["spendable_coins"] == 100
    assert get_customer_coin_balances(referee)["spendable_coins"] == 100
    # Cash wallet rewards are off by default.
    assert get_or_create_wallet(referrer).available_balance_paise == 0


def test_zero_day_hold_pays_immediately() -> None:
    LoyaltySettings.objects.update_or_create(id=1, defaults={"reward_hold_days": 0})
    referrer = _user("320")
    referee = _user("321")
    attribution = apply_referral_at_signup(
        referee=referee, code_str=get_or_create_referral_code(referrer).code
    )
    evaluate_referral_qualification(
        _completion_event(referee, "33333333-3333-3333-3333-333333333333")
    )
    attribution.refresh_from_db()
    assert attribution.status == ReferralAttribution.Status.REWARDED


def test_customer_referral_api() -> None:
    user = _user("309")
    ref_code = get_or_create_referral_code(user)

    client = APIClient()
    client.force_authenticate(user)
    res = client.get("/api/v1/customer/referral/")
    assert res.status_code == HTTPStatus.OK
    data = res.json()
    assert data["code"] == ref_code.code
    assert data["share_url"] == ref_code.share_url
    assert "active_program" in data
    assert len(data["active_program"]["tiers"]) >= 1


def test_apply_endpoint_is_gone() -> None:
    client = APIClient()
    client.force_authenticate(_user("310"))
    res = client.post("/api/v1/customer/referral/apply/", {"code": "X"}, format="json")
    assert res.status_code == HTTPStatus.NOT_FOUND


def test_existing_account_cannot_apply_a_code_later() -> None:
    referrer = _user("312")
    old_customer = _user("313")
    User.objects.filter(id=old_customer.id).update(date_joined=timezone.now() - timedelta(days=3))
    old_customer.refresh_from_db()
    with pytest.raises(ReferralValidationError, match="only be used when you sign up"):
        apply_referral_at_signup(
            referee=old_customer, code_str=get_or_create_referral_code(referrer).code
        )


def test_customer_with_a_completed_booking_is_not_new() -> None:
    referrer = _user("314")
    referee = _user("315")
    CustomerCompletion.objects.create(
        customer=referee,
        source_type=CustomerCompletion.SourceType.BOOKING,
        source_id=uuid.uuid4(),
        completed_at=timezone.now(),
    )
    with pytest.raises(ReferralValidationError, match="only for new customers"):
        apply_referral_at_signup(
            referee=referee, code_str=get_or_create_referral_code(referrer).code
        )


def test_referral_summary_reports_counts_and_next_tier() -> None:
    referrer = _user("316")
    get_active_referral_program()  # launch tiers start at 1, 4, 10, 25, 50
    client = APIClient()
    client.force_authenticate(referrer)
    data = client.get("/api/v1/customer/referral/").json()
    assert data["invited_count"] == 0
    assert data["pending_referral_count"] == 0
    assert data["current_tier_min"] == 1
    assert data["next_tier_min"] == 4
    assert data["referrals_to_next_tier"] == 4
    assert data["share_url"] in data["share_message"]
