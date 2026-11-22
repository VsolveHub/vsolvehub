"""Payout provider boundary: RazorpayX or Cashfree Payouts, a deterministic fake for tests.

The shape mirrors `apps.commerce.providers` on purpose, and so does the one distinction that
matters most:

**Ambiguous is not failed.** A timeout, a connection reset or a 5xx means the payout *may* have
gone out. Treating that as a failure and releasing the ledger entry back to the pool is how a
Partner gets paid twice — the first attempt lands late, the entry is already in a second batch,
and both settle. `PayoutProviderAmbiguousError` therefore parks the item at `UNDER_REVIEW` and
hands it to Finance, which is slower and correct. Only an explicit provider rejection is a
failure, because only that tells us no money moved.

Outbound payouts are more dangerous than inbound payments — a wrong capture can be refunded, a
wrong payout has left. So the fail-closed check in `get_payout_provider` is deliberately stricter
than the payments one: production refuses to start without both credentials *and* explicit
activation.
"""

import base64
import hashlib
import hmac
import logging
import re
import time
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from http import HTTPStatus
from typing import Any, Protocol, cast

import requests
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from django.conf import settings

logger = logging.getLogger(__name__)

#: RazorpayX's own limits on a payout request. Checked before sending, because breaking any of
#: them is a 400 on every payout in a batch — the request is refused, never half-applied.
#: `X-Payout-Idempotency`: 4 to 36 letters, digits, hyphens, underscores or spaces.
_IDEMPOTENCY_KEY = re.compile(r"^[A-Za-z0-9 _-]{4,36}$")
#: `reference_id`: at most 40 characters.
REFERENCE_ID_MAX_LENGTH = 40
#: `narration` is what the Partner's bank statement shows: at most 30 letters, digits and spaces,
#: and banks may cut it after nine, so the brand comes first.
PAYOUT_NARRATION = "VSolveHub payout"

#: Longest provider text kept on an exception or in a log line.
_DETAIL_MAX_LENGTH = 240


@dataclass(frozen=True, slots=True)
class ProviderErrorDetail:
    """What RazorpayX said when it refused, from its `{"error": {...}}` body.

    Empty strings when the body had none of it. RazorpayX writes `"NA"` for a reason it does not
    have, which is stored as empty rather than as a reason called "NA".
    """

    http_status: int | None = None
    code: str = ""
    reason: str = ""
    field: str = ""
    description: str = ""


class PayoutProviderError(RuntimeError):
    """The provider could not be used at all."""


class PayoutProviderAmbiguousError(PayoutProviderError):
    """We do not know whether money moved. Never retried automatically."""


class PayoutProviderRejectedError(PayoutProviderError):
    """The provider explicitly refused. No money moved, so a retry is safe.

    `detail` carries the provider's reason, so a refused payout says *why* rather than only that
    it was refused.
    """

    def __init__(self, message: str, *, detail: ProviderErrorDetail | None = None) -> None:
        super().__init__(message)
        self.detail = detail or ProviderErrorDetail()


@dataclass(frozen=True, slots=True)
class ProviderPayout:
    provider_payout_id: str
    amount_paise: int
    currency: str
    #: The provider's own vocabulary, reduced by `apps.payouts.services` rather than here — an
    #: adapter that interpreted status would be a second place the state machine lives.
    status: str
    failure_reason: str = ""
    #: Tracking data, recorded but never decided on. RazorpayX fills fees and tax only once a
    #: payout reaches `processing`, and the UTR once the bank has it.
    utr: str = ""
    mode: str = ""
    fees_paise: int | None = None
    tax_paise: int | None = None
    status_reason: str = ""


class PayoutAccountProvider(Protocol):
    """Registering where money goes. Nothing here moves money.

    The full account number is passed straight through to the provider and never returned: the
    provider's fund-account id is the only handle this codebase keeps.
    """

    code: str

    def create_contact(self, *, name: str, reference_id: str) -> str: ...

    def create_fund_account(
        self, *, contact_id: str, holder_name: str, ifsc: str, account_number: str
    ) -> str: ...


class PayoutProvider(Protocol):
    code: str

    def create_payout(
        self,
        *,
        fund_account_id: str,
        amount_paise: int,
        currency: str,
        reference: str,
        idempotency_key: str,
        batch_reference: str,
    ) -> ProviderPayout: ...

    def fetch_payout(self, *, provider_payout_id: str) -> ProviderPayout: ...

    def find_payout_by_reference(self, *, reference: str) -> ProviderPayout | None:
        """The payout created with this `reference_id`, or None if the provider has none."""
        ...

    def verify_webhook(self, *, body: bytes, signature: str) -> bool: ...


