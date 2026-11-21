"""OTP delivery adapters.

The development adapter deliberately does not log the code. The API may return it only when the
environment-specific development flag is enabled. MSG91 is used when `OTP_PROVIDER=msg91` and
`MSG91_AUTH_KEY` is set. Until those values arrive, that provider refuses.
"""

import json
from typing import Protocol
from urllib.error import URLError
from urllib.request import Request, urlopen

from django.conf import settings

from apps.identity.models import OtpChallenge


class OtpDeliveryError(RuntimeError):
    """Raised when an OTP provider cannot accept a delivery request."""


class OtpSender(Protocol):
    def send(self, phone_number: str, code: str, purpose: str) -> None: ...


class DevelopmentOtpSender:
    def send(self, phone_number: str, code: str, purpose: str) -> None:
        # Local-only sender: production settings refuse OTP_PROVIDER="development".
        print(  # noqa: T201
            f"\n[DEV OTP] Phone: {phone_number} | Code: {code} | Purpose: {purpose}\n", flush=True
        )


class UnconfiguredOtpSender:
    def send(self, phone_number: str, code: str, purpose: str) -> None:
        del phone_number, code, purpose
        raise OtpDeliveryError("OTP delivery provider is not configured.")


#: E.164 prefix of the only numbers the DLT-registered MSG91 templates reach.
_INDIA_PREFIX = "+91"


def _msg91_template_for(purpose: str) -> str:
    """The DLT template registered for this purpose, or "" when there is none.

    Each purpose has its own approved wording, so a code is never sent in another purpose's text:
    the login template says "to log in", which would be wrong on a visit's start code.
    """

    templates = {
        OtpChallenge.Purpose.LOGIN: settings.MSG91_OTP_TEMPLATE_ID,
        "booking_start": settings.MSG91_START_OTP_TEMPLATE_ID,
    }
    return str(templates.get(purpose, "") or "")


class Msg91OtpSender:
    """Sends a one-time code through MSG91 Flow. Does not log the code."""

    def send(self, phone_number: str, code: str, purpose: str) -> None:
        auth_key = settings.MSG91_AUTH_KEY
        template_id = _msg91_template_for(purpose)
        if not auth_key or not template_id:
            raise OtpDeliveryError("MSG91 OTP is not configured for this purpose.")
        if not phone_number.startswith(_INDIA_PREFIX):
            # The DLT template covers Indian numbers only, and an international SMS is how OTP
            # endpoints get abused for toll fraud. Refuse rather than send one.
            raise OtpDeliveryError("MSG91 OTP is sent to Indian numbers only.")
        mobile = phone_number.removeprefix("+")
        payload = json.dumps(
            {
                "template_id": template_id,
                "short_url": "0",
                "recipients": [{"mobiles": mobile, "otp": code}],
            }
        ).encode()
        request = Request(  # noqa: S310
            f"{settings.MSG91_API_BASE_URL}/flow/",
            data=payload,
            headers={
                "authkey": auth_key,
                "Content-Type": "application/json",
                "accept": "application/json",
            },
            method="POST",
        )
        try:
            with urlopen(request, timeout=10) as response:  # noqa: S310
                body = response.read().decode()
        except URLError as exc:
            raise OtpDeliveryError("MSG91 did not accept the OTP.") from exc
        # MSG91 answers HTTP 200 for some refusals (a wrong template id, a DLT mismatch, no
        # balance) with `{"type": "error"}` in the body. Only `"success"` means it was accepted.
        try:
            answer = json.loads(body)
        except ValueError:
            answer = {}
        if not isinstance(answer, dict) or str(answer.get("type", "")).lower() != "success":
            raise OtpDeliveryError("MSG91 refused the OTP.")


def get_otp_sender() -> OtpSender:
    senders: dict[str, OtpSender] = {
        "development": DevelopmentOtpSender(),
        "unconfigured": UnconfiguredOtpSender(),
        "msg91": Msg91OtpSender(),
    }
    try:
        return senders[settings.OTP_PROVIDER]
    except KeyError as exc:
        raise OtpDeliveryError("Unknown OTP delivery provider.") from exc


def mark_delivery_failed(challenge: OtpChallenge, failure_code: str) -> None:
    challenge.delivery_status = OtpChallenge.DeliveryStatus.FAILED
    challenge.delivery_failure_code = failure_code[:64]
    challenge.save(update_fields=("delivery_status", "delivery_failure_code"))
