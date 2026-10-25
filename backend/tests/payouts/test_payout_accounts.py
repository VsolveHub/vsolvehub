"""Partner bank accounts: registration, Operations review, and RazorpayX payout webhooks.

The rules that matter for real money, each asserted here:

* the full account number reaches the provider and nowhere else;
* nothing submitted by a Partner is payable until Operations verifies it *and* cooling passes;
* the person who registered an account cannot review it, and reviewing needs a step-up;
* a payout webhook is only believed when it is signed, and settling is idempotent.
"""

import hashlib
import hmac
import json
import uuid
from datetime import timedelta
from http import HTTPStatus
from typing import Any

import pytest
import requests
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.identity.models import Role, User, UserRole, UserSession
from apps.partners.models import PartnerProfile
from apps.payouts.models import PartnerLedgerEntry, PartnerPayoutAccount, PayoutBatchItem
from apps.payouts.providers import (
    PayoutProviderError,
    RazorpayXPayoutProvider,
    get_payout_account_provider,
    get_payout_provider,
)
from apps.payouts.services import (
    payable_account,
    register_payout_account,
    reserve_entry_for_batch,
    submit_payout_item,
)
from tests.helpers import force_role_client
from tests.payouts.test_payout_api import _batch, _earning, _verified_account

pytestmark = pytest.mark.django_db(transaction=True)

FAKE_PROVIDER = override_settings(PAYOUT_PROVIDER="fake", PAYOUTS_ALLOW_FAKE_PROVIDER=True)
ACCOUNT_NUMBER = "123456789012"
WEBHOOK_SECRET = hashlib.sha256(b"razorpayx-webhook").hexdigest()
KEY_SECRET = hashlib.sha256(b"razorpayx-key").hexdigest()
#: Width of `PayoutBatchItem.failure_code`.
FAILURE_CODE_MAX = 80


def _phone() -> str:
    return f"+919{uuid.uuid4().int % 10**9:09d}"


def _partner() -> tuple[APIClient, PartnerProfile]:
    user = User.objects.create_user(phone_number=_phone())
    role, _ = Role.objects.get_or_create(code="partner", defaults={"name": "Partner"})
    UserRole.objects.get_or_create(user=user, role=role, revoked_at=None)
    profile = PartnerProfile.objects.create(user=user, display_name="Ravi Kumar")
    return force_role_client(user=user, role_code="partner"), profile


def _operations(*, stepped_up: bool) -> tuple[APIClient, User]:
    user = User.objects.create_user(phone_number=_phone())
    role, _ = Role.objects.get_or_create(code="operations", defaults={"name": "Operations"})
    UserRole.objects.get_or_create(user=user, role=role, revoked_at=None)
    client = force_role_client(user=user, role_code="operations")
    if stepped_up:
        session = UserSession.objects.get(user=user, active_role=role)
        session.stepped_up_at = timezone.now()
        session.save(update_fields=("stepped_up_at",))
    return client, user


def _details(**overrides: str) -> dict[str, str]:
    return {
        "holder_name": "Ravi Kumar",
        "account_number": ACCOUNT_NUMBER,
        "confirm_account_number": ACCOUNT_NUMBER,
        "ifsc": "sbin0001234",
        **overrides,
    }


def _submit(client: APIClient, **overrides: str) -> Any:
    return client.post("/api/v1/partner/payout-account/", _details(**overrides), format="json")


# --------------------------------------------------------------------------------------------
# Partner registration
# --------------------------------------------------------------------------------------------


@FAKE_PROVIDER
def test_a_submitted_account_is_pending_and_keeps_only_the_last_four_digits() -> None:
    client, profile = _partner()

    response = _submit(client)

    assert response.status_code == HTTPStatus.CREATED
    body = response.json()
    assert body["status"] == "PENDING"
    assert body["account_last4"] == "9012"
    assert body["ifsc"] == "SBIN0001234"
    assert body["is_payable_now"] is False
    assert ACCOUNT_NUMBER not in json.dumps(body)

    account = PartnerPayoutAccount.objects.get(partner=profile)
    assert account.provider_contact_id.startswith("fake_contact_")
    assert account.provider_fund_account_id.startswith("fake_fa_")
    stored = " ".join(str(value) for value in account.__dict__.values())
    assert ACCOUNT_NUMBER not in stored
    assert payable_account(profile) is None