class FakePayoutProvider:
    """Deterministic, and deliberately able to produce every outcome the real one can.

    A fake that only ever succeeds tests one branch of a three-branch state machine. The batch
    reference's prefix selects the outcome so a test can ask for an ambiguous or rejected payout
    without patching anything.
    """

    code = "fake"

    def create_payout(
        self,
        *,
        fund_account_id: str,  # noqa: ARG002 - the fake has no account to pay into
        amount_paise: int,
        currency: str,
        reference: str,  # noqa: ARG002 - the fake keeps no record to reconcile against
        idempotency_key: str,
        batch_reference: str,
    ) -> ProviderPayout:
        if batch_reference.startswith("ambiguous"):
            raise PayoutProviderAmbiguousError("The fake provider returned no conclusive answer.")
        if batch_reference.startswith("reject"):
            raise PayoutProviderRejectedError("The fake provider rejected this payout.")
        # `processing`, as RazorpayX answers a new payout: the outcome comes later, by webhook or
        # by `fetch_payout`, never in the create response.
        return ProviderPayout(
            provider_payout_id=f"fake_payout_{idempotency_key}",
            amount_paise=amount_paise,
            currency=currency,
            status="processing",
        )

    def fetch_payout(self, *, provider_payout_id: str) -> ProviderPayout:
        return ProviderPayout(
            provider_payout_id=provider_payout_id,
            amount_paise=0,
            currency="INR",
            status="processed",
        )

    def find_payout_by_reference(self, *, reference: str) -> ProviderPayout | None:  # noqa: ARG002
        # The fake keeps no record, so it has never received anything a lookup could find.
        return None

    def verify_webhook(self, *, body: bytes, signature: str) -> bool:  # noqa: ARG002
        # No signing key to check against; the fixed token is what a test asserts with.
        return signature == "fake-signature"

    def create_contact(self, *, name: str, reference_id: str) -> str:
        if name.lower().startswith("ambiguous"):
            raise PayoutProviderAmbiguousError("The fake provider returned no conclusive answer.")
        return f"fake_contact_{reference_id.replace('-', '')[:20]}"

    def create_fund_account(
        self, *, contact_id: str, holder_name: str, ifsc: str, account_number: str
    ) -> str:
        if holder_name.lower().startswith("reject"):
            raise PayoutProviderRejectedError("The fake provider rejected these bank details.")
        # Derived from the details, as RazorpayX de-duplicates them: the same account twice
        # yields the same id. Hashed so the number itself never appears in the identifier.
        digest = hashlib.sha256(f"{contact_id}:{ifsc}:{account_number}".encode()).hexdigest()
        return f"fake_fa_{digest[:16]}"


class RazorpayXPayoutProvider:
    """RazorpayX Payouts, with bounded I/O and no automatic retry.

    `X-Payout-Idempotency` is the provider's own de-duplication header. Every item carries a
    stable key derived from (batch, ledger entry), so a resubmission after an ambiguous result
    returns the original payout rather than making a second one.
    """

    code = "razorpayx"

    def __init__(self) -> None:
        self._base_url = settings.RAZORPAYX_API_BASE_URL.rstrip("/")
        self._auth = (settings.RAZORPAYX_KEY_ID, settings.RAZORPAYX_KEY_SECRET)
        self._account_number = settings.RAZORPAYX_ACCOUNT_NUMBER
        self._timeout = (
            settings.PAYMENT_PROVIDER_CONNECT_TIMEOUT_SECONDS,
            settings.PAYMENT_PROVIDER_READ_TIMEOUT_SECONDS,
        )

    def _request(
        self,
        method: str,
        path: str,
        *,
        payload: dict[str, object] | None = None,
        headers: dict[str, str] | None = None,
        params: dict[str, str] | None = None,
    ) -> dict[str, object]:
        try:
            response = requests.request(
                method,
                f"{self._base_url}{path}",
                auth=self._auth,
                json=cast(Any, payload),
                headers=headers,
                params=params,
                timeout=self._timeout,
            )
        except (requests.Timeout, requests.ConnectionError) as exc:
            # The request may have been received. Anything other than "we do not know" here
            # would be a guess about whether money left.
            logger.warning(
                "RazorpayX did not answer %s %s",
                method,
                path,
                extra={"error_type": type(exc).__name__},
            )
            raise PayoutProviderAmbiguousError(
                "RazorpayX did not return a conclusive response."
            ) from exc
        if response.status_code >= HTTPStatus.BAD_REQUEST:
            detail = _error_detail(response)
            # Never the request body: it can carry a full bank account number. RazorpayX's error
            # fields name the problem without echoing the input.
            logger.warning(
                "RazorpayX refused %s %s",
                method,
                path,
                extra={
                    "http_status": detail.http_status,
                    "provider_error_code": detail.code,
                    "provider_error_reason": detail.reason,
                    "provider_error_field": detail.field,
                    "provider_error_description": detail.description,
                },
            )
            if response.status_code >= HTTPStatus.INTERNAL_SERVER_ERROR:
                raise PayoutProviderAmbiguousError("RazorpayX returned a temporary server error.")
            said = detail.description or detail.code or "no reason given"
            raise PayoutProviderRejectedError(
                f"RazorpayX rejected the request: {said}", detail=detail
            )
        try:
            data = response.json()
        except requests.JSONDecodeError as exc:
            raise PayoutProviderAmbiguousError("RazorpayX returned an invalid response.") from exc
        if not isinstance(data, dict):
            raise PayoutProviderAmbiguousError("RazorpayX returned an invalid response shape.")
        return cast(dict[str, object], data)

    @staticmethod
    def parse_payout(data: dict[str, object]) -> ProviderPayout:
        identifier = data.get("id")
        amount = data.get("amount")
        if (
            not isinstance(identifier, str)
            or isinstance(amount, bool)
            or not isinstance(amount, int)
        ):
            raise PayoutProviderAmbiguousError("RazorpayX omitted a payout identifier or amount.")
        raw_details = data.get("status_details")
        details: dict[str, object] = (
            cast(dict[str, object], raw_details) if isinstance(raw_details, dict) else {}
        )
        return ProviderPayout(
            provider_payout_id=identifier,
            amount_paise=amount,
            currency=str(data.get("currency", "INR")),
            status=str(data.get("status", "")),
            failure_reason=str(data.get("failure_reason") or details.get("reason") or ""),
            utr=_text(data.get("utr"), 64),
            mode=_text(data.get("mode"), 8),
            fees_paise=_paise(data.get("fees")),
            tax_paise=_paise(data.get("tax")),
            status_reason=_text(details.get("description"), _DETAIL_MAX_LENGTH),
        )

    def create_payout(
        self,
        *,
        fund_account_id: str,
        amount_paise: int,
        currency: str,
        reference: str,
        idempotency_key: str,
        batch_reference: str,
    ) -> ProviderPayout:
        _check_payout_limits(reference=reference, idempotency_key=idempotency_key)
        data = self._request(
            "POST",
            "/payouts",
            payload={
                "account_number": self._account_number,
                "fund_account_id": fund_account_id,
                "amount": amount_paise,
                "currency": currency,
                "mode": "IMPS",
                "purpose": "payout",
                "queue_if_low_balance": True,
                "reference_id": reference,
                "narration": PAYOUT_NARRATION,
                # The run this payout belongs to, for the RazorpayX dashboard. It used to ride in
                # `reference_id`, which RazorpayX caps at 40 characters.
                "notes": {"batch_reference": batch_reference},
            },
            headers={"X-Payout-Idempotency": idempotency_key},
        )
        return self.parse_payout(data)

    def fetch_payout(self, *, provider_payout_id: str) -> ProviderPayout:
        return self.parse_payout(self._request("GET", f"/payouts/{provider_payout_id}"))

    def find_payout_by_reference(self, *, reference: str) -> ProviderPayout | None:
        """RazorpayX's Fetch All Payouts filtered by our `reference_id`.

        How an ambiguous submission is settled without sending it again: if RazorpayX received
        it, a payout with this reference exists and says what happened to it.
        """

        data = self._request(
            "GET",
            "/payouts",
            params={"account_number": self._account_number, "reference_id": reference},
        )
        items = data.get("items")
        if not isinstance(items, list):
            raise PayoutProviderAmbiguousError("RazorpayX returned an invalid payout list.")
        for candidate in items:
            if isinstance(candidate, dict) and candidate.get("reference_id") == reference:
                return self.parse_payout(cast(dict[str, object], candidate))
        return None

    def verify_webhook(self, *, body: bytes, signature: str) -> bool:
        return verify_razorpayx_signature(body=body, signature=signature)

    @staticmethod
    def _identifier(data: dict[str, object], what: str) -> str:
        identifier = data.get("id")
        if not isinstance(identifier, str) or not identifier:
            raise PayoutProviderAmbiguousError(f"RazorpayX omitted the {what} identifier.")
        return identifier

    def create_contact(self, *, name: str, reference_id: str) -> str:
        # `reference_id` is the Partner id, so a contact in the RazorpayX dashboard traces back.
        data = self._request(
            "POST",
            "/contacts",
            payload={"name": name, "type": "vendor", "reference_id": reference_id},
        )
        return self._identifier(data, "contact")

    def create_fund_account(
        self, *, contact_id: str, holder_name: str, ifsc: str, account_number: str
    ) -> str:
        data = self._request(
            "POST",
            "/fund_accounts",
            payload={
                "contact_id": contact_id,
                "account_type": "bank_account",
                "bank_account": {
                    "name": holder_name,
                    "ifsc": ifsc,
                    "account_number": account_number,
                },
            },
        )
        return self._identifier(data, "fund account")


