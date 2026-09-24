"""Unit and API tests for referral codes, attributions, and volume-tier payouts (ADR-0010)."""

# ruff: noqa: PLR2004

from http import HTTPStatus

import pytest
from rest_framework.test import APIClient

from apps.foundation.models import OutboxEvent
from apps.identity.models import User
from apps.loyalty.models import (
    ReferralAttribution,
    ReferralReward,
)
from apps.loyalty.services.referral import (
    ReferralValidationError,
    apply_referral_at_signup,
    evaluate_referral_qualification,
    get_or_create_referral_code,
)
from apps.wallet.services import get_or_create_wallet

pytestmark = pytest.mark.django_db(transaction=True)


def _user(suffix: str = "1") -> User:
    return User.objects.create_user(phone_number=f"+9196543{suffix.zfill(5)}")


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


def test_evaluate_referral_qualification_pays_volume_tiers_to_referrer_and_referee() -> None:
    referrer = _user("307")
    referee = _user("308")
    ref_code = get_or_create_referral_code(referrer)

    attribution = apply_referral_at_signup(referee=referee, code_str=ref_code.code)
    assert attribution.status == ReferralAttribution.Status.PENDING

    referrer_wallet = get_or_create_wallet(referrer)
    referee_wallet = get_or_create_wallet(referee)
    assert referrer_wallet.available_balance_paise == 0
    assert referee_wallet.available_balance_paise == 0

    event = OutboxEvent(
        aggregate_type="booking",
        aggregate_id="22222222-2222-2222-2222-222222222222",
        event_type="customer.fulfilment.completed",
        payload={
            "event_version": 1,
            "customer_id": str(referee.id),
            "booking_id": "22222222-2222-2222-2222-222222222222",
        },
    )

    evaluate_referral_qualification(event)

    attribution.refresh_from_db()
    assert attribution.status == ReferralAttribution.Status.REWARDED
    assert attribution.qualified_at is not None
    assert attribution.rewarded_at is not None

    referrer_wallet.refresh_from_db()
    referee_wallet.refresh_from_db()
    # v1 tier 1: ₹100 referrer, ₹50 referee
    assert referrer_wallet.available_balance_paise == 10000
    assert referee_wallet.available_balance_paise == 5000

    rewards = ReferralReward.objects.filter(attribution=attribution)
    assert rewards.count() == 2  # one for referrer, one for referee


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


def test_customer_referral_apply_api() -> None:
    referrer = _user("310")
    referee = _user("311")
    ref_code = get_or_create_referral_code(referrer)

    client = APIClient()
    client.force_authenticate(referee)

    # 1. Apply valid code
    res = client.post(
        "/api/v1/customer/referral/apply/",
        {"code": ref_code.code},
        format="json",
    )
    assert res.status_code == HTTPStatus.CREATED
    data = res.json()
    assert data["status"] == "PENDING"
    assert "referee_display" in data

    # 2. Duplicate apply fails
    res_dup = client.post(
        "/api/v1/customer/referral/apply/",
        {"code": ref_code.code},
        format="json",
    )
    assert res_dup.status_code == HTTPStatus.BAD_REQUEST

    # 3. Self-referral fails
    client_referrer = APIClient()
    client_referrer.force_authenticate(referrer)
    res_self = client_referrer.post(
        "/api/v1/customer/referral/apply/",
        {"code": ref_code.code},
        format="json",
    )
    assert res_self.status_code == HTTPStatus.BAD_REQUEST