@FAKE_PROVIDER
@pytest.mark.parametrize(
    ("overrides", "field"),
    [
        ({"confirm_account_number": "123456789013"}, "confirm_account_number"),
        ({"ifsc": "SBIN1234"}, "ifsc"),
        ({"account_number": "1234", "confirm_account_number": "1234"}, "account_number"),
    ],
)
def test_invalid_bank_details_are_refused_before_the_provider_is_called(
    overrides: dict[str, str], field: str
) -> None:
    client, profile = _partner()

    response = _submit(client, **overrides)

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert field in json.dumps(response.json())
    assert not PartnerPayoutAccount.objects.filter(partner=profile).exists()


@FAKE_PROVIDER
def test_a_new_submission_replaces_the_old_account_and_restarts_cooling() -> None:
    client, profile = _partner()
    first = _submit(client).json()
    old = PartnerPayoutAccount.objects.get(id=first["id"])
    old.status = PartnerPayoutAccount.Status.VERIFIED
    old.effective_from = timezone.now() - timedelta(hours=1)
    old.save(update_fields=("status", "effective_from"))
    assert payable_account(profile) == old

    second = _submit(client, account_number="999988887777", confirm_account_number="999988887777")

    old.refresh_from_db()
    assert old.status == PartnerPayoutAccount.Status.REPLACED
    assert second.json()["status"] == "PENDING"
    assert payable_account(profile) is None


@override_settings(PAYOUT_PROVIDER="unconfigured")
def test_without_a_payout_provider_nothing_is_saved() -> None:
    client, profile = _partner()

    response = _submit(client)

    assert response.status_code == HTTPStatus.SERVICE_UNAVAILABLE
    assert response.json()["error"]["code"] == "payout_accounts_unavailable"
    assert not PartnerPayoutAccount.objects.filter(partner=profile).exists()


@FAKE_PROVIDER
def test_provider_refusal_and_ambiguity_save_nothing() -> None:
    client, profile = _partner()

    rejected = _submit(client, holder_name="Rejected Name")
    ambiguous = _submit(client, holder_name="Ambiguous Name")

    assert rejected.status_code == HTTPStatus.BAD_REQUEST
    assert rejected.json()["error"]["code"] == "payout_account_rejected"
    assert ambiguous.status_code == HTTPStatus.SERVICE_UNAVAILABLE
    assert ambiguous.json()["error"]["code"] == "payout_account_provider_unavailable"
    assert ambiguous.json()["error"]["retryable"] is True
    assert not PartnerPayoutAccount.objects.filter(partner=profile).exists()


# --------------------------------------------------------------------------------------------
# Operations review
# --------------------------------------------------------------------------------------------


@FAKE_PROVIDER
def test_operations_lists_pending_accounts_with_the_partner_identity() -> None:
    partner_client, profile = _partner()
    _submit(partner_client)
    ops, _ = _operations(stepped_up=False)

    response = ops.get("/api/v1/operations/payout-accounts/")

    assert response.status_code == HTTPStatus.OK
    rows = [row for row in response.json()["results"] if row["partner_id"] == str(profile.id)]
    assert len(rows) == 1
    assert rows[0]["partner_display_name"] == "Ravi Kumar"
    assert rows[0]["partner_phone_number"] == profile.user.phone_number
    assert rows[0]["is_registered_with_provider"] is True
    assert partner_client.get("/api/v1/operations/payout-accounts/").status_code == (
        HTTPStatus.FORBIDDEN
    )


@FAKE_PROVIDER
def test_verifying_needs_a_step_up_and_payment_still_waits_for_cooling() -> None:
    partner_client, profile = _partner()
    account_id = _submit(partner_client).json()["id"]
    url = f"/api/v1/operations/payout-accounts/{account_id}/verify/"
    no_step_up, _ = _operations(stepped_up=False)
    ops, reviewer = _operations(stepped_up=True)

    refused = no_step_up.post(url)
    verified = ops.post(url)

    assert refused.status_code in (HTTPStatus.UNAUTHORIZED, HTTPStatus.FORBIDDEN)
    assert verified.status_code == HTTPStatus.OK
    account = PartnerPayoutAccount.objects.get(id=account_id)
    assert account.status == PartnerPayoutAccount.Status.VERIFIED
    assert account.reviewed_by == reviewer
    assert account.verified_at is not None
    assert payable_account(profile) is None  # still cooling

    account.effective_from = timezone.now() - timedelta(minutes=1)
    account.save(update_fields=("effective_from",))
    assert payable_account(profile) == account
    assert ops.post(url).status_code == HTTPStatus.CONFLICT  # already decided