def _check_payout_limits(*, reference: str, idempotency_key: str) -> None:
    """Refuse locally what RazorpayX would refuse anyway, so nothing is sent.

    A rejection here moves no money, exactly like a provider 400, so it takes the same path: the
    item fails and its ledger entry goes back to the pool for a later batch.
    """

    if not _IDEMPOTENCY_KEY.match(idempotency_key):
        raise PayoutProviderRejectedError(
            "The payout idempotency key is outside RazorpayX's limits.",
            detail=ProviderErrorDetail(reason="idempotency_key_invalid"),
        )
    if not reference or len(reference) > REFERENCE_ID_MAX_LENGTH:
        raise PayoutProviderRejectedError(
            "The payout reference is outside RazorpayX's limits.",
            detail=ProviderErrorDetail(reason="reference_id_invalid"),
        )


def _text(value: object, limit: int) -> str:
    return value.strip()[:limit] if isinstance(value, str) else ""


def _paise(value: object) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _error_text(error: dict[str, object], key: str) -> str:
    value = error.get(key)
    if not isinstance(value, str) or value.strip().upper() in ("", "NA"):
        return ""
    return value.strip()[:_DETAIL_MAX_LENGTH]


def _error_detail(response: requests.Response) -> ProviderErrorDetail:
    """RazorpayX's `{"error": {"code", "description", "reason", "field", ...}}`, if it sent one."""

    try:
        data = response.json()
    except (requests.JSONDecodeError, ValueError):
        return ProviderErrorDetail(http_status=response.status_code)
    error = data.get("error") if isinstance(data, dict) else None
    if not isinstance(error, dict):
        return ProviderErrorDetail(http_status=response.status_code)
    error = cast(dict[str, object], error)
    return ProviderErrorDetail(
        http_status=response.status_code,
        code=_error_text(error, "code"),
        reason=_error_text(error, "reason"),
        field=_error_text(error, "field"),
        description=_error_text(error, "description"),
    )


def verify_razorpayx_signature(*, body: bytes, signature: str) -> bool:
    """HMAC-SHA256 of the raw body with `RAZORPAYX_WEBHOOK_SECRET`.

    Refuses outright while the secret is unset. An empty key is a key anyone can sign with, so
    "not configured" must never compare equal to a forged signature.
    """

    secret = settings.RAZORPAYX_WEBHOOK_SECRET
    if not secret or not signature:
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


