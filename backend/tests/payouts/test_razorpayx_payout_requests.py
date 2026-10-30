"""What a payout request to RazorpayX carries, checked against RazorpayX's own published limits.

Every other payout test drives the fake provider, which accepts anything. That is how an
80-character idempotency key with colons and a `reference_id` of 37+ characters shipped: RazorpayX
allows 4-36 characters (letters, digits, `-`, `_`, space) and 40, and would have refused every
payout in the first real run. The limits below are copied from the RazorpayX API reference rather
than imported from the adapter, because a test that reads the adapter's own constants would agree
with it however wrong it was.
"""

import hashlib
import logging
import re
import uuid
from http import HTTPStatus
from typing import Any

import pytest
import requests
from django.test import override_settings

from apps.payouts.models import PartnerLedgerEntry, PayoutBatchItem
from apps.payouts.providers import PayoutProviderRejectedError, RazorpayXPayoutProvider
from apps.payouts.services import payout_idempotency_key, submit_payout_item
from tests.payouts.test_payout_submission import _reserved_item

pytestmark = [
    pytest.mark.django_db(transaction=True),
    # `_reserved_item` delivers a visit booked for tomorrow through en route and arrival; the
    # clock gates on those steps are tested in tests/fulfilment/test_partner_time_gates.py.
    pytest.mark.usefixtures("partner_gates_open"),
]

#: RazorpayX: `X-Payout-Idempotency` is 4 to 36 letters, digits, hyphens, underscores or spaces.
IDEMPOTENCY_KEY = re.compile(r"^[A-Za-z0-9 _-]{4,36}$")
#: RazorpayX: `reference_id` is at most 40 characters.
REFERENCE_ID_MAX = 40
#: RazorpayX: `narration` is at most 30 letters, digits and spaces.
NARRATION = re.compile(r"^[A-Za-z0-9 ]{1,30}$")

ACCOUNT_NUMBER = "2323230000000000"
KEY_SECRET = hashlib.sha256(b"razorpayx-key").hexdigest()
RAZORPAYX = override_settings(
    PAYOUT_PROVIDER="razorpayx",
    PAYOUTS_LIVE_ENABLED=True,
    RAZORPAYX_KEY_ID="rzp_test_x",
    RAZORPAYX_KEY_SECRET=KEY_SECRET,
    RAZORPAYX_ACCOUNT_NUMBER=ACCOUNT_NUMBER,
    RAZORPAYX_API_BASE_URL="https://api.razorpay.com/v1",
)
#: The longest batch reference Operations can type (`PayoutBatch.reference`), so every limit is
#: checked at its edge rather than with a short friendly name.
LONGEST_BATCH_REFERENCE = "w" * 64


class _Response:
    def __init__(self, status_code: int, body: object) -> None:
        self.status_code = status_code
        self._body = body

    def json(self) -> object:
        if isinstance(self._body, Exception):
            raise self._body
        return self._body


class _RazorpayX:
    """Stands in for `requests.request`: one canned answer, and a record of every call."""

    def __init__(self, response: _Response) -> None:
        self.response = response
        self.calls: list[dict[str, Any]] = []

    def __call__(self, method: str, url: str, **kwargs: Any) -> _Response:
        self.calls.append({"method": method, "url": url, **kwargs})
        return self.response


def _accepted(item: PayoutBatchItem) -> _Response:
    return _Response(
        HTTPStatus.OK,
        {"id": "pout_1", "amount": item.amount_paise, "currency": "INR", "status": "processing"},
    )


def _refused(*, description: str, reason: str, field: str) -> dict[str, object]:
    """RazorpayX's error body, in the shape its API reference documents."""

    return {
        "error": {
            "code": "BAD_REQUEST_ERROR",
            "description": description,
            "source": "business",
            "step": "payout_initiation",
            "reason": reason,
            "metadata": {},
            "field": field,
        }
    }


def _provider_records(caplog: pytest.LogCaptureFixture) -> list[logging.LogRecord]:
    return [record for record in caplog.records if record.name == "apps.payouts.providers"]


