"""Bank account checks: every account a Partner adds is checked with the bank first (Cashfree).

The rules asserted here:

* an account the bank says cannot receive money is refused, and nothing reaches the payout
  provider, the database or the Operations queue;
* a check that did not finish is a retryable refusal, never an account saved unchecked;
* a Cashfree deployment without verification keys refuses to add accounts rather than skip
  the check, and Operations cannot verify an account that was never checked;
* the bank's own name for the account reaches the reviewer.

Cashfree's request and answer shapes are copied from its BAV V2 reference rather than read from
the adapter, so a test cannot agree with the adapter just because both are wrong.
"""

import hashlib
import json
import logging
import re
from http import HTTPStatus
from typing import Any

import pytest
import requests
from django.core.exceptions import ImproperlyConfigured
from django.test import override_settings

from apps.payouts.models import PartnerPayoutAccount
from apps.payouts.providers import (
    BankAccountCheck,
    CashfreeBankAccountVerifier,
    FakeBankAccountVerifier,
    PayoutProviderAmbiguousError,
    PayoutProviderError,
    PayoutProviderRejectedError,
    get_bank_account_verifier,
)
from apps.payouts.services import register_payout_account
from config.settings.guards import guard_cashfree_verification_sandbox
from tests.payouts.test_payout_accounts import (
    ACCOUNT_NUMBER,
    FAKE_PROVIDER,
    _operations,
    _partner,
    _submit,
)

pytestmark = [
    pytest.mark.django_db(transaction=True),
    pytest.mark.usefixtures("partner_gates_open"),
]

VERIFICATION_SANDBOX = "https://sandbox.cashfree.com/verification"
VERIFICATION_SECRET = hashlib.sha256(b"cashfree-verification-secret").hexdigest()
PAYOUT_SECRET = hashlib.sha256(b"cashfree-payout-secret").hexdigest()
CASHFREE_WITH_CHECKS = override_settings(
    PAYOUT_PROVIDER="cashfree",
    CASHFREE_PAYOUT_API_BASE_URL="https://sandbox.cashfree.com/payout",
    CASHFREE_PAYOUT_CLIENT_ID="CF_PAYOUT_CLIENT",
    CASHFREE_PAYOUT_CLIENT_SECRET=PAYOUT_SECRET,
    CASHFREE_PAYOUT_PUBLIC_KEY="",
    CASHFREE_VERIFICATION_API_BASE_URL=VERIFICATION_SANDBOX,
    CASHFREE_VERIFICATION_CLIENT_ID="CF_VERIFY_CLIENT",
    CASHFREE_VERIFICATION_CLIENT_SECRET=VERIFICATION_SECRET,
    CASHFREE_VERIFICATION_PUBLIC_KEY="",
)
#: Cashfree BAV `name`: letters, digits, space and `. - / &`, at most 100.
BAV_NAME = r"^[A-Za-z0-9 .\-/&]{1,100}$"


class _Response:
    def __init__(self, status_code: int, body: object) -> None:
        self.status_code = status_code
        self._body = body

    def json(self) -> object:
        return self._body


class _Recorder:
    """Stands in for `requests.post` / `requests.request`: canned answers, every call kept."""

    def __init__(self, *responses: _Response | Exception) -> None:
        self.responses = list(responses)
        self.calls: list[dict[str, Any]] = []

    def __call__(self, *args: Any, **kwargs: Any) -> _Response:
        self.calls.append({"args": args, **kwargs})
        answer = self.responses.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer


def _valid(**extra: object) -> dict[str, object]:
    return {
        "reference_id": 34,
        "name_at_bank": "RAVI KUMAR",
        "bank_name": "STATE BANK OF INDIA",
        "utr": "1234567890",
        "city": "HYDERABAD",
        "branch": "AMEERPET",
        "micr": 500002001,
        "name_match_score": "100.00",
        "name_match_result": "DIRECT_MATCH",
        "account_status": "VALID",
        "account_status_code": "ACCOUNT_IS_VALID",
        **extra,
    }


def _invalid(code: str) -> dict[str, object]:
    # Cashfree answers an invalid account with a 200 and nulls where the bank gave nothing.
    return {
        "reference_id": 35,
        "name_at_bank": None,
        "bank_name": None,
        "utr": None,
        "name_match_score": None,
        "name_match_result": None,
        "account_status": "INVALID",
        "account_status_code": code,
    }


def _error(code: str, kind: str = "validation_error") -> dict[str, object]:
    return {"type": kind, "code": code, "message": f"Cashfree said {code}"}