#: Cashfree's own vocabulary reduced to the one `apps.payouts.services` decides on, which is
#: RazorpayX's. Only the words change here; which of them is final is still decided in services.
#: `SUCCESS` counts as paid only with status code `COMPLETED`: Cashfree documents a transfer as
#: successful only then, so any other `SUCCESS` stays in flight until a poll or webhook says so.
_CASHFREE_STATUSES: dict[str, str] = {
    "RECEIVED": "processing",
    "PENDING": "processing",
    "APPROVAL_PENDING": "pending",
    "VALIDATION_PENDING": "pending",
    "SUCCESS": "processed",
    "FAILED": "failed",
    "REJECTED": "rejected",
    "MANUALLY_REJECTED": "rejected",
    "REVERSED": "reversed",
}
_CASHFREE_COMPLETED = "COMPLETED"
#: `beneficiary_name`: alphabets and whitespace only, at most 100.
_CASHFREE_NAME_DISALLOWED = re.compile(r"[^A-Za-z ]+")
_CASHFREE_NAME_MAX_LENGTH = 100
#: `transfer_id`: letters, digits and underscore, at most 40.
_CASHFREE_TRANSFER_ID = re.compile(r"^[A-Za-z0-9_]{1,40}$")
#: `transfer_remarks`, shown on the Partner's statement, at most 70.
CASHFREE_TRANSFER_REMARKS = PAYOUT_NARRATION
#: 409 codes that mean "you already sent exactly this", so the earlier result stands.
_CASHFREE_DUPLICATE_BENEFICIARY = "beneficiary_id_already_exists"
#: 409 when the same bank account and IFSC are already a beneficiary under a *different* id.
_CASHFREE_ACCOUNT_ALREADY_BENEFICIARY = "conflict_with_existing_beneficiary"
_CASHFREE_DUPLICATE_TRANSFER = "transfer_id_already_exists"
_CASHFREE_TRANSFER_NOT_FOUND = "transfer_id_not_found"


def cashfree_status(status: object, status_code: object) -> str:
    """Cashfree's `status` and `status_code` in the shared vocabulary; unknown stays as sent."""

    raw = str(status or "").strip().upper()
    if raw == "SUCCESS" and str(status_code or "").strip().upper() != _CASHFREE_COMPLETED:
        return "processing"
    return _CASHFREE_STATUSES.get(raw, raw.lower())


def _rupees_to_paise(value: object) -> int | None:
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        return None
    try:
        paise = (Decimal(str(value)) * 100).quantize(Decimal(1), rounding=ROUND_HALF_UP)
    except InvalidOperation:
        return None
    return int(paise)


def _paise_to_rupees(paise: int) -> float:
    # Exact for every whole-paise amount: two decimals always round-trip through a float.
    return float(Decimal(paise) / 100)