# --------------------------------------------------------------------------------------------
# The request
# --------------------------------------------------------------------------------------------


@RAZORPAYX
def test_a_payout_request_fits_every_razorpayx_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    item = _reserved_item("rzpx-shape", reference=LONGEST_BATCH_REFERENCE)
    razorpayx = _RazorpayX(_accepted(item))
    monkeypatch.setattr(requests, "request", razorpayx)

    submitted = submit_payout_item(item_id=item.id)

    assert submitted.status == PayoutBatchItem.Status.SUBMITTED
    assert submitted.provider_payout_id == "pout_1"
    [call] = razorpayx.calls
    assert (call["method"], call["url"]) == ("POST", "https://api.razorpay.com/v1/payouts")
    key = call["headers"]["X-Payout-Idempotency"]
    assert IDEMPOTENCY_KEY.match(key), key
    assert key == payout_idempotency_key(batch_id=item.batch_id, partner_id=item.partner_id)
    payload = call["json"]
    assert payload["reference_id"] == item.id.hex
    assert len(payload["reference_id"]) <= REFERENCE_ID_MAX
    assert NARRATION.match(payload["narration"]), payload["narration"]
    assert payload["notes"] == {"batch_reference": LONGEST_BATCH_REFERENCE}
    assert payload["account_number"] == ACCOUNT_NUMBER
    assert payload["fund_account_id"] == "fa_test"
    assert payload["amount"] == item.amount_paise
    assert type(payload["amount"]) is int  # paise, never a rupee float
    assert (payload["currency"], payload["mode"], payload["purpose"]) == ("INR", "IMPS", "payout")
    assert call["auth"] == ("rzp_test_x", KEY_SECRET)


def test_the_idempotency_key_is_stable_for_one_partner_in_one_batch() -> None:
    """A resubmission must carry the same key, or RazorpayX sees a new payout and pays again."""

    batch, partner, other = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()

    key = payout_idempotency_key(batch_id=batch, partner_id=partner)

    assert key == payout_idempotency_key(batch_id=batch, partner_id=partner)
    assert key != payout_idempotency_key(batch_id=batch, partner_id=other)
    assert key != payout_idempotency_key(batch_id=other, partner_id=partner)
    assert IDEMPOTENCY_KEY.match(key)


@RAZORPAYX
@pytest.mark.parametrize(
    ("reference", "key", "reason"),
    [
        # The form every item used to carry: 80 characters, with colons.
        (uuid.uuid4().hex, f"payout:{uuid.uuid4()}:{uuid.uuid4()}", "idempotency_key_invalid"),
        (uuid.uuid4().hex, "abc", "idempotency_key_invalid"),
        ("r" * 41, str(uuid.uuid4()), "reference_id_invalid"),
    ],
)
def test_a_request_outside_razorpayx_limits_is_never_sent(
    monkeypatch: pytest.MonkeyPatch, reference: str, key: str, reason: str
) -> None:
    razorpayx = _RazorpayX(_Response(HTTPStatus.OK, {}))
    monkeypatch.setattr(requests, "request", razorpayx)

    with pytest.raises(PayoutProviderRejectedError) as refused:
        RazorpayXPayoutProvider().create_payout(
            fund_account_id="fa_1",
            amount_paise=10_000,
            currency="INR",
            reference=reference,
            idempotency_key=key,
            batch_reference="weekly-2026-w44",
        )

    assert refused.value.detail.reason == reason
    assert razorpayx.calls == []


