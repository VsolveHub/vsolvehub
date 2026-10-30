"""What a customer sees while a referral reward is on its way (contract 1.72.0)."""

from datetime import timedelta

import pytest
from django.utils import timezone
from freezegun import freeze_time
from rest_framework.test import APIClient

from apps.identity.models import User
from apps.loyalty.models import ReferralAttribution
from apps.loyalty.services.referral import (
    apply_referral_at_signup,
    evaluate_referral_qualification,
    get_active_referral_program,
    get_or_create_referral_code,
    release_due_referral_rewards,
    reward_for_payout,
)
from tests.loyalty.test_referral_flow import _completion_event

pytestmark = pytest.mark.django_db(transaction=True)


def _user(suffix: str) -> User:
    return User.objects.create_user(phone_number=f"+9196544{suffix.zfill(5)}")


def _client(user: User) -> APIClient:
    client = APIClient()
    client.force_authenticate(user)
    return client


def test_reward_for_payout_matches_the_launch_tiers() -> None:
    amounts = reward_for_payout(get_active_referral_program(), 1)
    assert amounts.pays_referrer and amounts.pays_referee
    assert amounts.referrer_coins == 100
    assert amounts.referee_coins == 100


def test_each_referral_shows_its_reward_through_every_stage() -> None:
    referrer, friend = _user("1"), _user("2")
    apply_referral_at_signup(referee=friend, code_str=get_or_create_referral_code(referrer).code)
    client = _client(referrer)

    waiting = client.get("/api/v1/customer/referral/attributions/").json()["results"][0]
    assert waiting["status"] == "PENDING"
    assert waiting["reward_coins"] == 100
    assert waiting["reward_is_estimate"] is True

    completed_at = timezone.now()
    evaluate_referral_qualification(
        _completion_event(friend, "44444444-4444-4444-4444-444444444444")
    )
    booked = client.get("/api/v1/customer/referral/attributions/").json()["results"][0]
    assert booked["status"] == "QUALIFIED"
    assert booked["reward_coins"] == 100
    assert booked["reward_available_at"]

    summary = client.get("/api/v1/customer/referral/").json()
    assert summary["waiting_booking_count"] == 0
    assert summary["reward_on_the_way_count"] == 1
    assert summary["on_the_way_coins"] == 100
    assert summary["reward_hold_days"] == 7

    with freeze_time(completed_at + timedelta(days=7, minutes=1)):
        release_due_referral_rewards()
    paid = client.get("/api/v1/customer/referral/attributions/").json()["results"][0]
    assert paid["status"] == "REWARDED"
    assert paid["reward_coins"] == 100
    assert paid["reward_is_estimate"] is False
    assert client.get("/api/v1/customer/referral/").json()["on_the_way_coins"] == 0


def test_the_new_customer_sees_their_welcome_reward_until_it_lands() -> None:
    referrer, friend = _user("3"), _user("4")
    attribution = apply_referral_at_signup(
        referee=friend, code_str=get_or_create_referral_code(referrer).code
    )
    client = _client(friend)

    before = client.get("/api/v1/customer/referral/").json()["welcome_reward"]
    assert before["status"] == "PENDING"
    assert before["coins"] == 100
    assert before["reward_available_at"] is None

    evaluate_referral_qualification(
        _completion_event(friend, "55555555-5555-5555-5555-555555555555")
    )
    after = client.get("/api/v1/customer/referral/").json()["welcome_reward"]
    assert after["status"] == "QUALIFIED"
    assert after["reward_available_at"]

    ReferralAttribution.objects.filter(id=attribution.id).update(
        status=ReferralAttribution.Status.REWARDED
    )
    assert client.get("/api/v1/customer/referral/").json()["welcome_reward"] is None


def test_a_customer_who_joined_without_a_code_has_no_welcome_reward() -> None:
    data = _client(_user("5")).get("/api/v1/customer/referral/").json()
    assert data["welcome_reward"] is None
    assert data["waiting_booking_count"] == 0