class CashfreePayoutProvider:
    """Cashfree Payouts (API v2), with bounded I/O and no automatic retry.

    Cashfree has no separate contact: a beneficiary is the bank account. `create_contact` only
    names the Partner, and `create_fund_account` registers the beneficiary under an id derived
    from the Partner and the account, so registering the same account twice finds the first.

    Idempotency is `transfer_id`, which Cashfree refuses to reuse. It is our item reference, so a
    resubmission finds the original transfer rather than making a second one, and
    `find_payout_by_reference` settles an ambiguous submission by the same id.

    Every request is authenticated by IP whitelisting on Cashfree's side, or, when
    `CASHFREE_PAYOUT_PUBLIC_KEY` is set, by the `X-Cf-Signature` 2FA header.
    """

    code = "cashfree"

    def __init__(self) -> None:
        self._base_url = settings.CASHFREE_PAYOUT_API_BASE_URL.rstrip("/")
        self._client_id = settings.CASHFREE_PAYOUT_CLIENT_ID
        self._client_secret = settings.CASHFREE_PAYOUT_CLIENT_SECRET
        self._public_key = settings.CASHFREE_PAYOUT_PUBLIC_KEY
        self._timeout = (
            settings.PAYMENT_PROVIDER_CONNECT_TIMEOUT_SECONDS,
            settings.PAYMENT_PROVIDER_READ_TIMEOUT_SECONDS,
        )

    def _headers(self) -> dict[str, str]:
        headers = {
            "x-client-id": self._client_id,
            "x-client-secret": self._client_secret,
            "x-api-version": settings.CASHFREE_PAYOUT_API_VERSION,
        }
        if self._public_key:
            headers["x-cf-signature"] = cashfree_2fa_signature(
                client_id=self._client_id, public_key_pem=self._public_key
            )
        return headers

    def _send(
        self,
        method: str,
        path: str,
        *,
        payload: dict[str, object] | None = None,
        params: dict[str, str] | None = None,
    ) -> requests.Response:
        try:
            return requests.request(
                method,
                f"{self._base_url}{path}",
                json=cast(Any, payload),
                headers=self._headers(),
                params=params,
                timeout=self._timeout,
            )
        except (requests.Timeout, requests.ConnectionError) as exc:
            logger.warning(
                "Cashfree did not answer %s %s",
                method,
                path,
                extra={"error_type": type(exc).__name__},
            )
            raise PayoutProviderAmbiguousError(
                "Cashfree did not return a conclusive response."
            ) from exc

    @staticmethod
    def _json(response: requests.Response) -> dict[str, object]:
        try:
            data = response.json()
        except (requests.JSONDecodeError, ValueError) as exc:
            raise PayoutProviderAmbiguousError("Cashfree returned an invalid response.") from exc
        if not isinstance(data, dict):
            raise PayoutProviderAmbiguousError("Cashfree returned an invalid response shape.")
        return cast(dict[str, object], data)

    def _request(
        self,
        method: str,
        path: str,
        *,
        payload: dict[str, object] | None = None,
        params: dict[str, str] | None = None,
        accept_codes: tuple[str, ...] = (),
    ) -> tuple[dict[str, object], str]:
        """The decoded body, and the error code when it was one of `accept_codes`."""

        response = self._send(method, path, payload=payload, params=params)
        if response.status_code < HTTPStatus.BAD_REQUEST:
            return self._json(response), ""
        detail = _cashfree_error_detail(response)
        if detail.code in accept_codes:
            return {}, detail.code
        # Never the request body: it carries a full bank account number.
        logger.warning(
            "Cashfree refused %s %s",
            method,
            path,
            extra={
                "http_status": detail.http_status,
                "provider_error_code": detail.code,
                "provider_error_reason": detail.reason,
                "provider_error_description": detail.description,
            },
        )
        if response.status_code >= HTTPStatus.INTERNAL_SERVER_ERROR:
            raise PayoutProviderAmbiguousError("Cashfree returned a temporary server error.")
        said = detail.description or detail.code or "no reason given"
        raise PayoutProviderRejectedError(f"Cashfree rejected the request: {said}", detail=detail)

    @staticmethod
    def parse_transfer(data: dict[str, object]) -> ProviderPayout:
        identifier = data.get("cf_transfer_id")
        amount = _rupees_to_paise(data.get("transfer_amount"))
        if isinstance(identifier, int) and not isinstance(identifier, bool):
            identifier = str(identifier)
        if not isinstance(identifier, str) or not identifier or amount is None:
            raise PayoutProviderAmbiguousError("Cashfree omitted a transfer identifier or amount.")
        status = cashfree_status(data.get("status"), data.get("status_code"))
        description = _text(data.get("status_description"), _DETAIL_MAX_LENGTH)
        final_failure = status in ("failed", "rejected", "reversed")
        return ProviderPayout(
            provider_payout_id=identifier,
            amount_paise=amount,
            currency=str(data.get("transfer_currency") or "INR"),
            status=status,
            failure_reason=_text(data.get("status_code"), 64) if final_failure else "",
            utr=_text(data.get("transfer_utr"), 64),
            mode=_text(data.get("transfer_mode"), 8),
            fees_paise=_rupees_to_paise(data.get("transfer_service_charge")),
            tax_paise=_rupees_to_paise(data.get("transfer_service_tax")),
            status_reason=description,
        )

    def create_payout(
        self,
        *,
        fund_account_id: str,
        amount_paise: int,
        currency: str,
        reference: str,
        idempotency_key: str,  # noqa: ARG002 - Cashfree's idempotency is `transfer_id`
        batch_reference: str,  # noqa: ARG002 - Cashfree has no notes field on a transfer
    ) -> ProviderPayout:
        if not _CASHFREE_TRANSFER_ID.match(reference):
            raise PayoutProviderRejectedError(
                "The payout reference is outside Cashfree's limits.",
                detail=ProviderErrorDetail(reason="transfer_id_invalid"),
            )
        data, duplicate = self._request(
            "POST",
            "/transfers",
            payload={
                "transfer_id": reference,
                "transfer_amount": _paise_to_rupees(amount_paise),
                "transfer_currency": currency,
                "transfer_mode": "imps",
                "beneficiary_details": {"beneficiary_id": fund_account_id},
                "transfer_remarks": CASHFREE_TRANSFER_REMARKS,
            },
            accept_codes=(_CASHFREE_DUPLICATE_TRANSFER,),
        )
        if duplicate:
            # Sent before under this id: the original transfer is the answer, never a new one.
            found = self.find_payout_by_reference(reference=reference)
            if found is None:
                raise PayoutProviderAmbiguousError("Cashfree reported a duplicate it cannot find.")
            return found
        return self.parse_transfer(data)

    def fetch_payout(self, *, provider_payout_id: str) -> ProviderPayout:
        data, _ = self._request("GET", "/transfers", params={"cf_transfer_id": provider_payout_id})
        return self.parse_transfer(data)

    def find_payout_by_reference(self, *, reference: str) -> ProviderPayout | None:
        data, missing = self._request(
            "GET",
            "/transfers",
            params={"transfer_id": reference},
            accept_codes=(_CASHFREE_TRANSFER_NOT_FOUND,),
        )
        if missing:
            return None
        return self.parse_transfer(data)

    def verify_webhook(self, *, body: bytes, signature: str) -> bool:  # noqa: ARG002
        # Cashfree signs the timestamp with the body; `verify_cashfree_signature` takes both.
        return False

    def create_contact(self, *, name: str, reference_id: str) -> str:  # noqa: ARG002
        # No contact object at Cashfree. The Partner id, compacted, prefixes the beneficiary.
        return "vsh" + reference_id.replace("-", "")[:32]

    def create_fund_account(
        self, *, contact_id: str, holder_name: str, ifsc: str, account_number: str
    ) -> str:
        # Derived from the details, so the same account twice is the same beneficiary. Hashed so
        # the number itself never appears in the identifier. 35 + 1 + 14 = 50, Cashfree's limit.
        digest = hashlib.sha256(f"{ifsc}:{account_number}".encode()).hexdigest()[:14]
        beneficiary_id = f"{contact_id}_{digest}"
        name = " ".join(_CASHFREE_NAME_DISALLOWED.sub(" ", holder_name).split())
        _, duplicate = self._request(
            "POST",
            "/beneficiary",
            payload={
                "beneficiary_id": beneficiary_id,
                "beneficiary_name": name[:_CASHFREE_NAME_MAX_LENGTH],
                "beneficiary_instrument_details": {
                    "bank_account_number": account_number,
                    "bank_ifsc": ifsc,
                },
            },
            accept_codes=(_CASHFREE_DUPLICATE_BENEFICIARY, _CASHFREE_ACCOUNT_ALREADY_BENEFICIARY),
        )
        if duplicate == _CASHFREE_ACCOUNT_ALREADY_BENEFICIARY:
            # Cashfree keeps one beneficiary per bank account. The existing one is returned, not
            # trusted: `apps.payouts.services` refuses it if another Partner's live account uses
            # it, so this only ever re-adopts one nobody here holds (a deleted Partner, a reset
            # database, or one added in the dashboard).
            return self._beneficiary_for_account(ifsc=ifsc, account_number=account_number)
        # Same id means same Partner and same account: the earlier one stands.
        return beneficiary_id

    def _beneficiary_for_account(self, *, ifsc: str, account_number: str) -> str:
        data, _ = self._request(
            "GET",
            "/beneficiary",
            params={"bank_account_number": account_number, "bank_ifsc": ifsc},
        )
        existing = data.get("beneficiary_id")
        if not isinstance(existing, str) or not existing:
            raise PayoutProviderAmbiguousError(
                "Cashfree reported an existing beneficiary it cannot find."
            )
        logger.info("Cashfree bank account already a beneficiary; reusing it")
        return existing


