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
        del phone_number, code, purpose


class UnconfiguredOtpSender:
    def send(self, phone_number: str, code: str, purpose: str) -> None:
        del phone_number, code, purpose
        raise OtpDeliveryError("OTP delivery provider is not configured.")


class Msg91OtpSender:
    """Sends the login code through MSG91. Does not log the code."""

    def send(self, phone_number: str, code: str, purpose: str) -> None:
        auth_key = settings.MSG91_AUTH_KEY
        template_id = settings.MSG91_OTP_TEMPLATE_ID
        if not auth_key or not template_id:
            raise OtpDeliveryError("MSG91 OTP is not configured.")
        mobile = phone_number.removeprefix("+")
        payload = json.dumps(
            {
                "template_id": template_id,
                "short_url": "0",
                "recipients": [{"mobiles": mobile, "otp": code, "purpose": purpose}],
            }
        ).encode()
        request = Request(  # noqa: S310
            f"{settings.MSG91_API_BASE_URL}/flow/",
            data=payload,
            headers={"authkey": auth_key, "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=10) as response:  # noqa: S310
                response.read()
        except URLError as exc:
            raise OtpDeliveryError("MSG91 did not accept the OTP.") from exc


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
