"""Cashfree Payouts V2: what each request carries, how answers are read, and the webhook.

The limits and shapes are copied from Cashfree's API reference rather than imported from the
adapter, for the reason `test_razorpayx_payout_requests` gives: a test that reads the adapter's
own constants agrees with it however wrong it is.
"""

import base64
import hashlib
import hmac
import json
import re
from http import HTTPStatus
from typing import Any

import pytest
import requests
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from django.core.exceptions import ImproperlyConfigured
from django.test import override_settings
from rest_framework.test import APIClient

from apps.payouts.models import PayoutBatchItem, PayoutWebhookEvent
from apps.payouts.providers import (
    CashfreePayoutProvider,
    PayoutProviderAmbiguousError,
    PayoutProviderError,
    PayoutProviderRejectedError,
    cashfree_status,
    get_payout_account_provider,
    get_payout_provider,
    verify_cashfree_signature,
)
from apps.payouts.services import submit_payout_item
from config.settings.guards import guard_cashfree_sandbox
from tests.payouts.test_payout_submission import _reserved_item

pytestmark = [
    pytest.mark.django_db(transaction=True),
    pytest.mark.usefixtures("partner_gates_open"),
]

SANDBOX = "https://sandbox.cashfree.com/payout"
CLIENT_SECRET = hashlib.sha256(b"cashfree-secret").hexdigest()
CASHFREE = override_settings(
    PAYOUT_PROVIDER="cashfree",
    PAYOUTS_LIVE_ENABLED=True,
    CASHFREE_PAYOUT_API_BASE_URL=SANDBOX,
    CASHFREE_PAYOUT_API_VERSION="2024-01-01",
    CASHFREE_PAYOUT_CLIENT_ID="CF_TEST_CLIENT",
    CASHFREE_PAYOUT_CLIENT_SECRET=CLIENT_SECRET,
    CASHFREE_PAYOUT_PUBLIC_KEY="",
)
#: Cashfree: `transfer_id` is letters, digits and underscore, at most 40.
TRANSFER_ID = re.compile(r"^[A-Za-z0-9_]{1,40}$")
#: Cashfree: `beneficiary_id` is letters, digits, underscore, pipe or dot, at most 50.
BENEFICIARY_ID = re.compile(r"^[A-Za-z0-9_|.]{1,50}$")
#: Cashfree: `beneficiary_name` is alphabets and whitespace, at most 100.
BENEFICIARY_NAME = re.compile(r"^[A-Za-z ]{1,100}$")


class _Response:
    def __init__(self, status_code: int, body: object) -> None:
        self.status_code = status_code
        self._body = body

    def json(self) -> object:
        return self._body


class _Cashfree:
    """Stands in for `requests.request`: canned answers in order, and every call recorded."""

    def __init__(self, *responses: _Response | Exception) -> None:
        self.responses = list(responses)
        self.calls: list[dict[str, Any]] = []

    def __call__(self, method: str, url: str, **kwargs: Any) -> _Response:
        self.calls.append({"method": method, "url": url, **kwargs})
        answer = self.responses.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer


def _transfer(item: PayoutBatchItem, **extra: object) -> dict[str, object]:
    return {
        "transfer_id": item.id.hex,
        "cf_transfer_id": "cf_1",
        "status": "RECEIVED",
        "status_code": "RECEIVED",
        "transfer_amount": item.amount_paise / 100,
        **extra,
    }


# --------------------------------------------------------------------------------------------
# Requests
# --------------------------------------------------------------------------------------------