def cashfree_2fa_signature(*, client_id: str, public_key_pem: str) -> str:
    """`X-Cf-Signature`: RSA-OAEP (SHA-1) of `<client id>.<unix time>` with Cashfree's key.

    Valid for five minutes, so it is made fresh for every request.
    """

    key = serialization.load_pem_public_key(public_key_pem.encode())
    if not isinstance(key, rsa.RSAPublicKey):
        raise PayoutProviderError("CASHFREE_PAYOUT_PUBLIC_KEY is not an RSA public key.")
    message = f"{client_id}.{int(time.time())}".encode()
    # SHA-1 is Cashfree's published OAEP scheme for this header; it is not a choice made here.
    sha1 = hashes.SHA1()  # noqa: S303
    encrypted = key.encrypt(
        message, padding.OAEP(mgf=padding.MGF1(algorithm=sha1), algorithm=sha1, label=None)
    )
    return base64.b64encode(encrypted).decode()


def verify_cashfree_signature(*, body: bytes, signature: str, timestamp: str) -> bool:
    """Base64 HMAC-SHA256 of `timestamp + raw body`, keyed with the Payouts client secret.

    Refuses outright while the secret is unset, for the same reason as RazorpayX's.
    """

    secret = settings.CASHFREE_PAYOUT_CLIENT_SECRET
    if not secret or not signature or not timestamp:
        return False
    digest = hmac.new(secret.encode(), timestamp.encode() + body, hashlib.sha256).digest()
    return hmac.compare_digest(base64.b64encode(digest).decode(), signature)


def _cashfree_error_detail(response: requests.Response) -> ProviderErrorDetail:
    """Cashfree's `{"code", "message", "type"}` error body, if it sent one."""

    try:
        data = response.json()
    except (requests.JSONDecodeError, ValueError):
        return ProviderErrorDetail(http_status=response.status_code)
    if not isinstance(data, dict):
        return ProviderErrorDetail(http_status=response.status_code)
    error = cast(dict[str, object], data)
    return ProviderErrorDetail(
        http_status=response.status_code,
        code=_error_text(error, "code"),
        reason=_error_text(error, "type"),
        description=_error_text(error, "message"),
    )


@dataclass(frozen=True, slots=True)
class BankAccountCheck:
    """What the bank said about an account, before any money is sent to it.

    `name_at_bank` is the account holder's name as the bank holds it, which is the one thing a
    reviewer cannot get from the Partner. The match result compares it with the name the Partner
    typed, so it says the two agree, not that either is the Partner's own.
    """

    is_valid: bool
    #: `ACCOUNT_IS_VALID`, `INVALID_ACCOUNT_FAIL`, `ACCOUNT_BLOCKED`, `INVALID_IFSC_FAIL`,
    #: `NRE_ACCOUNT_FAIL`, or `FRAUD_ACCOUNT` when Cashfree refused it as one.
    status_code: str
    name_at_bank: str = ""
    #: `DIRECT_MATCH`, `GOOD_PARTIAL_MATCH`, `MODERATE_PARTIAL_MATCH`, `POOR_PARTIAL_MATCH`,
    #: `NO_MATCH`, or empty when the bank gave no name.
    name_match_result: str = ""
    name_match_score: str = ""
    reference: str = ""


class BankAccountVerifier(Protocol):
    """Asks the bank whether an account exists and whose it is. Moves none of our money."""

    code: str

    def verify_bank_account(
        self, *, account_number: str, ifsc: str, holder_name: str
    ) -> BankAccountCheck: ...


