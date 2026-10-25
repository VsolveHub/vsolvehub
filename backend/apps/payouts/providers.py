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
from dataclasses import dataclass
from http import HTTPStatus
from typing import Any, Protocol, cast

import requests
from django.conf import settings


class PayoutProviderError(RuntimeError):
    """The provider could not be used at all."""


class PayoutProviderAmbiguousError(PayoutProviderError):
    """We do not know whether money moved. Never retried automatically."""


class PayoutProviderRejectedError(PayoutProviderError):
    """The provider explicitly refused. No money moved, so a retry is safe."""


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
    ) -> ProviderPayout: ...

    def fetch_payout(self, *, provider_payout_id: str) -> ProviderPayout: ...

    def verify_webhook(self, *, body: bytes, signature: str) -> bool: ...


class FakePayoutProvider:
    """Deterministic, and deliberately able to produce every outcome the real one can.

    A fake that only ever succeeds tests one branch of a three-branch state machine. The
    reference prefix selects the outcome so a test can ask for an ambiguous or rejected payout
    without patching anything.
    """

    code = "fake"

    def create_payout(
        self,
        *,
        fund_account_id: str,  # noqa: ARG002 - the fake has no account to pay into
        amount_paise: int,
        currency: str,
        reference: str,
        idempotency_key: str,
    ) -> ProviderPayout:
        if reference.startswith("ambiguous"):
            raise PayoutProviderAmbiguousError("The fake provider returned no conclusive answer.")
        if reference.startswith("reject"):
            raise PayoutProviderRejectedError("The fake provider rejected this payout.")
        return ProviderPayout(
            provider_payout_id=f"fake_payout_{idempotency_key}",
            amount_paise=amount_paise,
            currency=currency,
            status="processed",
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
                timeout=self._timeout,
            )
        except (requests.Timeout, requests.ConnectionError) as exc:
            # The request may have been received. Anything other than "we do not know" here
            # would be a guess about whether money left.
            raise PayoutProviderAmbiguousError(
                "RazorpayX did not return a conclusive response."
            ) from exc
        if response.status_code >= HTTPStatus.INTERNAL_SERVER_ERROR:
            raise PayoutProviderAmbiguousError("RazorpayX returned a temporary server error.")
        if response.status_code >= HTTPStatus.BAD_REQUEST:
            raise PayoutProviderRejectedError("RazorpayX rejected the payout command.")
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
    ) -> ProviderPayout:
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
            },
            headers={"X-Payout-Idempotency": idempotency_key},
        )
        return self._payout(data)

    def fetch_payout(self, *, provider_payout_id: str) -> ProviderPayout:
        return self._payout(self._request("GET", f"/payouts/{provider_payout_id}"))

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