def test_whoever_registered_an_account_cannot_review_it() -> None:
    _client, profile = _partner()
    ops, reviewer = _operations(stepped_up=True)
    account = register_payout_account(
        partner_id=profile.id,
        account_last4="9012",
        ifsc="SBIN0001234",
        holder_name="Ravi Kumar",
        actor=reviewer,
        provider_fund_account_id="fa_test",
    )

    response = ops.post(f"/api/v1/operations/payout-accounts/{account.id}/verify/")

    assert response.status_code == HTTPStatus.FORBIDDEN
    assert response.json()["error"]["code"] == "payout_account_self_review"


def test_an_account_unknown_to_the_provider_cannot_be_verified() -> None:
    _client, profile = _partner()
    account = register_payout_account(
        partner_id=profile.id, account_last4="9012", ifsc="SBIN0001234", holder_name="Ravi Kumar"
    )
    ops, _ = _operations(stepped_up=True)

    response = ops.post(f"/api/v1/operations/payout-accounts/{account.id}/verify/")

    assert response.status_code == HTTPStatus.CONFLICT
    assert response.json()["error"]["code"] == "payout_account_review_invalid"


@FAKE_PROVIDER
def test_a_rejection_needs_a_reason_and_the_partner_sees_it() -> None:
    partner_client, _profile = _partner()
    account_id = _submit(partner_client).json()["id"]
    ops, _ = _operations(stepped_up=True)
    url = f"/api/v1/operations/payout-accounts/{account_id}/reject/"

    missing = ops.post(url, {}, format="json")
    rejected = ops.post(url, {"reason": "The name does not match your ID."}, format="json")

    assert missing.status_code == HTTPStatus.BAD_REQUEST
    assert rejected.status_code == HTTPStatus.OK
    mine = partner_client.get("/api/v1/partner/payout-account/").json()
    assert mine["status"] == "REJECTED"
    assert mine["rejection_reason"] == "The name does not match your ID."


# --------------------------------------------------------------------------------------------
# RazorpayX payout webhooks
# --------------------------------------------------------------------------------------------