class FakeBankAccountVerifier:
    """Deterministic: the holder name's first word picks the bank's answer.

    `Invalid …` is an account the bank does not have, `Mismatch …` is one held by somebody else,
    `Unreachable …` is a check that could not finish. Anything else is valid and in that name.
    """

    code = "fake"

    def verify_bank_account(
        self,
        *,
        account_number: str,  # noqa: ARG002 - the fake has no bank to look it up in
        ifsc: str,  # noqa: ARG002
        holder_name: str,
    ) -> BankAccountCheck:
        first = holder_name.split(" ", 1)[0].lower()
        if first == "unreachable":
            raise PayoutProviderAmbiguousError("The fake bank check could not finish.")
        if first == "invalid":
            return BankAccountCheck(is_valid=False, status_code="INVALID_ACCOUNT_FAIL")
        if first == "mismatch":
            return BankAccountCheck(
                is_valid=True,
                status_code="ACCOUNT_IS_VALID",
                name_at_bank="SOMEONE ELSE",
                name_match_result="NO_MATCH",
                name_match_score="0.00",
                reference="fake_bav_mismatch",
            )
        return BankAccountCheck(
            is_valid=True,
            status_code="ACCOUNT_IS_VALID",
            name_at_bank=holder_name.upper(),
            name_match_result="DIRECT_MATCH",
            name_match_score="100.00",
            reference="fake_bav",
        )


#: Cashfree BAV `name`: letters, digits, space and `. - / &`, at most 100.
_CASHFREE_BAV_NAME_DISALLOWED = re.compile(r"[^A-Za-z0-9 .\-/&]+")
_CASHFREE_BAV_NAME_MAX_LENGTH = 100
#: A 422 that means the bank told Cashfree no about the account itself, so it is an answer.
_CASHFREE_BAV_FRAUD = "fraud_account"
#: A 422 that means the check did not finish (bank, NPCI or Cashfree): ask again later.
_CASHFREE_BAV_UNFINISHED = frozenset(
    {
        "insufficient_balance",
        "verification_already_under_process",
        "failed_at_bank",
        "npci_unavailable",
        "connection_timeout",
        "source_bank_declined",
        "bene_bank_declined",
        "imps_mode_fail",
        "benficiary_bank_offline",
        "beneficiary_bank_offline",
    }
)
#: Cashfree's 400 codes for the account details themselves, rather than for our request.
_CASHFREE_BAV_BAD_DETAILS = frozenset(
    {
        "bank_account_length_exceeded",
        "bank_account_length_short",
        "bank_account_value_invalid",
        "ifsc_value_invalid",
    }
)


class CashfreeBankAccountVerifier:
    """Cashfree Bank Account Verification V2 (sync), with bounded I/O and no automatic retry.

    It is Cashfree's Secure ID product, with its own keys (`CASHFREE_VERIFICATION_*`), not the
    Payouts ones. An invalid or blocked account is a `200` with `account_status: INVALID`, which
    is an answer; a `422` is either a fraud flag (also an answer) or a check that did not finish.
    Nothing here is worth retrying automatically: the Partner submits again.
    """

    code = "cashfree"

    def __init__(self) -> None:
        self._base_url = settings.CASHFREE_VERIFICATION_API_BASE_URL.rstrip("/")
        self._client_id = settings.CASHFREE_VERIFICATION_CLIENT_ID
        self._client_secret = settings.CASHFREE_VERIFICATION_CLIENT_SECRET
        self._public_key = settings.CASHFREE_VERIFICATION_PUBLIC_KEY
        self._timeout = (
            settings.PAYMENT_PROVIDER_CONNECT_TIMEOUT_SECONDS,
            settings.CASHFREE_VERIFICATION_READ_TIMEOUT_SECONDS,
        )

    def _headers(self) -> dict[str, str]:
        headers = {"x-client-id": self._client_id, "x-client-secret": self._client_secret}
        if self._public_key:
            headers["x-cf-signature"] = cashfree_2fa_signature(
                client_id=self._client_id, public_key_pem=self._public_key
            )
        return headers

    def verify_bank_account(
        self, *, account_number: str, ifsc: str, holder_name: str
    ) -> BankAccountCheck:
        name = " ".join(_CASHFREE_BAV_NAME_DISALLOWED.sub(" ", holder_name).split())
        try:
            response = requests.post(
                f"{self._base_url}/bank-account/sync",
                json={
                    "bank_account": account_number,
                    "ifsc": ifsc,
                    "name": name[:_CASHFREE_BAV_NAME_MAX_LENGTH],
                },
                headers=self._headers(),
                timeout=self._timeout,
            )
        except (requests.Timeout, requests.ConnectionError) as exc:
            logger.warning(
                "Cashfree bank account verification did not answer",
                extra={"error_type": type(exc).__name__},
            )
            raise PayoutProviderAmbiguousError("The bank check did not answer.") from exc

        if response.status_code == HTTPStatus.OK:
            return self.parse_check(CashfreePayoutProvider._json(response))
        detail = _cashfree_error_detail(response)
        # Never the request body: it carries a full bank account number.
        logger.warning(
            "Cashfree bank account verification refused",
            extra={
                "http_status": detail.http_status,
                "provider_error_code": detail.code,
                "provider_error_reason": detail.reason,
            },
        )
        if detail.code == _CASHFREE_BAV_FRAUD:
            return BankAccountCheck(is_valid=False, status_code="FRAUD_ACCOUNT")
        if detail.code in _CASHFREE_BAV_UNFINISHED or (
            response.status_code == HTTPStatus.TOO_MANY_REQUESTS
            or response.status_code >= HTTPStatus.INTERNAL_SERVER_ERROR
        ):
            raise PayoutProviderAmbiguousError("The bank check could not finish.")
        if detail.code in _CASHFREE_BAV_BAD_DETAILS:
            raise PayoutProviderRejectedError("Cashfree refused these bank details.", detail=detail)
        # Credentials, IP whitelist, 2FA, or the product not enabled: ours to fix, not the
        # Partner's, and not worth their retrying.
        raise PayoutProviderError(
            f"Cashfree bank account verification is misconfigured: {detail.code or 'unknown'}"
        )

    @staticmethod
    def parse_check(data: dict[str, object]) -> BankAccountCheck:
        status = str(data.get("account_status") or "").strip().upper()
        if status not in ("VALID", "INVALID"):
            raise PayoutProviderAmbiguousError("Cashfree returned no account status.")
        return BankAccountCheck(
            is_valid=status == "VALID",
            status_code=_scalar_text(data.get("account_status_code"), 32).upper(),
            name_at_bank=_scalar_text(data.get("name_at_bank"), 140),
            name_match_result=_scalar_text(data.get("name_match_result"), 32).upper(),
            name_match_score=_scalar_text(data.get("name_match_score"), 8),
            reference=_scalar_text(data.get("reference_id"), 64),
        )