def _check(monkeypatch: pytest.MonkeyPatch, *answers: _Response | Exception) -> _Recorder:
    recorder = _Recorder(*answers)
    monkeypatch.setattr(requests, "post", recorder)
    return recorder


def _verify(holder_name: str = "Ravi Kumar") -> BankAccountCheck:
    return CashfreeBankAccountVerifier().verify_bank_account(
        account_number=ACCOUNT_NUMBER, ifsc="SBIN0001234", holder_name=holder_name
    )


# --------------------------------------------------------------------------------------------
# The Cashfree adapter
# --------------------------------------------------------------------------------------------


@CASHFREE_WITH_CHECKS
def test_the_check_request_fits_cashfree_and_uses_the_verification_keys(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    recorder = _check(monkeypatch, _Response(HTTPStatus.OK, _valid()))

    check = _verify(holder_name="Ravi Kumar\u2019s (Shop) & Co")

    call = recorder.calls[0]
    assert call["args"][0] == f"{VERIFICATION_SANDBOX}/bank-account/sync"
    assert call["json"]["bank_account"] == ACCOUNT_NUMBER
    assert call["json"]["ifsc"] == "SBIN0001234"
    assert re.match(BAV_NAME, call["json"]["name"])
    assert call["headers"]["x-client-id"] == "CF_VERIFY_CLIENT"
    assert call["headers"]["x-client-secret"] == VERIFICATION_SECRET
    assert "x-cf-signature" not in call["headers"]
    assert call["timeout"][1] >= 30
    assert check == BankAccountCheck(
        is_valid=True,
        status_code="ACCOUNT_IS_VALID",
        name_at_bank="RAVI KUMAR",
        name_match_result="DIRECT_MATCH",
        name_match_score="100.00",
        reference="34",
    )


@CASHFREE_WITH_CHECKS
@pytest.mark.parametrize(
    "code", ["INVALID_ACCOUNT_FAIL", "ACCOUNT_BLOCKED", "INVALID_IFSC_FAIL", "NRE_ACCOUNT_FAIL"]
)
def test_an_invalid_account_is_an_answer_with_the_banks_reason(
    monkeypatch: pytest.MonkeyPatch, code: str
) -> None:
    _check(monkeypatch, _Response(HTTPStatus.OK, _invalid(code)))

    check = _verify()

    assert check.is_valid is False
    assert check.status_code == code
    assert check.name_at_bank == ""
    assert check.name_match_result == ""


@CASHFREE_WITH_CHECKS
def test_a_fraud_flag_is_an_invalid_account_not_a_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _check(monkeypatch, _Response(HTTPStatus.UNPROCESSABLE_ENTITY, _error("fraud_account")))

    check = _verify()

    assert check.is_valid is False
    assert check.status_code == "FRAUD_ACCOUNT"


@CASHFREE_WITH_CHECKS
@pytest.mark.parametrize(
    "answer",
    [
        requests.Timeout("slow"),
        requests.ConnectionError("reset"),
        _Response(HTTPStatus.UNPROCESSABLE_ENTITY, _error("npci_unavailable")),
        _Response(HTTPStatus.UNPROCESSABLE_ENTITY, _error("failed_at_bank")),
        _Response(HTTPStatus.UNPROCESSABLE_ENTITY, _error("insufficient_balance")),
        _Response(HTTPStatus.TOO_MANY_REQUESTS, _error("too_many_requests_per_ip", "rate")),
        _Response(HTTPStatus.INTERNAL_SERVER_ERROR, _error("verification_failed", "internal")),
        _Response(HTTPStatus.BAD_GATEWAY, _error("verification_failed", "internal")),
        _Response(HTTPStatus.OK, {"reference_id": 1}),
        _Response(HTTPStatus.OK, ["not", "an", "object"]),
    ],
)
def test_a_check_that_did_not_finish_is_ambiguous(
    monkeypatch: pytest.MonkeyPatch, answer: _Response | Exception
) -> None:
    _check(monkeypatch, answer)

    with pytest.raises(PayoutProviderAmbiguousError):
        _verify()


@CASHFREE_WITH_CHECKS
def test_details_cashfree_refuses_are_a_rejection(monkeypatch: pytest.MonkeyPatch) -> None:
    _check(
        monkeypatch,
        _Response(HTTPStatus.BAD_REQUEST, _error("bank_account_value_invalid")),
    )

    with pytest.raises(PayoutProviderRejectedError):
        _verify()


@CASHFREE_WITH_CHECKS
@pytest.mark.parametrize(
    ("status", "code"),
    [
        (HTTPStatus.UNAUTHORIZED, "authentication_failed"),
        (HTTPStatus.FORBIDDEN, "ip_validation_failed"),
        (HTTPStatus.BAD_REQUEST, "invalid_request"),
    ],
)
def test_a_misconfiguration_is_ours_to_fix_not_the_partners(
    monkeypatch: pytest.MonkeyPatch, status: int, code: str
) -> None:
    _check(monkeypatch, _Response(status, _error(code, "authentication_error")))

    with pytest.raises(PayoutProviderError) as raised:
        _verify()

    assert not isinstance(raised.value, (PayoutProviderAmbiguousError, PayoutProviderRejectedError))


@CASHFREE_WITH_CHECKS
def test_the_account_number_is_never_logged(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    _check(monkeypatch, _Response(HTTPStatus.UNPROCESSABLE_ENTITY, _error("failed_at_bank")))

    with caplog.at_level(logging.DEBUG), pytest.raises(PayoutProviderAmbiguousError):
        _verify()

    logged = " ".join(f"{record.getMessage()} {record.__dict__}" for record in caplog.records)
    assert ACCOUNT_NUMBER not in logged


# --------------------------------------------------------------------------------------------
# Which verifier, and when it is required
# --------------------------------------------------------------------------------------------


@CASHFREE_WITH_CHECKS
def test_cashfree_checks_with_its_own_verification_keys() -> None:
    assert isinstance(get_bank_account_verifier(), CashfreeBankAccountVerifier)


@override_settings(
    PAYOUT_PROVIDER="cashfree",
    CASHFREE_PAYOUT_CLIENT_ID="CF_PAYOUT_CLIENT",
    CASHFREE_PAYOUT_CLIENT_SECRET=PAYOUT_SECRET,
    CASHFREE_VERIFICATION_CLIENT_ID="",
    CASHFREE_VERIFICATION_CLIENT_SECRET="",
)
def test_cashfree_without_verification_keys_refuses_rather_than_skips() -> None:
    with pytest.raises(PayoutProviderError):
        get_bank_account_verifier()
    client, profile = _partner()

    response = _submit(client)

    assert response.status_code == HTTPStatus.SERVICE_UNAVAILABLE
    assert response.json()["error"]["code"] == "payout_accounts_unavailable"
    assert not PartnerPayoutAccount.objects.filter(partner=profile).exists()


@override_settings(PAYOUT_PROVIDER="razorpayx")
def test_razorpayx_has_no_bank_check() -> None:
    assert get_bank_account_verifier() is None


@FAKE_PROVIDER
def test_development_uses_the_fake_check() -> None:
    assert isinstance(get_bank_account_verifier(), FakeBankAccountVerifier)


def test_the_live_verification_host_is_refused_outside_production() -> None:
    guard_cashfree_verification_sandbox(VERIFICATION_SANDBOX)
    with pytest.raises(ImproperlyConfigured):
        guard_cashfree_verification_sandbox("https://api.cashfree.com/verification")


# --------------------------------------------------------------------------------------------
# Adding an account
# --------------------------------------------------------------------------------------------


@FAKE_PROVIDER
def test_a_checked_account_carries_the_banks_answer() -> None:
    client, profile = _partner()

    response = _submit(client)

    assert response.status_code == HTTPStatus.CREATED
    account = PartnerPayoutAccount.objects.get(partner=profile)
    assert account.bank_check_provider == "fake"
    assert account.bank_checked_at is not None
    assert account.name_at_bank == "RAVI KUMAR"
    assert account.name_match_result == "DIRECT_MATCH"
    assert account.status == PartnerPayoutAccount.Status.PENDING
    # The Partner's own view does not change: the bank's name is for the reviewer.
    assert "name_at_bank" not in response.json()


@FAKE_PROVIDER
def test_an_account_the_bank_refuses_is_never_saved() -> None:
    client, profile = _partner()

    response = _submit(client, holder_name="Invalid Name")

    assert response.status_code == HTTPStatus.BAD_REQUEST
    error = response.json()["error"]
    assert error["code"] == "payout_account_not_valid_at_bank"
    assert error["details"]["bank_status"] == "INVALID_ACCOUNT_FAIL"
    assert ACCOUNT_NUMBER not in json.dumps(response.json())
    assert not PartnerPayoutAccount.objects.filter(partner=profile).exists()


@FAKE_PROVIDER
def test_a_refused_account_does_not_replace_the_earlier_one() -> None:
    client, _ = _partner()
    first = _submit(client).json()["id"]

    _submit(client, holder_name="Invalid Name")

    assert PartnerPayoutAccount.objects.get(id=first).status == PartnerPayoutAccount.Status.PENDING


@FAKE_PROVIDER
def test_a_check_that_did_not_finish_saves_nothing_and_can_be_retried() -> None:
    client, profile = _partner()

    response = _submit(client, holder_name="Unreachable Name")

    assert response.status_code == HTTPStatus.SERVICE_UNAVAILABLE
    error = response.json()["error"]
    assert error["code"] == "payout_account_bank_check_unavailable"
    assert error["retryable"] is True
    assert not PartnerPayoutAccount.objects.filter(partner=profile).exists()


@CASHFREE_WITH_CHECKS
def test_on_cashfree_the_bank_is_asked_before_the_beneficiary_is_created(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    check = _check(monkeypatch, _Response(HTTPStatus.OK, _invalid("ACCOUNT_BLOCKED")))
    beneficiary = _Recorder()
    monkeypatch.setattr(requests, "request", beneficiary)
    client, profile = _partner()

    response = _submit(client)

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert response.json()["error"]["details"]["bank_status"] == "ACCOUNT_BLOCKED"
    assert len(check.calls) == 1
    assert beneficiary.calls == []
    assert not PartnerPayoutAccount.objects.filter(partner=profile).exists()


@CASHFREE_WITH_CHECKS
def test_on_cashfree_a_valid_account_is_registered_with_the_banks_name(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _check(
        monkeypatch,
        _Response(
            HTTPStatus.OK,
            _valid(name_at_bank="R KUMAR", name_match_result="GOOD_PARTIAL_MATCH"),
        ),
    )
    beneficiary = _Recorder(_Response(HTTPStatus.CREATED, {"beneficiary_id": "x"}))
    monkeypatch.setattr(requests, "request", beneficiary)
    client, profile = _partner()

    response = _submit(client)

    assert response.status_code == HTTPStatus.CREATED
    assert len(beneficiary.calls) == 1
    account = PartnerPayoutAccount.objects.get(partner=profile)
    assert account.bank_check_provider == "cashfree"
    assert account.bank_check_reference == "34"
    assert account.name_at_bank == "R KUMAR"
    assert account.name_match_result == "GOOD_PARTIAL_MATCH"


# --------------------------------------------------------------------------------------------
# Operations review
# --------------------------------------------------------------------------------------------


@FAKE_PROVIDER
def test_the_reviewer_sees_the_name_the_bank_holds() -> None:
    partner_client, profile = _partner()
    _submit(partner_client, holder_name="Mismatch Name")
    ops, _ = _operations(stepped_up=False)

    rows = ops.get("/api/v1/operations/payout-accounts/").json()["results"]

    row = next(row for row in rows if row["partner_id"] == str(profile.id))
    assert row["holder_name"] == "Mismatch Name"
    assert row["name_at_bank"] == "SOMEONE ELSE"
    assert row["name_match_result"] == "NO_MATCH"
    assert row["bank_check_provider"] == "fake"
    assert row["bank_checked_at"] is not None
    assert row["is_missing_required_bank_check"] is False


@CASHFREE_WITH_CHECKS
def test_on_cashfree_an_unchecked_account_cannot_be_verified() -> None:
    _, profile = _partner()
    # Registered before checks existed: the provider has it, the bank was never asked.
    account = register_payout_account(
        partner_id=profile.id,
        account_last4="9012",
        ifsc="SBIN0001234",
        holder_name="Ravi Kumar",
        provider_contact_id="vshcontact",
        provider_fund_account_id="vshcontact_abc",
    )
    ops, _ = _operations(stepped_up=True)

    listed = ops.get("/api/v1/operations/payout-accounts/").json()["results"]
    response = ops.post(f"/api/v1/operations/payout-accounts/{account.id}/verify/")

    row = next(row for row in listed if row["id"] == str(account.id))
    assert row["is_missing_required_bank_check"] is True
    assert response.status_code == HTTPStatus.CONFLICT
    assert response.json()["error"]["code"] == "payout_account_review_invalid"
    account.refresh_from_db()
    assert account.status == PartnerPayoutAccount.Status.PENDING


@CASHFREE_WITH_CHECKS
def test_on_cashfree_a_checked_account_can_be_verified() -> None:
    _, profile = _partner()
    account = register_payout_account(
        partner_id=profile.id,
        account_last4="9012",
        ifsc="SBIN0001234",
        holder_name="Ravi Kumar",
        provider_contact_id="vshcontact",
        provider_fund_account_id="vshcontact_abc",
        bank_check=BankAccountCheck(
            is_valid=True, status_code="ACCOUNT_IS_VALID", name_at_bank="RAVI KUMAR"
        ),
        bank_check_provider="cashfree",
    )
    ops, _ = _operations(stepped_up=True)

    response = ops.post(f"/api/v1/operations/payout-accounts/{account.id}/verify/")

    assert response.status_code == HTTPStatus.OK
    assert response.json()["status"] == "VERIFIED"


@CASHFREE_WITH_CHECKS
def test_an_account_verified_before_checks_existed_is_not_flagged() -> None:
    _, profile = _partner()
    account = register_payout_account(
        partner_id=profile.id,
        account_last4="9012",
        ifsc="SBIN0001234",
        holder_name="Ravi Kumar",
        provider_contact_id="vshcontact",
        provider_fund_account_id="vshcontact_abc",
    )
    PartnerPayoutAccount.objects.filter(id=account.id).update(
        status=PartnerPayoutAccount.Status.VERIFIED
    )
    ops, _ = _operations(stepped_up=False)

    rows = ops.get("/api/v1/operations/payout-accounts/?status=VERIFIED").json()["results"]

    row = next(row for row in rows if row["id"] == str(account.id))
    assert row["is_missing_required_bank_check"] is False


# --------------------------------------------------------------------------------------------
# One bank account, one beneficiary at Cashfree
# --------------------------------------------------------------------------------------------


def _conflict() -> _Response:
    return _Response(
        HTTPStatus.CONFLICT,
        {
            "type": "invalid_request_error",
            "code": "conflict_with_existing_beneficiary",
            "message": "Beneficiary with the given account and IFSC already exists",
        },
    )


@CASHFREE_WITH_CHECKS
def test_a_beneficiary_nobody_here_holds_is_reused(monkeypatch: pytest.MonkeyPatch) -> None:
    _check(monkeypatch, _Response(HTTPStatus.OK, _valid()))
    payouts = _Recorder(
        _conflict(),
        _Response(
            HTTPStatus.OK, {"beneficiary_id": "vshleftover_abc", "beneficiary_status": "VERIFIED"}
        ),
    )
    monkeypatch.setattr(requests, "request", payouts)
    client, profile = _partner()

    response = _submit(client)

    assert response.status_code == HTTPStatus.CREATED
    lookup = payouts.calls[1]
    assert lookup["args"][:2] == ("GET", "https://sandbox.cashfree.com/payout/beneficiary")
    assert lookup["params"] == {"bank_account_number": ACCOUNT_NUMBER, "bank_ifsc": "SBIN0001234"}
    account = PartnerPayoutAccount.objects.get(partner=profile)
    assert account.provider_fund_account_id == "vshleftover_abc"


@CASHFREE_WITH_CHECKS
def test_a_bank_account_another_partner_holds_is_refused(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, other = _partner()
    register_payout_account(
        partner_id=other.id,
        account_last4="9012",
        ifsc="SBIN0001234",
        holder_name="Ravi Kumar",
        provider_contact_id="vshother",
        provider_fund_account_id="vshother_abc",
    )
    _check(monkeypatch, _Response(HTTPStatus.OK, _valid()))
    monkeypatch.setattr(
        requests,
        "request",
        _Recorder(_conflict(), _Response(HTTPStatus.OK, {"beneficiary_id": "vshother_abc"})),
    )
    client, profile = _partner()

    response = _submit(client)

    assert response.status_code == HTTPStatus.CONFLICT
    assert response.json()["error"]["code"] == "payout_account_in_use"
    assert not PartnerPayoutAccount.objects.filter(partner=profile).exists()


@CASHFREE_WITH_CHECKS
def test_an_existing_beneficiary_that_cannot_be_found_is_ambiguous(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _check(monkeypatch, _Response(HTTPStatus.OK, _valid()))
    monkeypatch.setattr(requests, "request", _Recorder(_conflict(), _Response(HTTPStatus.OK, {})))
    client, profile = _partner()

    response = _submit(client)

    assert response.status_code == HTTPStatus.SERVICE_UNAVAILABLE
    assert response.json()["error"]["code"] == "payout_account_provider_unavailable"
    assert not PartnerPayoutAccount.objects.filter(partner=profile).exists()