@RAZORPAYX
def test_an_item_reserved_under_the_old_key_fails_cleanly_and_its_money_returns(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An item reserved before the key changed never reaches RazorpayX, which would refuse it.
    Refusing it locally is the same outcome — nothing sent, nothing moved — so its ledger entry
    goes back to the pool and the next batch reserves it under a valid key."""

    item = _reserved_item("rzpx-old-key")
    PayoutBatchItem.objects.filter(id=item.id).update(
        idempotency_key=f"payout:{item.batch_id}:{item.partner_id}"
    )
    razorpayx = _RazorpayX(_accepted(item))
    monkeypatch.setattr(requests, "request", razorpayx)

    failed = submit_payout_item(item_id=item.id)

    assert razorpayx.calls == []
    assert failed.status == PayoutBatchItem.Status.FAILED
    assert failed.failure_code == "idempotency_key_invalid"
    assert PartnerLedgerEntry.objects.get(payout_lines__item=item).status == (
        PartnerLedgerEntry.Status.RELEASED
    )


# --------------------------------------------------------------------------------------------
# What a refusal records
# --------------------------------------------------------------------------------------------


@RAZORPAYX
def test_a_razorpayx_refusal_records_why_and_returns_the_money(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    item = _reserved_item("rzpx-refused")
    body = _refused(
        description="The fund account id provided does not exist",
        reason="input_validation_failed",
        field="fund_account_id",
    )
    monkeypatch.setattr(requests, "request", _RazorpayX(_Response(HTTPStatus.BAD_REQUEST, body)))

    with caplog.at_level(logging.WARNING, logger="apps.payouts.providers"):
        failed = submit_payout_item(item_id=item.id)

    assert failed.status == PayoutBatchItem.Status.FAILED
    assert failed.failure_code == "input_validation_failed-fund_account_id"
    assert PartnerLedgerEntry.objects.get(payout_lines__item=item).status == (
        PartnerLedgerEntry.Status.RELEASED
    )
    [record] = _provider_records(caplog)
    logged = record.__dict__
    assert logged["http_status"] == HTTPStatus.BAD_REQUEST
    assert logged["provider_error_field"] == "fund_account_id"
    assert logged["provider_error_description"] == "The fund account id provided does not exist"
    # The request body can hold a bank account number; the log line never carries it.
    assert ACCOUNT_NUMBER not in record.getMessage()
    assert ACCOUNT_NUMBER not in str(logged)


@RAZORPAYX
@pytest.mark.parametrize(
    ("status_code", "body", "expected"),
    [
        # Wrong keys: RazorpayX writes "NA" for the reason and field it does not have.
        (
            HTTPStatus.UNAUTHORIZED,
            _refused(description="Authentication failed", reason="NA", field="NA"),
            "authentication-failed",
        ),
        # Nothing readable at all still fails closed, with the old generic code.
        (HTTPStatus.BAD_REQUEST, ValueError("not JSON"), "provider_rejected"),
    ],
)
def test_a_refusal_with_little_to_say_still_records_what_it_can(
    monkeypatch: pytest.MonkeyPatch, status_code: int, body: object, expected: str
) -> None:
    item = _reserved_item(f"rzpx-sparse-{status_code}")
    monkeypatch.setattr(requests, "request", _RazorpayX(_Response(status_code, body)))

    failed = submit_payout_item(item_id=item.id)

    assert failed.status == PayoutBatchItem.Status.FAILED
    assert failed.failure_code == expected


@RAZORPAYX
def test_a_razorpayx_server_error_is_still_ambiguous_and_keeps_the_reservation(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """Logging the error body must not turn a 5xx into a rejection: the payout may have gone
    out, and releasing the entry is how a Partner gets paid twice."""

    item = _reserved_item("rzpx-5xx")
    body = _refused(description="Server is busy", reason="NA", field="NA")
    monkeypatch.setattr(
        requests, "request", _RazorpayX(_Response(HTTPStatus.SERVICE_UNAVAILABLE, body))
    )

    with caplog.at_level(logging.WARNING, logger="apps.payouts.providers"):
        parked = submit_payout_item(item_id=item.id)

    assert parked.status == PayoutBatchItem.Status.UNDER_REVIEW
    assert parked.failure_code == "provider_ambiguous"
    assert PartnerLedgerEntry.objects.get(payout_lines__item=item).status == (
        PartnerLedgerEntry.Status.RESERVED
    )
    [record] = _provider_records(caplog)
    assert record.__dict__["http_status"] == HTTPStatus.SERVICE_UNAVAILABLE