def _scalar_text(value: object, limit: int) -> str:
    """A string or number as text; null, booleans and objects as empty."""

    if isinstance(value, bool) or not isinstance(value, (str, int, float)):
        return ""
    return str(value).strip()[:limit]


def get_bank_account_verifier(*, provider_code: str | None = None) -> BankAccountVerifier | None:
    """The bank check for the configured payout provider, or None where there is none.

    None only for RazorpayX, which is not checked here: that is a stated gap, not a fallback.
    Cashfree without its verification keys is refused rather than skipped, so a production
    deployment cannot quietly register accounts nobody asked the bank about.
    """

    code = provider_code or settings.PAYOUT_PROVIDER
    if code == FakePayoutProvider.code:
        if not settings.DEBUG and not settings.PAYOUTS_ALLOW_FAKE_PROVIDER:
            raise PayoutProviderError(
                "The fake payout provider is not permitted outside development."
            )
        return FakeBankAccountVerifier()
    if code == CashfreePayoutProvider.code:
        if not (
            settings.CASHFREE_VERIFICATION_CLIENT_ID
            and settings.CASHFREE_VERIFICATION_CLIENT_SECRET
        ):
            raise PayoutProviderError(
                "Cashfree bank account verification credentials are not configured."
            )
        return CashfreeBankAccountVerifier()
    if code == RazorpayXPayoutProvider.code:
        return None
    raise PayoutProviderError("No payout provider is configured for this environment.")


def bank_check_required(*, provider_code: str | None = None) -> bool:
    """Whether an account must carry a bank check before Operations may verify it."""

    return (provider_code or settings.PAYOUT_PROVIDER) == CashfreePayoutProvider.code


def get_payout_account_provider(*, provider_code: str | None = None) -> PayoutAccountProvider:
    """The provider that registers bank accounts.

    Deliberately looser than `get_payout_provider`: a contact and a fund account move no money,
    so credentials are enough and `PAYOUTS_LIVE_ENABLED` is not required. Partners can be
    onboarded while payouts themselves stay switched off.
    """

    code = provider_code or settings.PAYOUT_PROVIDER
    if code == FakePayoutProvider.code:
        if not settings.DEBUG and not settings.PAYOUTS_ALLOW_FAKE_PROVIDER:
            raise PayoutProviderError(
                "The fake payout provider is not permitted outside development."
            )
        return FakePayoutProvider()
    if code == RazorpayXPayoutProvider.code:
        if not (settings.RAZORPAYX_KEY_ID and settings.RAZORPAYX_KEY_SECRET):
            raise PayoutProviderError("RazorpayX credentials are not configured.")
        return RazorpayXPayoutProvider()
    if code == CashfreePayoutProvider.code:
        if not (settings.CASHFREE_PAYOUT_CLIENT_ID and settings.CASHFREE_PAYOUT_CLIENT_SECRET):
            raise PayoutProviderError("Cashfree Payouts credentials are not configured.")
        return CashfreePayoutProvider()
    raise PayoutProviderError("No payout provider is configured for this environment.")


def get_payout_provider(*, provider_code: str | None = None) -> PayoutProvider:
    """Fail closed, and more strictly than payments do.

    A wrong capture can be refunded; a wrong payout has already left the building. So production
    refuses to start paying without credentials *and* an explicit activation flag — a deployment
    that merely has keys configured is not the same as one somebody decided to turn on.
    """

    code = provider_code or settings.PAYOUT_PROVIDER
    if code == FakePayoutProvider.code:
        if not settings.DEBUG and not settings.PAYOUTS_ALLOW_FAKE_PROVIDER:
            raise PayoutProviderError(
                "The fake payout provider is not permitted outside development."
            )
        return FakePayoutProvider()
    if code == RazorpayXPayoutProvider.code:
        if not (settings.RAZORPAYX_KEY_ID and settings.RAZORPAYX_KEY_SECRET):
            raise PayoutProviderError("RazorpayX credentials are not configured.")
        if not settings.PAYOUTS_LIVE_ENABLED:
            raise PayoutProviderError(
                "Live payouts are not enabled for this deployment. Credentials alone are not "
                "activation."
            )
        return RazorpayXPayoutProvider()
    if code == CashfreePayoutProvider.code:
        if not (settings.CASHFREE_PAYOUT_CLIENT_ID and settings.CASHFREE_PAYOUT_CLIENT_SECRET):
            raise PayoutProviderError("Cashfree Payouts credentials are not configured.")
        if not settings.PAYOUTS_LIVE_ENABLED:
            raise PayoutProviderError(
                "Live payouts are not enabled for this deployment. Credentials alone are not "
                "activation."
            )
        return CashfreePayoutProvider()
    raise PayoutProviderError("No payout provider is configured for this environment.")