def _sign(body: bytes) -> str:
    return hmac.new(WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()


def _payout_event(*, payout_id: str, status: str, reference: str = "", **extra: object) -> bytes:
    entity = {"id": payout_id, "status": status, "reference_id": reference, **extra}
    return json.dumps(
        {"event": f"payout.{status}", "payload": {"payout": {"entity": entity}}}
    ).encode()


def _deliver(body: bytes, signature: str | None = None) -> Any:
    return APIClient().post(
        "/api/v1/payout-webhooks/razorpayx/",
        data=body,
        content_type="application/json",
        HTTP_X_RAZORPAY_SIGNATURE=_sign(body) if signature is None else signature,
    )


def _reserved_item(key: str) -> PayoutBatchItem:
    booked, entry = _earning(key)
    _verified_account(booked)
    _ops, actor = _operations(stepped_up=False)
    batch = _batch(actor, f"{key}-{uuid.uuid4().hex[:8]}")
    return reserve_entry_for_batch(batch=batch, entry=entry)


@override_settings(RAZORPAYX_WEBHOOK_SECRET=WEBHOOK_SECRET)
def test_an_unsigned_or_forged_payout_webhook_is_refused() -> None:
    body = _payout_event(payout_id="pout_x", status="processed")

    assert _deliver(body, signature="").status_code == HTTPStatus.BAD_REQUEST
    assert _deliver(body, signature="0" * 64).status_code == HTTPStatus.BAD_REQUEST


@override_settings(RAZORPAYX_WEBHOOK_SECRET="")
def test_without_a_webhook_secret_nothing_is_believed() -> None:
    body = _payout_event(payout_id="pout_x", status="processed")
    empty_key_signature = hmac.new(b"", body, hashlib.sha256).hexdigest()

    assert _deliver(body, signature=empty_key_signature).status_code == HTTPStatus.BAD_REQUEST


@FAKE_PROVIDER
@override_settings(RAZORPAYX_WEBHOOK_SECRET=WEBHOOK_SECRET)
def test_a_processed_payout_settles_once_however_often_it_is_delivered() -> None:
    item = submit_payout_item(item_id=_reserved_item("hook-paid").id)
    body = _payout_event(payout_id=item.provider_payout_id, status="processed")

    first = _deliver(body)
    second = _deliver(body)

    assert first.status_code == HTTPStatus.OK
    assert first.json() == {"accepted": True, "applied": True}
    assert second.status_code == HTTPStatus.OK
    item.refresh_from_db()
    assert item.status == PayoutBatchItem.Status.PAID
    assert PartnerLedgerEntry.objects.get(id=item.ledger_entry_id).status == (
        PartnerLedgerEntry.Status.PAID
    )


@override_settings(RAZORPAYX_WEBHOOK_SECRET=WEBHOOK_SECRET)
def test_the_reference_finds_an_item_whose_payout_id_was_never_recorded() -> None:
    item = _reserved_item("hook-reference")
    reason = "Beneficiary bank is offline at the moment, please retry after some time " * 2
    body = _payout_event(
        payout_id="pout_late",
        status="reversed",
        reference=f"{item.batch.reference}:{item.id}",
        failure_reason=reason,
    )

    response = _deliver(body)

    assert response.json()["applied"] is True
    item.refresh_from_db()
    assert item.provider_payout_id == "pout_late"
    assert item.status == PayoutBatchItem.Status.FAILED
    assert len(item.failure_code) <= FAILURE_CODE_MAX
    assert item.failure_code.startswith("beneficiary-bank-is-offline")
    assert PartnerLedgerEntry.objects.get(id=item.ledger_entry_id).status == (
        PartnerLedgerEntry.Status.RELEASED
    )


@override_settings(RAZORPAYX_WEBHOOK_SECRET=WEBHOOK_SECRET)
def test_events_that_are_not_payouts_are_acknowledged_and_ignored() -> None:
    body = json.dumps({"event": "fund_account.validation.completed", "payload": {}}).encode()

    response = _deliver(body)

    assert response.status_code == HTTPStatus.OK
    assert response.json() == {"accepted": True, "applied": False}


# --------------------------------------------------------------------------------------------
# Providers
# --------------------------------------------------------------------------------------------


@override_settings(
    PAYOUT_PROVIDER="razorpayx",
    RAZORPAYX_KEY_ID="rzp_test_x",
    RAZORPAYX_KEY_SECRET=KEY_SECRET,
    PAYOUTS_LIVE_ENABLED=False,
)
def test_accounts_can_be_registered_while_payouts_stay_switched_off() -> None:
    assert isinstance(get_payout_account_provider(), RazorpayXPayoutProvider)
    with pytest.raises(PayoutProviderError):
        get_payout_provider()


class _Response:
    def __init__(self, data: dict[str, object]) -> None:
        self.status_code = 200
        self._data = data

    def json(self) -> dict[str, object]:
        return self._data


@override_settings(
    RAZORPAYX_KEY_ID="rzp_test_x",
    RAZORPAYX_KEY_SECRET=KEY_SECRET,
    RAZORPAYX_API_BASE_URL="https://api.razorpay.com/v1",
)
def test_razorpayx_contact_and_fund_account_requests(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict[str, Any]] = []

    def request(method: str, url: str, **kwargs: Any) -> _Response:
        calls.append({"method": method, "url": url, **kwargs})
        return _Response({"id": "cont_1" if url.endswith("/contacts") else "fa_1"})

    monkeypatch.setattr(requests, "request", request)
    provider = RazorpayXPayoutProvider()

    contact_id = provider.create_contact(name="Ravi Kumar", reference_id="partner-1")
    fund_id = provider.create_fund_account(
        contact_id=contact_id,
        holder_name="Ravi Kumar",
        ifsc="SBIN0001234",
        account_number=ACCOUNT_NUMBER,
    )

    assert (contact_id, fund_id) == ("cont_1", "fa_1")
    assert calls[0]["url"] == "https://api.razorpay.com/v1/contacts"
    assert calls[0]["json"] == {"name": "Ravi Kumar", "type": "vendor", "reference_id": "partner-1"}
    assert calls[1]["url"] == "https://api.razorpay.com/v1/fund_accounts"
    assert calls[1]["json"]["bank_account"] == {
        "name": "Ravi Kumar",
        "ifsc": "SBIN0001234",
        "account_number": ACCOUNT_NUMBER,
    }
    assert calls[1]["auth"] == ("rzp_test_x", KEY_SECRET)
