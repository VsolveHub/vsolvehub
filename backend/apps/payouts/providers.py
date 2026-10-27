"""Payout provider boundary: RazorpayX in production, a deterministic fake everywhere else.

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

import hashlib
import hmac
import logging
import re
from dataclasses import dataclass
from http import HTTPStatus
from typing import Any, Protocol, cast

import requests
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
    def _payout(data: dict[str, object]) -> ProviderPayout:
        identifier = data.get("id")
        amount = data.get("amount")
        if (
            not isinstance(identifier, str)
            or isinstance(amount, bool)
            or not isinstance(amount, int)
        ):
            raise PayoutProviderAmbiguousError("RazorpayX omitted a payout identifier or amount.")
        return ProviderPayout(
            provider_payout_id=identifier,
            amount_paise=amount,
            currency=str(data.get("currency", "INR")),
            status=str(data.get("status", "")),
            failure_reason=str(data.get("failure_reason") or ""),
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
    raise PayoutProviderError("No payout provider is configured for this environment.")