@CASHFREE
def test_a_transfer_request_fits_cashfree_and_sends_rupees(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    item = _reserved_item("cf-shape")
    cashfree = _Cashfree(_Response(HTTPStatus.OK, _transfer(item)))
    monkeypatch.setattr(requests, "request", cashfree)

    submitted = submit_payout_item(item_id=item.id)

    assert submitted.status == PayoutBatchItem.Status.SUBMITTED
    assert submitted.provider_payout_id == "cf_1"
    [call] = cashfree.calls
    assert (call["method"], call["url"]) == ("POST", f"{SANDBOX}/transfers")
    assert call["headers"]["x-client-id"] == "CF_TEST_CLIENT"
    assert call["headers"]["x-client-secret"] == CLIENT_SECRET
    assert call["headers"]["x-api-version"] == "2024-01-01"
    assert "x-cf-signature" not in call["headers"]
    payload = call["json"]
    assert TRANSFER_ID.match(payload["transfer_id"])
    assert payload["transfer_id"] == item.id.hex
    assert payload["transfer_amount"] == item.amount_paise / 100
    assert payload["beneficiary_details"] == {"beneficiary_id": "fa_test"}
    assert (payload["transfer_currency"], payload["transfer_mode"]) == ("INR", "imps")
    assert len(payload["transfer_remarks"]) <= 70


@CASHFREE
def test_a_duplicate_transfer_id_returns_the_original_transfer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    item = _reserved_item("cf-duplicate")
    cashfree = _Cashfree(
        _Response(HTTPStatus.CONFLICT, {"code": "transfer_id_already_exists", "message": "x"}),
        _Response(HTTPStatus.OK, _transfer(item, cf_transfer_id="cf_original")),
    )
    monkeypatch.setattr(requests, "request", cashfree)

    submitted = submit_payout_item(item_id=item.id)

    assert submitted.provider_payout_id == "cf_original"
    assert [call["method"] for call in cashfree.calls] == ["POST", "GET"]
    assert cashfree.calls[1]["params"] == {"transfer_id": item.id.hex}


@CASHFREE
def test_a_timeout_or_server_error_is_ambiguous_and_a_400_is_a_rejection(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = CashfreePayoutProvider()
    kwargs = {
        "fund_account_id": "b1",
        "amount_paise": 10_000,
        "currency": "INR",
        "reference": "a" * 32,
        "idempotency_key": "k",
        "batch_reference": "r",
    }
    monkeypatch.setattr(requests, "request", _Cashfree(requests.Timeout()))
    with pytest.raises(PayoutProviderAmbiguousError):
        provider.create_payout(**kwargs)  # type: ignore[arg-type]
    monkeypatch.setattr(requests, "request", _Cashfree(_Response(502, {})))
    with pytest.raises(PayoutProviderAmbiguousError):
        provider.create_payout(**kwargs)  # type: ignore[arg-type]
    monkeypatch.setattr(
        requests,
        "request",
        _Cashfree(_Response(400, {"code": "beneficiary_not_exist", "message": "No such"})),
    )
    with pytest.raises(PayoutProviderRejectedError) as refused:
        provider.create_payout(**kwargs)  # type: ignore[arg-type]
    assert refused.value.detail.code == "beneficiary_not_exist"


@CASHFREE
def test_a_beneficiary_is_registered_within_cashfree_limits(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cashfree = _Cashfree(_Response(HTTPStatus.CREATED, {"beneficiary_status": "VERIFIED"}))
    monkeypatch.setattr(requests, "request", cashfree)
    provider = CashfreePayoutProvider()
    partner_id = "4f1b2c3d-1111-2222-3333-444455556666"

    contact = provider.create_contact(name="S. Rao", reference_id=partner_id)
    beneficiary = provider.create_fund_account(
        contact_id=contact, holder_name="S. Rao", ifsc="HDFC0001234", account_number="123456789012"
    )

    assert BENEFICIARY_ID.match(beneficiary)
    assert "123456789012" not in beneficiary
    [call] = cashfree.calls
    assert (call["method"], call["url"]) == ("POST", f"{SANDBOX}/beneficiary")
    body = call["json"]
    assert body["beneficiary_id"] == beneficiary
    assert BENEFICIARY_NAME.match(body["beneficiary_name"])
    assert body["beneficiary_name"] == "S Rao"
    assert body["beneficiary_instrument_details"] == {
        "bank_account_number": "123456789012",
        "bank_ifsc": "HDFC0001234",
    }


@CASHFREE
def test_registering_the_same_account_again_finds_the_same_beneficiary(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = CashfreePayoutProvider()
    monkeypatch.setattr(requests, "request", _Cashfree(_Response(HTTPStatus.CREATED, {})))
    first = provider.create_fund_account(
        contact_id="vshabc", holder_name="Ravi", ifsc="HDFC0001234", account_number="1234567890"
    )
    monkeypatch.setattr(
        requests,
        "request",
        _Cashfree(
            _Response(HTTPStatus.CONFLICT, {"code": "beneficiary_id_already_exists"}),
        ),
    )
    again = provider.create_fund_account(
        contact_id="vshabc", holder_name="Ravi", ifsc="HDFC0001234", account_number="1234567890"
    )

    assert again == first


@CASHFREE
def test_an_unknown_transfer_id_is_not_found_rather_than_an_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        requests,
        "request",
        _Cashfree(_Response(HTTPStatus.NOT_FOUND, {"code": "transfer_id_not_found"})),
    )

    assert CashfreePayoutProvider().find_payout_by_reference(reference="a" * 32) is None


@CASHFREE
def test_the_2fa_signature_header_is_sent_when_a_public_key_is_set(
    monkeypatch: pytest.MonkeyPatch,
) -> None:

    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = (
        private.public_key()
        .public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
        .decode()
    )
    cashfree = _Cashfree(_Response(HTTPStatus.NOT_FOUND, {"code": "transfer_id_not_found"}))
    monkeypatch.setattr(requests, "request", cashfree)

    with override_settings(CASHFREE_PAYOUT_PUBLIC_KEY=pem):
        CashfreePayoutProvider().find_payout_by_reference(reference="a" * 32)

    signature = cashfree.calls[0]["headers"]["x-cf-signature"]

    sha1 = hashes.SHA1()  # noqa: S303 - Cashfree's scheme
    plain = private.decrypt(
        base64.b64decode(signature),
        padding.OAEP(mgf=padding.MGF1(algorithm=sha1), algorithm=sha1, label=None),
    ).decode()
    client_id, timestamp = plain.split(".")
    assert client_id == "CF_TEST_CLIENT"
    assert timestamp.isdigit()


# --------------------------------------------------------------------------------------------
# Statuses
# --------------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("status", "code", "expected"),
    [
        ("RECEIVED", "RECEIVED", "processing"),
        ("PENDING", "PENDING", "processing"),
        ("SUCCESS", "COMPLETED", "processed"),
        # Cashfree: a transfer is successful only when the status code is COMPLETED.
        ("SUCCESS", "SENT_TO_BENEFICIARY", "processing"),
        ("FAILED", "IMPS_MODE_FAIL", "failed"),
        ("REJECTED", "INVALID_MODE_FOR_PYID", "rejected"),
        ("MANUALLY_REJECTED", "", "rejected"),
        ("REVERSED", "INVALID_ACCOUNT_FAIL", "reversed"),
    ],
)
def test_cashfree_statuses_map_onto_the_shared_vocabulary(
    status: str, code: str, expected: str
) -> None:
    assert cashfree_status(status, code) == expected


def test_a_transfer_amount_in_rupees_reads_back_as_exact_paise() -> None:
    parsed = CashfreePayoutProvider.parse_transfer(
        {
            "cf_transfer_id": 991,
            "transfer_amount": 1234.56,
            "status": "SUCCESS",
            "status_code": "COMPLETED",
            "transfer_service_charge": 2.5,
            "transfer_service_tax": 0.45,
            "transfer_utr": "UTR1",
        }
    )

    assert (parsed.provider_payout_id, parsed.amount_paise) == ("991", 123_456)
    assert (parsed.fees_paise, parsed.tax_paise, parsed.utr) == (250, 45, "UTR1")
    assert parsed.status == "processed"


# --------------------------------------------------------------------------------------------
# Webhook
# --------------------------------------------------------------------------------------------


def _signed(body: bytes, timestamp: str = "1731990000") -> dict[str, Any]:
    digest = hmac.new(CLIENT_SECRET.encode(), timestamp.encode() + body, hashlib.sha256).digest()
    return {
        "HTTP_X_WEBHOOK_SIGNATURE": base64.b64encode(digest).decode(),
        "HTTP_X_WEBHOOK_TIMESTAMP": timestamp,
    }


def _event(item: PayoutBatchItem, kind: str, status: str, code: str) -> bytes:
    data = _transfer(item, status=status, status_code=code, transfer_utr="UTR9")
    return json.dumps({"data": data, "event_time": "2026-11-19T10:00:00", "type": kind}).encode()


def _deliver(body: bytes, headers: dict[str, Any]) -> Any:
    return APIClient().post(
        "/api/v1/payout-webhooks/cashfree/",
        data=body,
        content_type="application/json",
        **headers,
    )


@CASHFREE
def test_signature_verification_uses_timestamp_then_body() -> None:
    body = b'{"type":"TRANSFER_SUCCESS"}'
    headers = _signed(body)

    assert verify_cashfree_signature(
        body=body,
        signature=headers["HTTP_X_WEBHOOK_SIGNATURE"],
        timestamp=headers["HTTP_X_WEBHOOK_TIMESTAMP"],
    )
    assert not verify_cashfree_signature(
        body=body + b" ", signature=headers["HTTP_X_WEBHOOK_SIGNATURE"], timestamp="1731990000"
    )
    with override_settings(CASHFREE_PAYOUT_CLIENT_SECRET=""):
        assert not verify_cashfree_signature(body=body, signature="", timestamp="1")


@CASHFREE
def test_a_forged_cashfree_webhook_is_refused() -> None:
    response = _deliver(b'{"type":"TRANSFER_SUCCESS"}', {"HTTP_X_WEBHOOK_SIGNATURE": "x"})

    assert response.status_code == HTTPStatus.BAD_REQUEST


@CASHFREE
def test_a_success_webhook_pays_the_item_once(monkeypatch: pytest.MonkeyPatch) -> None:
    item = _reserved_item("cf-webhook")
    monkeypatch.setattr(requests, "request", _Cashfree(_Response(HTTPStatus.OK, _transfer(item))))
    submit_payout_item(item_id=item.id)
    body = _event(item, "TRANSFER_SUCCESS", "SUCCESS", "COMPLETED")

    first = _deliver(body, _signed(body))
    again = _deliver(body, _signed(body))

    assert first.status_code == HTTPStatus.OK
    assert first.json() == {"accepted": True, "applied": True}
    assert again.json() == {"accepted": True, "applied": False}
    item.refresh_from_db()
    assert item.status == PayoutBatchItem.Status.PAID
    assert item.utr == "UTR9"
    assert PayoutWebhookEvent.objects.filter(provider_payout_id="cf_1").count() == 1


@CASHFREE
def test_a_failed_webhook_returns_the_money_to_the_pool(monkeypatch: pytest.MonkeyPatch) -> None:
    item = _reserved_item("cf-webhook-failed")
    monkeypatch.setattr(requests, "request", _Cashfree(_Response(HTTPStatus.OK, _transfer(item))))
    submit_payout_item(item_id=item.id)
    body = _event(item, "TRANSFER_FAILED", "FAILED", "IMPS_MODE_FAIL")

    _deliver(body, _signed(body))

    item.refresh_from_db()
    assert item.status == PayoutBatchItem.Status.FAILED


# --------------------------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------------------------


@override_settings(
    PAYOUT_PROVIDER="cashfree",
    PAYOUTS_LIVE_ENABLED=False,
    CASHFREE_PAYOUT_CLIENT_ID="CF_TEST_CLIENT",
    CASHFREE_PAYOUT_CLIENT_SECRET=CLIENT_SECRET,
)
def test_cashfree_registers_accounts_without_activation_but_pays_only_with_it() -> None:
    assert isinstance(get_payout_account_provider(), CashfreePayoutProvider)
    with pytest.raises(PayoutProviderError):
        get_payout_provider()


@override_settings(PAYOUT_PROVIDER="cashfree", CASHFREE_PAYOUT_CLIENT_ID="")
def test_cashfree_without_credentials_is_refused() -> None:
    with pytest.raises(PayoutProviderError):
        get_payout_account_provider()


def test_the_live_cashfree_host_is_refused_outside_production() -> None:
    guard_cashfree_sandbox(SANDBOX)
    with pytest.raises(ImproperlyConfigured):
        guard_cashfree_sandbox("https://api.cashfree.com/payout")
